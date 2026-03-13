from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
import json

from app.core.database import get_db
from app.models.topology import Topology, TopologySnapshot
from app.parsers.ospf import parse_ospf_lsdb, parse_yaml_topology
from app.services.analysis import (
    shortest_path, simulate_link_failure, simulate_node_failure,
    detect_asymmetric_paths, compute_heatmap, graph_stats
)
from pydantic import BaseModel

router = APIRouter(prefix="/topologies", tags=["topologies"])


# ── Schemas ──────────────────────────────────

class TopologyCreate(BaseModel):
    name: str
    protocol: str = "ospf"
    area: str = "0.0.0.0"

class TopologyUpdate(BaseModel):
    name: Optional[str] = None
    graph_data: Optional[dict] = None
    client_group: Optional[str] = None

class ShortestPathRequest(BaseModel):
    source: str
    target: str
    excluded_nodes: Optional[list] = []

class LinkFailureRequest(BaseModel):
    edge_from: str
    edge_to: str
    source: Optional[str] = None
    target: Optional[str] = None

class NodeFailureRequest(BaseModel):
    node_id: str

class ManualTopologyRequest(BaseModel):
    name: str
    nodes: list
    edges: list


# ── Endpoints ────────────────────────────────

@router.get("/")
def list_topologies(db: Session = Depends(get_db)):
    tops = db.query(Topology).order_by(Topology.created_at.desc()).all()
    return [
        {
            "id": t.id,
            "name": t.name,
            "protocol": t.protocol,
            "area": t.area,
            "client_group": t.client_group,
            "node_count": len(t.graph_data.get("nodes", [])) if t.graph_data else 0,
            "edge_count": len(t.graph_data.get("edges", [])) if t.graph_data else 0,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        }
        for t in tops
    ]


