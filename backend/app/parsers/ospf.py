"""
OSPF LSDB Parser
Parses raw text output from: Cisco, Juniper, FRR/Quagga, Nokia, Huawei VRP, Mikrotik, Fortinet
Also handles RTF-wrapped files (e.g. exported from macOS Terminal/TextEdit).
Returns a normalized graph dict {nodes, edges}
"""
import re
import networkx as nx
from typing import Optional

# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def _ip_to_int(ip: str) -> int:
    parts = ip.strip().split(".")
    if len(parts) != 4:
        return 0
    try:
        return sum(int(p) << (8 * (3 - i)) for i, p in enumerate(parts))
    except ValueError:
        return 0

def _is_valid_ip(s: str) -> bool:
    return bool(re.match(r"^\d{1,3}(\.\d{1,3}){3}$", s.strip()))


def _strip_rtf(text: str) -> str:
    """Strip RTF markup — handles Mac cocoartf, Word RTF, standard RTF."""
    if not text.strip().startswith("{\rtf"):
        return text
    text = re.sub(r'\{\\[^{}]{0,80}\}', '', text)
    text = re.sub(r'\\[a-zA-Z]+\-?\d*\s?', ' ', text)
    text = re.sub(r'[{}]', '', text)
    text = re.sub(r'\\\s*\n', '\n', text)
    text = re.sub(r'\\+', '\n', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _parse_juniper_lsa1(text: str) -> dict:
    """Parse Juniper show ospf database router extensive output.
    Format:
        Router   64.52.14.0   64.52.14.0   0x800026c6  ...
          Topology default (ID 0)
            Type: PointToPoint, Node ID: 64.52.14.2
              Metric: 1, Bidirectional
    """
    routers = {}
    links   = []
    rtr_hdr  = re.compile(r'^Router\s+\*?(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)', re.M)
    node_pat = re.compile(r'Node ID:\s*(\d+\.\d+\.\d+\.\d+)')
    met_pat  = re.compile(r'Metric:\s*(\d+)')
    current = None
    current_nbr = None
    for line in text.splitlines():
        m = rtr_hdr.match(line.strip())
        if m:
            current = m.group(2)
            routers.setdefault(current, {"id": current})
            current_nbr = None
            continue
        if not current:
            continue
        m = node_pat.search(line)
        if m:
            current_nbr = m.group(1)
            links.append([current, current_nbr, 1])
            continue
        m = met_pat.search(line)
        if m and current_nbr and links and links[-1][0] == current and links[-1][1] == current_nbr:
            links[-1][2] = int(m.group(1))
    return {"routers": routers, "links": links}


# ──────────────────────────────────────────────
# Vendor-specific LSA1 parsers
# ──────────────────────────────────────────────

def _parse_cisco_lsa1(text: str) -> dict:
    """Parse Cisco 'show ip ospf database router' output."""
    routers = {}
    links = []
    current_router = None

    for line in text.splitlines():
        # Router LSA header
        m = re.match(r"\s+LS age:\s+\d+", line)
        if m:
            current_router = None

        m = re.match(r"\s+Link State ID:\s+(\S+)", line)
        if m:
            current_router = m.group(1)
            if current_router not in routers:
                routers[current_router] = {"id": current_router, "links": []}

        m = re.match(r"\s+Advertising Router:\s+(\S+)", line)
        if m and current_router is None:
            current_router = m.group(1)
            if current_router not in routers:
                routers[current_router] = {"id": current_router, "links": []}

        # Point-to-point or transit links
        if current_router:
            m = re.match(r"\s+Link connected to:\s+(.+)", line)
            if m:
                link_type = m.group(1).strip()

            m = re.match(r"\s+\(Link ID\)\s+(?:Designated Router address|Neighboring Router ID):\s+(\S+)", line)
            if m:
                neighbor = m.group(1)
                links.append((current_router, neighbor))

            # Newer IOS format
            m = re.match(r"\s+Link ID:\s+(\S+)", line)
            if m:
                neighbor = m.group(1)

            m = re.match(r"\s+Link Data:\s+(\S+)", line)
            if m:
                pass  # interface IP

            m = re.match(r"\s+Number of MTID metrics:\s+0", line)
            # after link data block – capture metric
            m = re.match(r"\s+TOS\s+0\s+Metrics:\s+(\d+)", line)
            if m:
                metric = int(m.group(1))
                if links:
                    links[-1] = links[-1] + (metric,) if len(links[-1]) == 2 else links[-1]

    return {"routers": routers, "links": links}


def _parse_generic_lsa1(text: str) -> dict:
    """
    Generic heuristic parser that works for most vendors.
    Looks for Router ID / Link State ID patterns and neighbor relationships.
    """
    routers = {}
    links = []

    router_id_pat = re.compile(
        r"(?:Link State ID|LSID|Router-ID|Adv Router|Advertising Router)[:\s]+(\d+\.\d+\.\d+\.\d+)", re.I
    )
    neighbor_pat = re.compile(
        r"(?:Neighbor|DR|Link ID|Nbr Router ID)[:\s]+(\d+\.\d+\.\d+\.\d+)", re.I
    )
    metric_pat = re.compile(r"(?:Metric|Cost|TOS\s*0\s+Metrics)[:\s]+(\d+)", re.I)

    current_router = None
    current_neighbor = None

    for line in text.splitlines():
        m = router_id_pat.search(line)
        if m:
            current_router = m.group(1)
            if current_router not in routers:
                routers[current_router] = {"id": current_router}
            current_neighbor = None
            continue

        if current_router:
            m = neighbor_pat.search(line)
            if m:
                nbr = m.group(1)
                if _is_valid_ip(nbr) and nbr != current_router:
                    current_neighbor = nbr
                    links.append([current_router, nbr, 1])  # default cost 1

            m = metric_pat.search(line)
            if m and current_neighbor and links:
                links[-1][2] = int(m.group(1))

    return {"routers": routers, "links": links}


# ──────────────────────────────────────────────
# LSA2 (Network LSA) parser  
# ──────────────────────────────────────────────

def _parse_network_lsa(text: str) -> list:
    """Extract DR <-> attached routers from LSA Type 2."""
    segments = []
    current_dr = None
    attached = []

    for line in text.splitlines():
        m = re.match(r"\s+(?:Link State ID|Network-LSA).*?(\d+\.\d+\.\d+\.\d+)", line)
        if m:
            if current_dr and attached:
                segments.append({"dr": current_dr, "routers": attached})
            current_dr = m.group(1)
            attached = []

        m = re.match(r"\s+Attached Router:\s+(\S+)", line)
        if m:
            attached.append(m.group(1))

    if current_dr and attached:
        segments.append({"dr": current_dr, "routers": attached})

    return segments


# ──────────────────────────────────────────────
# Huawei VRP parser
# Format: "Ls id : X.X.X.X", "Adv rtr : X.X.X.X",
#         "* Link ID: X.X.X.X", "Link Type: P-2-P", "Metric : N"
# ──────────────────────────────────────────────

def _parse_huawei_vrp(text: str) -> dict:
    """
    Parse Huawei VRP OSPF LSDB output.
    Supports both 'display ospf lsdb' and the VRP format with
    'Ls id', 'Adv rtr', '* Link ID', 'Link Type', 'Metric'.
    """
    routers = {}
    links = []

    current_router = None
    current_link_id = None
    current_link_type = None
    current_metric = None

    for raw_line in text.splitlines():
        line = raw_line.strip()

        # New router LSA block
        m = re.match(r'(?:Ls id|Link State ID)\s*:\s*(\d+\.\d+\.\d+\.\d+)', line, re.I)
        if m:
            current_router = m.group(1)
            if current_router not in routers:
                routers[current_router] = {"id": current_router}
            current_link_id = None
            current_link_type = None
            current_metric = None
            continue

        # Also catch "Adv rtr" to ensure router is registered
        m = re.match(r'(?:Adv rtr|Advertising Router)\s*:\s*(\d+\.\d+\.\d+\.\d+)', line, re.I)
        if m:
            adv = m.group(1)
            if adv not in routers:
                routers[adv] = {"id": adv}
            # If current_router not set yet, use adv rtr
            if current_router is None:
                current_router = adv
            continue

        if current_router is None:
            continue

        # Link ID line (may start with "* Link ID:" or "Link ID:")
        m = re.match(r'\*?\s*Link ID\s*:\s*(\d+\.\d+\.\d+\.\d+)', line, re.I)
        if m:
            # Commit previous link if complete
            if current_link_id and current_link_type == 'p2p' and _is_valid_ip(current_link_id):
                links.append([current_router, current_link_id, current_metric or 1])
            current_link_id = m.group(1)
            current_link_type = None
            current_metric = None
            continue

        # Link Type
        m = re.match(r'Link Type\s*:\s*(\S+)', line, re.I)
        if m:
            lt = m.group(1).lower()
            # P-2-P, P2P, point-to-point → p2p; StubNet, stub → stub
            if 'p' in lt and ('2' in lt or 'p' in lt[1:]):
                current_link_type = 'p2p'
            elif 'stub' in lt or 'net' in lt:
                current_link_type = 'stub'
            elif 'transit' in lt:
                current_link_type = 'transit'
            else:
                current_link_type = lt
            continue

        # Metric
        m = re.match(r'Metric\s*:\s*(\d+)', line, re.I)
        if m:
            current_metric = int(m.group(1))
            # If we have a complete p2p link, add it now
            if current_link_id and current_link_type == 'p2p' and _is_valid_ip(current_link_id):
                links.append([current_router, current_link_id, current_metric])
                current_link_id = None
                current_link_type = None
                current_metric = None
            continue

    return {"routers": routers, "links": links}


# ──────────────────────────────────────────────
# Main parser entry point
# ──────────────────────────────────────────────

def detect_vendor(text: str) -> str:
    tl = text.lower()
    if "show ip ospf database" in tl:
        return "cisco"
    if "show ospf database" in tl:
        return "juniper"
    if "show router ospf database" in tl:
        return "nokia"
    if "display ospf lsdb" in tl:
        return "huawei_cli"
    if "get router info ospf" in tl:
        return "fortinet"
    # Huawei VRP format: "Ls id     :" + "Link Type: P-2-P"
    if re.search(r'Ls id\s*:', text, re.I) and re.search(r'Link Type\s*:', text, re.I):
        return "huawei_vrp"
    # Generic fallback that also covers Adv rtr format
    if re.search(r'Adv rtr\s*:', text, re.I):
        return "huawei_vrp"
    # Juniper format detection: "Router  <ip>  <ip>" header + "Node ID:" links
    if re.search(r'^Router\s+\*?\d+\.\d+\.\d+\.\d+\s+\d+\.\d+\.\d+\.\d+', text, re.M) and \
       re.search(r'Node ID:\s*\d+\.\d+\.\d+\.\d+', text):
        return "juniper"
    return "generic"


def parse_ospf_lsdb(text: str) -> dict:
    """
    Main entry. Strips RTF if needed, detects vendor, parses LSDB.
    Returns normalized graph_data:
    {
      nodes: [{id, label, router_id, x, y}],
      edges: [{id, from, to, cost, label}]
    }
    """
    # Strip RTF wrapper first
    text = _strip_rtf(text)

    vendor = detect_vendor(text)

    if vendor == "cisco":
        raw = _parse_cisco_lsa1(text)
    elif vendor in ("huawei_vrp", "huawei_cli"):
        raw = _parse_huawei_vrp(text)
    elif vendor == "juniper":
        raw = _parse_juniper_lsa1(text)
    else:
        raw = _parse_generic_lsa1(text)

    network_segments = _parse_network_lsa(text)

    # Build NetworkX graph for layout + analysis
    G = nx.Graph()

    routers = raw.get("routers", {})
    raw_links = raw.get("links", [])

    # Add nodes
    for rid, data in routers.items():
        G.add_node(rid)

    # Add edges from LSA1
    for link in raw_links:
        src = link[0]
        dst = link[1]
        cost = link[2] if len(link) > 2 else 1
        if _is_valid_ip(src) and _is_valid_ip(dst):
            G.add_node(src)
            G.add_node(dst)
            if G.has_edge(src, dst):
                # keep lower cost
                if cost < G[src][dst].get("cost", 9999):
                    G[src][dst]["cost"] = cost
            else:
                G.add_edge(src, dst, cost=cost)

    # Add edges from LSA2 (transit networks)
    for seg in network_segments:
        rlist = seg["routers"]
        for i in range(len(rlist)):
            for j in range(i + 1, len(rlist)):
                r1, r2 = rlist[i], rlist[j]
                if not G.has_edge(r1, r2):
                    G.add_node(r1)
                    G.add_node(r2)
                    G.add_edge(r1, r2, cost=1)

    # Compute layout — circular is numpy-free and works well for network graphs
    if len(G.nodes) > 0:
        try:
            pos = nx.kamada_kawai_layout(G)
        except Exception:
            pos = nx.circular_layout(G)
    else:
        pos = {}

    # Serialize nodes
    nodes = []
    for i, node_id in enumerate(G.nodes()):
        x, y = pos.get(node_id, (0, 0))
        nodes.append({
            "id": node_id,
            "label": node_id,
            "router_id": node_id,
            "x": round(float(x) * 600, 2),
            "y": round(float(y) * 400, 2),
        })

    # Serialize edges
    edges = []
    seen = set()
    for i, (src, dst, data) in enumerate(G.edges(data=True)):
        key = tuple(sorted([src, dst]))
        if key in seen:
            continue
        seen.add(key)
        edges.append({
            "id": f"e{i}",
            "from": src,
            "to": dst,
            "cost": data.get("cost", 1),
            "label": str(data.get("cost", 1)),
        })

    return {
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "node_count": len(nodes),
            "edge_count": len(edges),
            "vendor": vendor,
        }
    }


