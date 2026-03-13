"""
SSH service for device management.
Uses paramiko for SSH connections.
Supports: Huawei, Datacom, Cisco IOS/IOS-XE, Juniper (detection by sysDescr or banner).
"""

import re

import re
import logging
import socket
from typing import Optional

log = logging.getLogger(__name__)

try:
    import paramiko
    PARAMIKO_OK = True
except ImportError:
    PARAMIKO_OK = False
    log.warning("paramiko not installed — SSH features disabled")


# ── Vendor detection ─────────────────────────────────────────────────────────

def detect_vendor_from_text(text: str) -> str:
    """Detect vendor from banner, sysDescr or prompt."""
    t = text.lower()
    if any(x in t for x in ['huawei', 'vrp', 's6730', 's5731', 's5720', 'ce6', 'ar']):
        return 'huawei'
    if any(x in t for x in ['datacom', 'dmos', 'dm4', 'dm7', 'dm3', 'dm8', 'dm ']):
        return 'datacom'
    if any(x in t for x in ['cisco', 'ios', 'nexus', 'catalyst']):
        return 'cisco'
    if any(x in t for x in ['juniper', 'junos', 'srx', 'mx', 'ex', 'qfx', 'ptx']):
        return 'juniper'
    if any(x in t for x in ['arista', 'eos']):
        return 'arista'
    if any(x in t for x in ['nokia', 'alcatel', 'sros', 'timos']):
        return 'nokia'
    if any(x in t for x in ['edgecore', 'accton']):
        return 'edgecore'
    return 'unknown'


def detect_vendor_from_sysdescr(sysdescr: str) -> str:
    return detect_vendor_from_text(sysdescr or '')


# ── SSH connection ────────────────────────────────────────────────────────────

class SSHConnection:
    def __init__(self, ip: str, port: int, username: str, password: str, timeout: int = 15):
        self.ip = ip
        self.port = port
        self.username = username
        self.password = password
        self.timeout = timeout
        self.client: Optional[paramiko.SSHClient] = None
        self.shell = None
        self.vendor = 'unknown'
        self._banner = ''

    def connect(self) -> str:
        """Connect and return banner/initial output. Raises on failure."""
        if not PARAMIKO_OK:
            raise RuntimeError("paramiko not installed. Run: pip install paramiko --break-system-packages")

        self.client = paramiko.SSHClient()
        self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            self.client.connect(
                self.ip,
                port=self.port,
                username=self.username,
                password=self.password,
                timeout=self.timeout,
                allow_agent=False,
                look_for_keys=False,
                banner_timeout=self.timeout,
            )
        except paramiko.AuthenticationException as e:
            raise RuntimeError(f"Autenticação falhou: {e}")
        except paramiko.ssh_exception.NoValidConnectionsError as e:
            raise RuntimeError(f"Conexão recusada na porta {self.port}: {e}")
        except socket.timeout:
            raise RuntimeError(f"Timeout ({self.timeout}s) ao conectar em {self.ip}:{self.port}")
        except Exception as e:
            raise RuntimeError(f"Erro SSH: {e}")

        # Open interactive shell
        self.shell = self.client.invoke_shell(width=200, height=50)
        self.shell.settimeout(self.timeout)
        banner = self._read_until_prompt(timeout=8)
        self._banner = banner
        self.vendor = detect_vendor_from_text(banner)
        return banner

    def _read_until_prompt(self, timeout: int = 8) -> str:
        """Read from shell until prompt appears or timeout."""
        import time
        output = ''
        end = time.time() + timeout
        while time.time() < end:
            if self.shell.recv_ready():
                chunk = self.shell.recv(4096).decode('utf-8', errors='replace')
                output += chunk
                # Huawei: <hostname> or [hostname]
                # Cisco: hostname# or hostname>
                # Juniper: user@hostname>
                if re.search(r'[>#\]]\s*$', output.rstrip()):
                    break
            else:
                time.sleep(0.15)
        return output

    def send(self, cmd: str, timeout: int = 10) -> str:
        """Send command and return output."""
        if not self.shell:
            raise RuntimeError("Not connected")
        self.shell.send(cmd + '\n')
        import time; time.sleep(0.3)
        return self._read_until_prompt(timeout=timeout)

    def close(self):
        try:
            if self.shell: self.shell.close()
            if self.client: self.client.close()
        except Exception:
            pass


# ── Test SSH ──────────────────────────────────────────────────────────────────

