"""
LLDP topology crawler using snmpwalk subprocess.
Zero Python SNMP library dependencies — uses the system snmpwalk binary.
"""

import asyncio
import logging
import subprocess
import re
from typing import Optional

log = logging.getLogger(__name__)


def _snmpwalk(ip: str, oid: str, community: str, version: str, timeout: int = 5) -> dict:
    """
    Run snmpwalk and return {oid_suffix: value} dict.
    Output format: iso.x.y.z = Type: value
    """
    ver_flag = "2c" if version in ("2c", "2") else "1"
    try:
        r = subprocess.run(
            ["snmpwalk", "-v", ver_flag, "-c", community,
             "-t", str(timeout), "-r", "1", "-On",  # -On = numeric OIDs
             ip, oid],
            capture_output=True, text=True, timeout=timeout + 3
        )
        if r.returncode != 0 and not r.stdout:
            log.debug("snmpwalk %s %s err: %s", ip, oid, r.stderr[:100])
            return {}
        return _parse_walk(r.stdout, oid)
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        log.debug("snmpwalk %s %s exception: %s", ip, oid, e)
        return {}


def _snmpget(ip: str, oid: str, community: str, version: str, timeout: int = 5) -> Optional[str]:
    ver_flag = "2c" if version in ("2c", "2") else "1"
    try:
        r = subprocess.run(
            ["snmpget", "-v", ver_flag, "-c", community,
             "-t", str(timeout), "-r", "1", "-On",
             ip, oid],
            capture_output=True, text=True, timeout=timeout + 3
        )
        if r.returncode != 0 or not r.stdout.strip():
            return None
        result = _parse_walk(r.stdout, oid)
        return next(iter(result.values()), None)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None


def _parse_walk(output: str, base_oid: str) -> dict:
    """Parse snmpwalk -On output into {suffix: value} dict."""
    result = {}
    base = base_oid.rstrip(".")
    for line in output.strip().splitlines():
        # Format: .1.3.6.1.2.1.1.5.0 = STRING: "hostname"
        m = re.match(r'^\.?([\d.]+)\s*=\s*(?:\w+:\s*)?"?(.*?)"?\s*$', line)
        if not m:
            continue
        full_oid = m.group(1).lstrip(".")
        value    = m.group(2).strip().strip('"')
        # Skip no-such-object responses
        if "No Such" in value or "No more" in value:
            continue
        # Get suffix relative to base
        base_clean = base.lstrip(".")
        if full_oid.startswith(base_clean):
            suffix = full_oid[len(base_clean):].lstrip(".")
            result[suffix or "0"] = value
        else:
            result[full_oid] = value
    return result


def _shorten_port(name: str) -> str:
    """Extract short port name from LLDP port string.

    Examples:
      'XGigabitEthernet0/0/1'        → 'XGE0/0/1'
      'HundredGigE0/0/1'             → '100GE0/0/1'
      'GigabitEthernet0/0/1'         → 'GE0/0/1'
      'P/1-CLI_DIEGO-VL2377...'      → 'P/1'
      '100GE0/0/4'                   → '100GE0/0/4'  (already short)
      'sfp-sfpplus2-LINK-CONECT...'  → 'sfp2'  → kept short
    """
    if not name:
        return name
    # Normalize long Huawei/Cisco interface names
    replacements = [
        ('XGigabitEthernet', 'XGE'), ('HundredGigE', '100GE'), ('HundredGig', '100GE'),
        ('TenGigabitEthernet', 'XGE'), ('TenGigE', 'XGE'),
        ('GigabitEthernet', 'GE'), ('FastEthernet', 'FE'),
        ('hundred-gigabit-ethernet', '100GE'), ('gigabitethernet', 'GE'),
        ('xgigabitethernet', 'XGE'),
    ]
    low = name.lower()
    for long, short in replacements:
        if low.startswith(long.lower()):
            return short + name[len(long):]

    # If name has dashes and is long (e.g. "P/5-ATENDIMENTO-TAPERO_VL4085...")
    # keep only the port identifier before the first dash that follows a slash
    import re
    m = re.match(r'^([A-Za-z0-9/_]+?)[-_][A-Z]', name)
    if m and len(name) > 20:
        return m.group(1)

    return name


def poll_device(ip: str, community: str = "public", version: str = "2c") -> dict:
    """Poll a single device via SNMP+LLDP using snmpwalk.
    Tries standard IEEE 802.1AB (1.0.8802) first, then LLDPv2 (Datacom 1.3.111.2.802.1.1.13).
    """

    # Basic reachability — sysName + sysDescr
    hostname  = _snmpget(ip, "1.3.6.1.2.1.1.5.0", community, version)
    sys_descr = _snmpget(ip, "1.3.6.1.2.1.1.1.0", community, version)

    if hostname is None and sys_descr is None:
        log.info("Device %s unreachable (no sysName/sysDescr)", ip)
        return {"ip": ip, "reachable": False, "lldp_neighbors": []}

    # ── Detect if this is a Datacom device (LLDPv2 MIB) ──────────────────────
    # Datacom DmOS uses 1.3.111.2.802.1.1.13 (IEEE 802.1AB-2016 / LLDPv2)
    is_datacom = False
    if sys_descr and any(x in sys_descr.lower() for x in ['datacom', 'dmos', 'dm4', 'dm7', 'dm3', 'dm8', 'dm ']):
        is_datacom = True

    if is_datacom:
        return _poll_device_lldpv2(ip, community, version, hostname, sys_descr)
    else:
        return _poll_device_lldpv1(ip, community, version, hostname, sys_descr)