# ──────────────────────────────────────────────
# YAML / manual topology parser
# ──────────────────────────────────────────────

def parse_yaml_topology(data: dict) -> dict:
    """
    Accept a dict like:
    {
      nodes: [{id, label}],
      edges: [{from, to, cost}]
    }
    and return normalized graph_data.
    """
    G = nx.Graph()
    for n in data.get("nodes", []):
        G.add_node(n["id"])
    for e in data.get("edges", []):
        G.add_edge(e["from"], e["to"], cost=e.get("cost", 1))

    if G.nodes:
        try:
            pos = nx.kamada_kawai_layout(G)
        except Exception:
            pos = nx.circular_layout(G)
    else:
        pos = {}

    nodes = []
    for node_id in G.nodes():
        x, y = pos.get(node_id, (0, 0))
        label = next((n.get("label", node_id) for n in data.get("nodes", []) if n["id"] == node_id), node_id)
        nodes.append({
            "id": node_id,
            "label": label,
            "router_id": node_id,
            "x": round(float(x) * 600, 2),
            "y": round(float(y) * 400, 2),
        })

    edges = []
    for i, (src, dst, d) in enumerate(G.edges(data=True)):
        edges.append({
            "id": f"e{i}",
            "from": src,
            "to": dst,
            "cost": d.get("cost", 1),
            "label": str(d.get("cost", 1)),
        })

    return {
        "nodes": nodes,
        "edges": edges,
        "stats": {"node_count": len(nodes), "edge_count": len(edges), "vendor": "manual"},
    }