def test_ssh(ip: str, port: int, username: str, password: str) -> dict:
    """
    Test SSH connectivity. Returns:
    { ok: bool, vendor: str, banner: str, log: str }
    """
    if not PARAMIKO_OK:
        return {'ok': False, 'vendor': 'unknown', 'banner': '', 'log': 'paramiko não instalado'}

    conn = SSHConnection(ip, port or 22, username, password)
    try:
        banner = conn.connect()
        vendor = conn.vendor
        conn.close()
        return {
            'ok': True,
            'vendor': vendor,
            'banner': banner[:500],
            'log': f"Conectado com sucesso. Vendor detectado: {vendor}",
        }
    except Exception as e:
        return {
            'ok': False,
            'vendor': 'unknown',
            'banner': '',
            'log': str(e),
        }


# ── Huawei SNMP scan & config ──────────────────────────────────────────────────

HUAWEI_MIB_VIEW_CMD = 'snmp-agent mib-view included VIEW-ALL iso'
HUAWEI_MIB_VIEW_CHECK = 'VIEW-ALL'

def _huawei_disable_paging(conn: SSHConnection):
    """Disable -- More -- paging on Huawei."""
    conn.send('screen-length 0 temporary', timeout=5)

def _huawei_enter_system(conn: SSHConnection) -> str:
    """Enter system-view on Huawei. Returns output."""
    return conn.send('system-view', timeout=5)

def _huawei_quit(conn: SSHConnection):
    conn.send('quit', timeout=3)

def _huawei_get_snmp_config(conn: SSHConnection) -> str:
    """Run 'dis cur | inc snmp' and return output."""
    return conn.send('display current-configuration | include snmp', timeout=15)

def scan_and_fix_huawei_snmp(ip: str, port: int, username: str, password: str) -> dict:
    """
    Connect via SSH, check SNMP config, add mib-view if missing.
    Returns { ok, changes_made, log, community_lines }
    """
    log_lines = []
    changes = []

    conn = SSHConnection(ip, port or 22, username, password)
    try:
        banner = conn.connect()
        log_lines.append(f"✓ Conectado — {conn.vendor}")

        _huawei_disable_paging(conn)

        # Read current SNMP config
        snmp_raw = _huawei_get_snmp_config(conn)
        log_lines.append(f"Config SNMP atual:\n{snmp_raw.strip()}")

        # Check if VIEW-ALL mib-view exists
        has_mib_view = HUAWEI_MIB_VIEW_CHECK in snmp_raw

        # Extract community lines
        community_lines = [
            l.strip() for l in snmp_raw.splitlines()
            if 'snmp-agent community' in l.lower()
        ]

        if not has_mib_view:
            # Enter system-view and add mib-view
            sv_out = _huawei_enter_system(conn)
            log_lines.append(f"→ system-view: {sv_out.strip()[-80:]}")

            out = conn.send(HUAWEI_MIB_VIEW_CMD, timeout=8)
            log_lines.append(f"→ {HUAWEI_MIB_VIEW_CMD}: {out.strip()[-80:]}")
            changes.append(f"Adicionado: {HUAWEI_MIB_VIEW_CMD}")

            # Add mib-view VIEW-ALL to each community line (if not already present)
            for comm_line in community_lines:
                if 'mib-view' not in comm_line.lower():
                    new_line = comm_line.rstrip() + ' mib-view VIEW-ALL'
                    out = conn.send(new_line, timeout=8)
                    log_lines.append(f"→ {new_line[:80]}: {out.strip()[-60:]}")
                    changes.append(f"Atualizado: {new_line[:80]}...")

            # Save config
            _huawei_quit(conn)  # exit system-view
            save_out = conn.send('save', timeout=15)
            if 'Y/N' in save_out or 'y/n' in save_out:
                conn.send('y', timeout=10)
            log_lines.append("✓ Configuração salva")
        else:
            log_lines.append("✓ mib-view VIEW-ALL já existe — sem alterações necessárias")

        # Re-read to confirm
        snmp_final = _huawei_get_snmp_config(conn)
        conn.close()

        return {
            'ok': True,
            'changes_made': len(changes) > 0,
            'changes': changes,
            'log': '\n'.join(log_lines),
            'snmp_config_after': snmp_final.strip(),
            'community_lines': community_lines,
        }

    except Exception as e:
        try: conn.close()
        except: pass
        return {
            'ok': False,
            'changes_made': False,
            'changes': [],
            'log': '\n'.join(log_lines) + f"\n✗ Erro: {e}",
            'snmp_config_after': '',
            'community_lines': [],
        }