def _poll_device_lldpv1(ip, community, version, hostname, sys_descr):
    """Poll using standard IEEE 802.1AB MIB (Huawei, Juniper, Cisco, etc.)"""
    # LLDP local port — use PortId (.3) for short name (e.g. "XGE0/0/1")
    # PortDesc (.4) is often the long description like "P/1-CLI_DIEGO-VL2377..."
    local_port_ids   = _snmpwalk(ip, "1.0.8802.1.1.2.1.3.7.1.3",  community, version)  # lldpLocPortId
    local_port_descs = _snmpwalk(ip, "1.0.8802.1.1.2.1.3.7.1.4",  community, version)  # lldpLocPortDesc (fallback)
    # LLDP remote table — index is timeMark.localPortNum.remIndex
    # .9  = lldpRemSysName  (system name of neighbor)
    # .7  = lldpRemPortId   (port ID of neighbor)
    # .8  = lldpRemPortDesc (port description of neighbor)
    # .5  = lldpRemChassisId
    # .10 = lldpRemSysDesc
    rem_sysname  = _snmpwalk(ip, "1.0.8802.1.1.2.1.4.1.1.9",  community, version)
    rem_port_id  = _snmpwalk(ip, "1.0.8802.1.1.2.1.4.1.1.7",  community, version)
    rem_port     = _snmpwalk(ip, "1.0.8802.1.1.2.1.4.1.1.8",  community, version)
    rem_chassis  = _snmpwalk(ip, "1.0.8802.1.1.2.1.4.1.1.5",  community, version)
    rem_sysdescr = _snmpwalk(ip, "1.0.8802.1.1.2.1.4.1.1.10", community, version)
    rem_manaddr  = _snmpwalk(ip, "1.0.8802.1.1.2.1.4.2.1.4",  community, version)

    return _build_neighbors(ip, hostname, sys_descr,
        local_port_ids, local_port_descs,
        rem_sysname, rem_port_id, rem_port, rem_chassis, rem_sysdescr, rem_manaddr)


def _poll_device_lldpv2(ip, community, version, hostname, sys_descr):
    """Poll using LLDPv2 MIB (Datacom DmOS — 1.3.111.2.802.1.1.13)"""
    log.info("Using LLDPv2 MIB for %s (Datacom)", ip)
    # lldpV2LocPortTable: 1.3.111.2.802.1.1.13.1.3.7
    # lldpV2RemTable:     1.3.111.2.802.1.1.13.1.4.1
    BASE_LOC = "1.3.111.2.802.1.1.13.1.3.7"
    BASE_REM = "1.3.111.2.802.1.1.13.1.4.1"

    local_port_ids   = _snmpwalk(ip, f"{BASE_LOC}.1.3", community, version)  # lldpV2LocPortId
    local_port_descs = _snmpwalk(ip, f"{BASE_LOC}.1.4", community, version)  # lldpV2LocPortDesc

    rem_sysname  = _snmpwalk(ip, f"{BASE_REM}.1.9",  community, version)  # lldpV2RemSysName
    rem_port_id  = _snmpwalk(ip, f"{BASE_REM}.1.7",  community, version)  # lldpV2RemPortId
    rem_port     = _snmpwalk(ip, f"{BASE_REM}.1.8",  community, version)  # lldpV2RemPortDesc
    rem_chassis  = _snmpwalk(ip, f"{BASE_REM}.1.5",  community, version)  # lldpV2RemChassisId
    rem_sysdescr = _snmpwalk(ip, f"{BASE_REM}.1.10", community, version)  # lldpV2RemSysDesc
    # LLDPv2 management address table: 1.3.111.2.802.1.1.13.1.4.2
    rem_manaddr  = _snmpwalk(ip, "1.3.111.2.802.1.1.13.1.4.2.1.4", community, version)

    return _build_neighbors(ip, hostname, sys_descr,
        local_port_ids, local_port_descs,
        rem_sysname, rem_port_id, rem_port, rem_chassis, rem_sysdescr, rem_manaddr)


