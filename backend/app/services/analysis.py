"""
Graph analysis service.
Shortest paths, failure simulation, asymmetric path detection, heatmap.
"""
import networkx as nx
from typing import Optional


def _build_graph(graph_data: dict) -> nx.Graph:
    G = nx.Graph()
    for n in graph_data.get("nodes", []):
        G.add_node(n["id"], label=n.get("label", n["id"]))
    for e in graph_data.get("edges", []):
        G.add_edge(e["from"], e["to"], cost=e.get("cost", 1), edge_id=e.get("id", ""))
    return G


def shortest_path(graph_data: dict, source: str, target: str, excluded_nodes: list = []) -> dict:
    G = _build_graph(graph_data)
    # Remove excluded nodes (e.g. simulating node failure for reroute calculation)
    for node in excluded_nodes:
        if G.has_node(node):
            G.remove_node(node)
    try:
        path = nx.shortest_path(G, source=source, target=target, weight="cost")
        length = nx.shortest_path_length(G, source=source, target=target, weight="cost")
        edges_in_path = []
        for i in range(len(path) - 1):
            u, v = path[i], path[i + 1]
            eid = G[u][v].get("edge_id", f"{u}-{v}")
            edges_in_path.append(eid)
        return {
            "path": path,
            "total_cost": length,
            "edges": edges_in_path,
            "hops": len(path) - 1,
        }
    except nx.NetworkXNoPath:
        return {"error": "No path found", "path": [], "total_cost": None}
    except nx.NodeNotFound as e:
        return {"error": str(e), "path": [], "total_cost": None}


def simulate_link_failure(graph_data: dict, edge_from: str, edge_to: str,
                          source: Optional[str] = None, target: Optional[str] = None) -> dict:
    G = _build_graph(graph_data)
    G_failed = G.copy()
    if G_failed.has_edge(edge_from, edge_to):
        G_failed.remove_edge(edge_from, edge_to)

    affected_paths = []
    if source and target:
        try:
            backup = nx.shortest_path(G_failed, source=source, target=target, weight="cost")
            cost = nx.shortest_path_length(G_failed, source=source, target=target, weight="cost")
            affected_paths.append({
                "source": source,
                "target": target,
                "backup_path": backup,
                "backup_cost": cost,
            })
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            affected_paths.append({
                "source": source,
                "target": target,
                "backup_path": [],
                "backup_cost": None,
                "error": "No backup path",
            })

    # Which node pairs lose connectivity?
    disconnected = []
    components_before = nx.number_connected_components(G)
    components_after = nx.number_connected_components(G_failed)
    partition_occurred = components_after > components_before

    return {
        "removed_edge": {"from": edge_from, "to": edge_to},
        "network_partitioned": partition_occurred,
        "affected_paths": affected_paths,
        "components_before": components_before,
        "components_after": components_after,
    }


def simulate_node_failure(graph_data: dict, node_id: str) -> dict:
    G = _build_graph(graph_data)
    G_failed = G.copy()
    if node_id in G_failed:
        G_failed.remove_node(node_id)

    neighbors = list(G.neighbors(node_id)) if node_id in G else []
    components_before = nx.number_connected_components(G)
    components_after = nx.number_connected_components(G_failed)

    # Find which neighbor pairs lose connectivity
    lost_connections = []
    for i, u in enumerate(neighbors):
        for v in neighbors[i + 1:]:
            try:
                nx.shortest_path(G_failed, u, v)
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                lost_connections.append({"from": u, "to": v})

    return {
        "removed_node": node_id,
        "neighbors_affected": neighbors,
        "lost_connections": lost_connections,
        "network_partitioned": components_after > components_before,
        "components_before": components_before,
        "components_after": components_after,
    }


def detect_asymmetric_paths(graph_data: dict) -> list:
    """Find pairs where forward and reverse paths differ."""
    G = _build_graph(graph_data)
    nodes = list(G.nodes())
    asymmetric = []

    for i, u in enumerate(nodes):
        for v in nodes[i + 1:]:
            try:
                fwd = nx.shortest_path(G, u, v, weight="cost")
                rev = nx.shortest_path(G, v, u, weight="cost")
                fwd_cost = nx.shortest_path_length(G, u, v, weight="cost")
                rev_cost = nx.shortest_path_length(G, v, u, weight="cost")
                if fwd != list(reversed(rev)):
                    asymmetric.append({
                        "from": u,
                        "to": v,
                        "forward_path": fwd,
                        "forward_cost": fwd_cost,
                        "reverse_path": rev,
                        "reverse_cost": rev_cost,
                    })
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                pass

    return asymmetric


def compute_heatmap(graph_data: dict) -> dict:
    """Betweenness centrality as heatmap — which nodes carry most traffic."""
    G = _build_graph(graph_data)
    if len(G.nodes()) < 2:
        return {}
    centrality = nx.betweenness_centrality(G, weight="cost", normalized=True)
    return {node: round(score, 4) for node, score in centrality.items()}


def graph_stats(graph_data: dict) -> dict:
    G = _build_graph(graph_data)
    stats = {
        "nodes": G.number_of_nodes(),
        "edges": G.number_of_edges(),
        "connected": nx.is_connected(G),
        "components": nx.number_connected_components(G),
    }
    if G.number_of_nodes() >= 2 and nx.is_connected(G):
        stats["diameter"] = nx.diameter(G)
        stats["avg_shortest_path"] = round(nx.average_shortest_path_length(G, weight="cost"), 3)
    return stats
