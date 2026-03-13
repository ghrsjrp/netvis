from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel
import asyncio

from app.core.database import get_db
from app.models.physical import PhysicalDevice, PhysicalTopology
from app.services.lldp_crawler import crawl_lldp, poll_device

router = APIRouter(prefix="/physical", tags=["physical"])


# ── Schemas ────────────────────────────────────────────────

class DeviceIn(BaseModel):
    ip: str
    community: str = "public"
    snmp_ver: str = "2c"
    hostname: Optional[str] = None
    group_name: Optional[str] = None

class DeviceUpdate(BaseModel):
    community: Optional[str] = None
    snmp_ver: Optional[str] = None
    hostname: Optional[str] = None
    group_name: Optional[str] = None

class CrawlRequest(BaseModel):
    name: Optional[str] = "Topologia Física"
    group_name: Optional[str] = None   # None = crawl all devices merged


# ── Device CRUD ────────────────────────────────────────────

@router.get("/devices")
def list_devices(db: Session = Depends(get_db)):
    return db.query(PhysicalDevice).order_by(PhysicalDevice.ip).all()


@router.post("/devices")
def add_device(req: DeviceIn, db: Session = Depends(get_db)):
    existing = db.query(PhysicalDevice).filter(PhysicalDevice.ip == req.ip).first()
    if existing:
        # If it exists but has no group (orphan), just assign the group
        if not existing.group_name and req.group_name:
            existing.group_name = req.group_name
            if req.community != "public": existing.community = req.community
            if req.snmp_ver  != "2c":    existing.snmp_ver  = req.snmp_ver
            db.commit(); db.refresh(existing)
            return existing
        raise HTTPException(status_code=409, detail=f"IP {req.ip} já existe")
    dev = PhysicalDevice(
        ip=req.ip,
        community=req.community,
        snmp_ver=req.snmp_ver,
        hostname=req.hostname or req.ip,
        group_name=req.group_name,
    )
    db.add(dev); db.commit(); db.refresh(dev)
    return dev


@router.post("/devices/bulk")
def add_devices_bulk(devices: List[DeviceIn], db: Session = Depends(get_db)):
    """Add multiple devices at once, skip duplicates."""
    added, skipped = [], []
    for d in devices:
        existing = db.query(PhysicalDevice).filter(PhysicalDevice.ip == d.ip).first()
        if existing:
            # Reassign orphan to group
            if not existing.group_name and d.group_name:
                existing.group_name = d.group_name
                added.append(d.ip)
            else:
                skipped.append(d.ip)
            continue
        dev = PhysicalDevice(
            ip=d.ip,
            community=d.community,
            snmp_ver=d.snmp_ver,
            hostname=d.hostname or d.ip,
            group_name=d.group_name,
        )
        db.add(dev)
        added.append(d.ip)
    db.commit()
    return {"added": added, "skipped": skipped}


@router.put("/devices/{device_id}")
def update_device(device_id: int, req: DeviceUpdate, db: Session = Depends(get_db)):
    dev = db.query(PhysicalDevice).filter(PhysicalDevice.id == device_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="Not found")
    if req.community  is not None: dev.community  = req.community
    if req.snmp_ver   is not None: dev.snmp_ver   = req.snmp_ver
    if req.hostname   is not None: dev.hostname   = req.hostname
    if req.group_name is not None: dev.group_name = req.group_name
    db.commit(); db.refresh(dev)
    return dev