def _build_neighbors(ip, hostname, sys_descr,
                     local_port_ids, local_port_descs,
                     rem_sysname, rem_port_id, rem_port, rem_chassis, rem_sysdescr, rem_manaddr):
    """Common neighbor-building logic for both LLDP v1 and v2."""
    neighbors = []
    seen = set()

    all_keys = set(rem_sysname.keys()) | set(rem_chassis.keys())

    for key in all_keys:
        parts = key.split(".")
        if len(parts) < 3:
            continue
        local_port_num  = parts[1]
        local_port_desc = local_port_ids.get(local_port_num) or local_port_descs.get(local_port_num, f"port{local_port_num}")
        local_port_desc = _shorten_port(local_port_desc)

        rem_host      = rem_sysname.get(key, "")
        chassis       = rem_chassis.get(key, "")
        rem_port_desc = _shorten_port(rem_port_id.get(key, "") or rem_port.get(key, ""))
        rem_desc      = rem_sysdescr.get(key, "")

        rem_ip = None
        for addr_key, addr_val in rem_manaddr.items():
            ak = addr_key.split(".")
            if len(ak) > 2 and ak[1] == local_port_num:
                v = addr_val.strip()
                if re.match(r'^\d+\.\d+\.\d+\.\d+$', v):
                    rem_ip = v
                break

        neighbor_id = rem_host or chassis
        dedup = (local_port_num, neighbor_id)
        if dedup in seen or not neighbor_id:
            continue
        seen.add(dedup)

        neighbors.append({
            "local_port":       local_port_desc,
            "remote_chassis":   chassis,
            "remote_port":      rem_port_desc,
            "remote_hostname":  rem_host or chassis,
            "remote_ip":        rem_ip,
            "remote_sys_descr": rem_desc,
        })

    log.info("Polled %s → %s, %d LLDP neighbors", ip, hostname, len(neighbors))
    return {
        "ip":             ip,
        "hostname":       hostname or ip,
        "sys_descr":      sys_descr or "",
        "reachable":      True,
        "lldp_neighbors": neighbors,
    }


def build_graph(poll_results: list) -> dict:
    nodes_map  = {}
    edges      = []
    seen_edges = set()

    # ── Pass 1: register all polled (reachable) devices by IP ──
    # Also build lookup maps so we can resolve neighbor references
    hostname_to_ip = {}   # "SW-HUAWEI-S6730-NILO" → "100.113.0.244"

    for dev in poll_results:
        if not dev["reachable"]:
            continue
        ip = dev["ip"]
        hostname = dev.get("hostname", ip)
        nodes_map[ip] = {
            "id": ip, "label": hostname,
            "ip": ip, "sys_descr": dev.get("sys_descr", ""), "type": "device",
        }
        if hostname:
            hostname_to_ip[hostname.upper()] = ip

    # ── Pass 2: resolve neighbor ID → canonical node ID ────────
    # If a neighbor's hostname matches a polled device, use that device's IP as ID
    # so the edge connects to the existing node instead of creating a duplicate
    def resolve_neighbor_id(nb: dict) -> str:
        nb_ip       = nb.get("remote_ip") or ""
        nb_hostname = nb.get("remote_hostname") or ""
        nb_chassis  = nb.get("remote_chassis") or ""

        # Direct IP match — best case
        if nb_ip and nb_ip in nodes_map:
            return nb_ip

        # Hostname matches a polled device
        if nb_hostname and nb_hostname.upper() in hostname_to_ip:
            return hostname_to_ip[nb_hostname.upper()]

        # Fall back to IP, then hostname, then chassis
        return nb_ip or nb_hostname or nb_chassis

    # ── Pass 3: add neighbor-only nodes (not polled) ────────────
    for dev in poll_results:
        if not dev["reachable"]:
            continue
        for nb in dev.get("lldp_neighbors", []):
            nb_id = resolve_neighbor_id(nb)
            if nb_id and nb_id not in nodes_map:
                nb_ip = nb.get("remote_ip") or ""
                nodes_map[nb_id] = {
                    "id": nb_id,
                    "label": nb.get("remote_hostname") or nb_id,
                    "ip": nb_ip,
                    "sys_descr": nb.get("remote_sys_descr", ""),
                    "type": "neighbor",
                }

    # ── Pass 4: build edges ──────────────────────────────────────
    ec = 0
    for dev in poll_results:
        if not dev["reachable"]:
            continue
        src = dev["ip"]
        for nb in dev.get("lldp_neighbors", []):
            nb_id = resolve_neighbor_id(nb)
            if not nb_id or nb_id not in nodes_map:
                continue
            pair = tuple(sorted([src, nb_id]))
            if pair in seen_edges:
                continue
            seen_edges.add(pair)
            ec += 1
            edges.append({
                "id": f"e{ec}", "from": src, "to": nb_id,
                "local_port": nb.get("local_port", ""),
                "remote_port": nb.get("remote_port", ""),
                "label": f"{nb.get('local_port','')}\n→\n{nb.get('remote_port','')}",
            })

    return {"nodes": list(nodes_map.values()), "edges": edges}


async def crawl_lldp(devices: list, on_progress=None) -> tuple:
    sem  = asyncio.Semaphore(20)
    loop = asyncio.get_event_loop()

    async def _poll(dev):
        async with sem:
            r = await loop.run_in_executor(
                None, poll_device,
                dev["ip"], dev.get("community", "public"), dev.get("snmp_ver", "2c"),
            )
            if on_progress:
                await on_progress(dev["ip"], r)
            return r

    results = await asyncio.gather(*[_poll(d) for d in devices])
    return list(results), build_graph(list(results))