# ── Datacom LLDP scan & config ────────────────────────────────────────────────

def _datacom_get_lldp_local_ports(conn: SSHConnection) -> list:
    """
    Read LLDP local port table from Datacom via 'show lldp local detail'.
    Returns list of interface names like 'hundred-gigabit-ethernet-1/1/1'.
    """
    out = conn.send('show lldp local detail', timeout=15)
    ports = []
    for line in out.splitlines():
        # Lines like: "Interface: hundred-gigabit-ethernet-1/1/1"
        m = re.search(r'[Ii]nterface[:\s]+(\S+ethernet[\S]+)', line)
        if m:
            ports.append(m.group(1))
    # Also try "show lldp interfaces"
    if not ports:
        out2 = conn.send('show lldp interfaces', timeout=10)
        for line in out2.splitlines():
            m = re.search(r'((?:hundred|ten|gigabit|forty)-gigabit-ethernet-[\d/]+)', line, re.IGNORECASE)
            if m:
                ports.append(m.group(1))
    return list(dict.fromkeys(ports))  # deduplicate preserving order


def _datacom_get_all_interfaces(conn: SSHConnection) -> list:
    """
    Get all physical interfaces from Datacom via 'show interfaces brief'.
    Returns list of interface names.
    """
    out = conn.send('show interfaces brief', timeout=15)
    ports = []
    for line in out.splitlines():
        m = re.search(r'^((?:Hundred|Ten|Gigabit|Forty)GigabitEthernet[\d/]+|(?:hundred|ten|gigabit|forty)-gigabit-ethernet-[\d/]+)', line.strip(), re.IGNORECASE)
        if m:
            # Normalize to lowercase kebab format used in config
            raw = m.group(1)
            normalized = re.sub(r'(?<=[a-z])(?=[A-Z])', '-', raw).lower()
            normalized = re.sub(r'(\d)([a-z])', r'\1-\2', normalized)
            ports.append(normalized)
    return list(dict.fromkeys(ports))