@router.delete("/devices/{device_id}")
def delete_device(device_id: int, db: Session = Depends(get_db)):
    dev = db.query(PhysicalDevice).filter(PhysicalDevice.id == device_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(dev); db.commit()
    return {"deleted": device_id}


@router.post("/devices/{device_id}/test")
def test_device(device_id: int, db: Session = Depends(get_db)):
    """Quick SNMP reachability test for a single device."""
    dev = db.query(PhysicalDevice).filter(PhysicalDevice.id == device_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail="Not found")
    result = poll_device(dev.ip, dev.community, dev.snmp_ver)
    dev.reachable   = result["reachable"]
    dev.last_polled = datetime.utcnow()
    if result["reachable"]:
        dev.hostname  = result.get("hostname") or dev.hostname
        dev.sys_descr = result.get("sys_descr", "")
    db.commit(); db.refresh(dev)
    return result


# ── Topology CRUD ──────────────────────────────────────────

@router.get("/topologies")
def list_topologies(db: Session = Depends(get_db)):
    return db.query(PhysicalTopology).order_by(PhysicalTopology.crawled_at.desc()).all()


@router.get("/topologies/latest")
def latest_topology(db: Session = Depends(get_db)):
    t = db.query(PhysicalTopology).order_by(PhysicalTopology.crawled_at.desc()).first()
    if not t:
        raise HTTPException(status_code=404, detail="Nenhuma topologia ainda")
    return t


@router.get("/topologies/{topo_id}")
def get_topology(topo_id: int, db: Session = Depends(get_db)):
    t = db.query(PhysicalTopology).filter(PhysicalTopology.id == topo_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    return t


@router.delete("/topologies/{topo_id}")
def delete_topology(topo_id: int, db: Session = Depends(get_db)):
    t = db.query(PhysicalTopology).filter(PhysicalTopology.id == topo_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(t); db.commit()
    return {"deleted": topo_id}


@router.get("/groups")
def list_groups(db: Session = Depends(get_db)):
    """Return distinct group names with device counts."""
    from sqlalchemy import func
    rows = (
        db.query(PhysicalDevice.group_name, func.count(PhysicalDevice.id).label("count"))
        .group_by(PhysicalDevice.group_name)
        .all()
    )
    return [{"group": r.group_name or "", "count": r.count} for r in rows]


# ── Crawl ──────────────────────────────────────────────────

def _run_crawl(topo_id: int, devices_data: list):
    """Background task — runs the async crawler in a new event loop."""
    import asyncio
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        topo = db.query(PhysicalTopology).filter(PhysicalTopology.id == topo_id).first()
        if not topo:
            return
        topo.status = "running"
        db.commit()

        results, graph = asyncio.run(crawl_lldp(devices_data))

        # Update device records with results
        for r in results:
            dev = db.query(PhysicalDevice).filter(PhysicalDevice.ip == r["ip"]).first()
            if dev:
                dev.reachable   = r["reachable"]
                dev.last_polled = datetime.utcnow()
                if r["reachable"]:
                    dev.hostname  = r.get("hostname") or dev.hostname
                    dev.sys_descr = r.get("sys_descr", "")

        topo.graph_data = graph
        topo.status     = "done"
        topo.crawled_at = datetime.utcnow()
        topo.meta = {
            "total_devices":    len(devices_data),
            "reachable":        sum(1 for r in results if r["reachable"]),
            "unreachable":      sum(1 for r in results if not r["reachable"]),
            "nodes_discovered": len(graph.get("nodes", [])),
            "links_discovered": len(graph.get("edges", [])),
        }
        db.commit()
    except Exception as exc:
        db.rollback()
        topo = db.query(PhysicalTopology).filter(PhysicalTopology.id == topo_id).first()
        if topo:
            topo.status    = "error"
            topo.error_msg = str(exc)
            db.commit()
    finally:
        db.close()


@router.post("/crawl")
def start_crawl(req: CrawlRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Start an LLDP crawl. Optionally filter by group_name."""
    query = db.query(PhysicalDevice)
    if req.group_name:
        query = query.filter(PhysicalDevice.group_name == req.group_name)
    devices = query.all()
    if not devices:
        raise HTTPException(status_code=400, detail="Nenhum dispositivo encontrado para este grupo")

    from datetime import datetime as dt
    topo_name = req.name or (f"Topologia {req.group_name}" if req.group_name else f"Topologia {dt.now().strftime('%d/%m/%Y %H:%M')}")
    topo = PhysicalTopology(name=topo_name, group_name=req.group_name, status="running")
    db.add(topo); db.commit(); db.refresh(topo)

    devices_data = [
        {"ip": d.ip, "community": d.community, "snmp_ver": d.snmp_ver}
        for d in devices
    ]

    background_tasks.add_task(_run_crawl, topo.id, devices_data)
    return {"topology_id": topo.id, "status": "running", "devices": len(devices_data)}


@router.get("/crawl/{topo_id}/status")
def crawl_status(topo_id: int, db: Session = Depends(get_db)):
    t = db.query(PhysicalTopology).filter(PhysicalTopology.id == topo_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Not found")
    return {
        "id":         t.id,
        "status":     t.status,
        "crawled_at": t.crawled_at,
        "error_msg":  t.error_msg,
        "meta":       t.meta,
    }