@router.get("/{topology_id}")
def get_topology(topology_id: int, db: Session = Depends(get_db)):
    t = db.query(Topology).filter(Topology.id == topology_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Topology not found")
    return {
        "id": t.id,
        "name": t.name,
        "protocol": t.protocol,
        "area": t.area,
        "client_group": t.client_group,
        "graph_data": t.graph_data,
        "events": t.events or [],
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }


@router.post("/upload")
async def upload_lsdb(
    file: UploadFile = File(...),
    name: str = Form(...),
    protocol: str = Form("ospf"),
    area: str = Form("0.0.0.0"),
    client_group: str = Form(None),
    db: Session = Depends(get_db),
):
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    graph_data = parse_ospf_lsdb(text)

    if graph_data["stats"]["node_count"] == 0:
        raise HTTPException(
            status_code=422,
            detail="Could not parse any routers from the LSDB file. "
                   "Please check the format and try again."
        )

    t = Topology(
        name=name,
        protocol=protocol,
        area=area,
        client_group=client_group or None,
        raw_lsdb=text,
        graph_data=graph_data,
        meta=graph_data.get("stats"),
        events=[],
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return {"id": t.id, "name": t.name, "graph_data": t.graph_data}


@router.post("/manual")
def create_manual_topology(req: ManualTopologyRequest, db: Session = Depends(get_db)):
    graph_data = parse_yaml_topology({"nodes": req.nodes, "edges": req.edges})
    t = Topology(
        name=req.name,
        protocol="manual",
        area="0.0.0.0",
        graph_data=graph_data,
        events=[],
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return {"id": t.id, "name": t.name, "graph_data": t.graph_data}


@router.put("/{topology_id}")
def update_topology(topology_id: int, req: TopologyUpdate, db: Session = Depends(get_db)):
    t = db.query(Topology).filter(Topology.id == topology_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    if req.name:         t.name         = req.name
    if req.client_group is not None: t.client_group = req.client_group or None
    if req.graph_data:
        # Save snapshot before update
        snap = TopologySnapshot(topology_id=t.id, graph_data=t.graph_data, label="auto")
        db.add(snap)
        t.graph_data = req.graph_data
    db.commit()
    db.refresh(t)
    return {"id": t.id, "client_group": t.client_group, "graph_data": t.graph_data}


@router.delete("/{topology_id}")
def delete_topology(topology_id: int, db: Session = Depends(get_db)):
    t = db.query(Topology).filter(Topology.id == topology_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(t)
    db.commit()
    return {"ok": True}


# ── Analysis endpoints ────────────────────────

@router.post("/{topology_id}/shortest-path")
def get_shortest_path(topology_id: int, req: ShortestPathRequest, db: Session = Depends(get_db)):
    t = db.query(Topology).filter(Topology.id == topology_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    return shortest_path(t.graph_data, req.source, req.target, req.excluded_nodes or [])


@router.post("/{topology_id}/simulate-link-failure")
def link_failure(topology_id: int, req: LinkFailureRequest, db: Session = Depends(get_db)):
    t = db.query(Topology).filter(Topology.id == topology_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    return simulate_link_failure(t.graph_data, req.edge_from, req.edge_to, req.source, req.target)


@router.post("/{topology_id}/simulate-node-failure")
def node_failure(topology_id: int, req: NodeFailureRequest, db: Session = Depends(get_db)):
    t = db.query(Topology).filter(Topology.id == topology_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    return simulate_node_failure(t.graph_data, req.node_id)


@router.get("/{topology_id}/asymmetric-paths")
def asymmetric(topology_id: int, db: Session = Depends(get_db)):
    t = db.query(Topology).filter(Topology.id == topology_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    return detect_asymmetric_paths(t.graph_data)


@router.get("/{topology_id}/heatmap")
def heatmap(topology_id: int, db: Session = Depends(get_db)):
    t = db.query(Topology).filter(Topology.id == topology_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    return compute_heatmap(t.graph_data)


@router.get("/{topology_id}/stats")
def stats(topology_id: int, db: Session = Depends(get_db)):
    t = db.query(Topology).filter(Topology.id == topology_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    return graph_stats(t.graph_data)


@router.get("/{topology_id}/snapshots")
def list_snapshots(topology_id: int, db: Session = Depends(get_db)):
    snaps = db.query(TopologySnapshot).filter(
        TopologySnapshot.topology_id == topology_id
    ).order_by(TopologySnapshot.created_at.desc()).all()
    return [{"id": s.id, "label": s.label, "created_at": s.created_at} for s in snaps]


@router.post("/{topology_id}/snapshots")
def create_snapshot(topology_id: int, db: Session = Depends(get_db)):
    t = db.query(Topology).filter(Topology.id == topology_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    snap = TopologySnapshot(topology_id=t.id, graph_data=t.graph_data, label="manual")
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return {"id": snap.id, "created_at": snap.created_at}


# ── Monitoring events ─────────────────────────

class EventRequest(BaseModel):
    type: str   # "link_up" | "link_down" | "node_up" | "node_down" | "cost_change"
    node: Optional[str] = None
    edge_from: Optional[str] = None
    edge_to: Optional[str] = None
    old_cost: Optional[int] = None
    new_cost: Optional[int] = None
    message: Optional[str] = None

@router.post("/{topology_id}/events")
def add_event(topology_id: int, req: EventRequest, db: Session = Depends(get_db)):
    from datetime import datetime
    t = db.query(Topology).filter(Topology.id == topology_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    events = list(t.events or [])
    event = req.dict()
    event["timestamp"] = datetime.utcnow().isoformat()
    events.insert(0, event)
    t.events = events[:200]   # keep last 200
    db.commit()
    return event


@router.get("/{topology_id}/events")
def get_events(topology_id: int, db: Session = Depends(get_db)):
    t = db.query(Topology).filter(Topology.id == topology_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    return t.events or []


# ── SNMP hostname lookup ──────────────────────

class SnmpRequest(BaseModel):
    ip: str
    community: str = "public"
    version: str = "2c"

@router.post("/{topology_id}/snmp-hostname")
def snmp_hostname(topology_id: int, req: SnmpRequest):
    """
    Query sysName.0 (OID 1.3.6.1.2.1.1.5.0) from a device via SNMP.
    Requires pysnmp installed in the container.
    """
    try:
        from pysnmp.hlapi import (
            getCmd, SnmpEngine, CommunityData, UdpTransportTarget,
            ContextData, ObjectType, ObjectIdentity
        )
        version_map = {"1": 0, "2c": 1}
        mp_model = version_map.get(req.version, 1)

        error_indication, error_status, _, var_binds = next(
            getCmd(
                SnmpEngine(),
                CommunityData(req.community, mpModel=mp_model),
                UdpTransportTarget((req.ip, 161), timeout=2, retries=1),
                ContextData(),
                ObjectType(ObjectIdentity("1.3.6.1.2.1.1.5.0")),
            )
        )

        if error_indication or error_status:
            raise HTTPException(status_code=400, detail=str(error_indication or error_status))

        hostname = str(var_binds[0][1]).strip()
        return {"ip": req.ip, "hostname": hostname or None}

    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="pysnmp não instalado. Adicione 'pysnmp' ao requirements.txt e reconstrua o container."
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