def scan_and_fix_datacom_lldp(ip: str, port: int, username: str, password: str,
                               snmp_community: str = None, snmp_ip: str = None) -> dict:
    """
    Connect to Datacom via SSH:
    1. Read all physical interfaces via SNMP lldpV2LocPortTable
    2. Enter conf mode, enable LLDP tx-and-rx on each port
    Returns { ok, changes_made, changes, log, ports_configured }
    """
    log_lines = []
    changes = []
    ports_configured = []

    # ── Step 1: get local port list via SNMP if community available ───────────
    snmp_ports = []
    if snmp_community and snmp_ip:
        import subprocess
        BASE_LOC = "1.3.111.2.802.1.1.13.1.3.7"
        try:
            r = subprocess.run(
                ['snmpwalk', '-v', '2c', '-c', snmp_community, '-t', '5', '-r', '1', '-On',
                 snmp_ip, f"{BASE_LOC}.1.7"],  # lldpV2LocPortIdSubtype
                capture_output=True, text=True, timeout=10
            )
            # Parse port names from lldpV2LocPortDesc (.1.8)
            r2 = subprocess.run(
                ['snmpwalk', '-v', '2c', '-c', snmp_community, '-t', '5', '-r', '1', '-On',
                 snmp_ip, f"{BASE_LOC}.1.8"],  # lldpV2LocPortDesc
                capture_output=True, text=True, timeout=10
            )
            for line in r2.stdout.splitlines():
                m = re.search(r'STRING:\s*"?([^"]+)"?\s*$', line)
                if m:
                    p = m.group(1).strip()
                    if p and 'gigabit' in p.lower():
                        snmp_ports.append(p)
            log_lines.append(f"SNMP: {len(snmp_ports)} portas encontradas via lldpV2LocPortDesc")
        except Exception as e:
            log_lines.append(f"SNMP (portas): falhou — {e}")

    # ── Step 2: SSH into device ───────────────────────────────────────────────
    conn = SSHConnection(ip, port or 22, username, password)
    try:
        banner = conn.connect()
        log_lines.append(f"✓ Conectado — {conn.vendor or 'datacom'}")

        # Get ports via SSH if SNMP didn't give us them
        ssh_ports = []
        if not snmp_ports:
            log_lines.append("Lendo interfaces via SSH...")
            ssh_ports = _datacom_get_all_interfaces(conn)
            log_lines.append(f"SSH: {len(ssh_ports)} interfaces encontradas")

        all_ports = snmp_ports or ssh_ports
        if not all_ports:
            # Last resort: read from LLDP local table via SSH
            all_ports = _datacom_get_lldp_local_ports(conn)
            log_lines.append(f"LLDP local: {len(all_ports)} portas encontradas")

        if not all_ports:
            conn.close()
            return {
                'ok': False, 'changes_made': False, 'changes': [],
                'log': '\n'.join(log_lines) + '\n✗ Nenhuma porta encontrada',
                'ports_configured': [],
            }

        # ── Step 3: Enter conf mode, enable LLDP on each port ────────────────
        conf_out = conn.send('conf', timeout=5)
        # Handle "Entering configuration mode" or similar prompt
        if 'error' in conf_out.lower() or 'invalid' in conf_out.lower():
            # Try 'configure terminal'
            conf_out = conn.send('configure terminal', timeout=5)
        log_lines.append(f"→ conf mode: OK")

        for iface in all_ports:
            # Enter interface
            iface_out = conn.send(f'interface {iface}', timeout=5)
            if 'invalid' in iface_out.lower() or 'error' in iface_out.lower():
                log_lines.append(f"  ✗ {iface}: inválida, pulando")
                continue

            # Enable LLDP
            lldp_out = conn.send('lldp admin-status tx-and-rx', timeout=5)
            no_notif  = conn.send('no lldp notification', timeout=5)

            # Exit interface
            conn.send('exit', timeout=3)

            ports_configured.append(iface)
            changes.append(f"lldp tx-and-rx em {iface}")
            log_lines.append(f"  ✓ {iface}: lldp tx-and-rx habilitado")

        # Exit conf mode
        conn.send('end', timeout=3)

        # Save
        save_out = conn.send('write', timeout=15)
        if 'confirm' in save_out.lower() or 'y/n' in save_out.lower():
            conn.send('y', timeout=10)
        log_lines.append(f"✓ Configuração salva — {len(ports_configured)} portas configuradas")

        conn.close()
        return {
            'ok': True,
            'changes_made': len(changes) > 0,
            'changes': changes,
            'log': '\n'.join(log_lines),
            'ports_configured': ports_configured,
            'snmp_config_after': f"{len(ports_configured)} portas com LLDP tx-and-rx",
            'community_lines': [],
        }

    except Exception as e:
        try: conn.close()
        except: pass
        return {
            'ok': False, 'changes_made': False, 'changes': [],
            'log': '\n'.join(log_lines) + f'\n✗ Erro: {e}',
            'ports_configured': [],
            'snmp_config_after': '',
            'community_lines': [],
        }


# ── Dispatch scan by vendor ───────────────────────────────────────────────────

def scan_device_by_vendor(vendor: str, ip: str, port: int, username: str, password: str,
                           snmp_community: str = None) -> dict:
    """
    Route to the right scan function based on detected vendor.
    Returns unified result dict.
    """
    v = (vendor or '').lower()

    if v == 'huawei':
        return scan_and_fix_huawei_snmp(ip, port, username, password)

    elif v == 'datacom':
        return scan_and_fix_datacom_lldp(
            ip, port, username, password,
            snmp_community=snmp_community,
            snmp_ip=ip,
        )

    else:
        # Unknown vendor — try SSH, detect from banner, then dispatch
        conn = SSHConnection(ip, port or 22, username, password)
        try:
            banner = conn.connect()
            detected = conn.vendor
            conn.close()
        except Exception as e:
            return {
                'ok': False, 'changes_made': False, 'changes': [],
                'log': f'✗ Não foi possível conectar: {e}',
                'snmp_config_after': '', 'community_lines': [],
            }

        if detected == 'huawei':
            return scan_and_fix_huawei_snmp(ip, port, username, password)
        elif detected == 'datacom':
            return scan_and_fix_datacom_lldp(ip, port, username, password,
                                              snmp_community=snmp_community, snmp_ip=ip)
        else:
            return {
                'ok': False, 'changes_made': False, 'changes': [],
                'log': f'✗ Vendor "{detected}" não suportado ainda para varredura automática.',
                'snmp_config_after': '', 'community_lines': [],
            }
