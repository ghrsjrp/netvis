from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel
import asyncio
import re

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
    wiki_name: Optional[str] = None
    ssh_port: Optional[int] = 22
    ssh_user: Optional[str] = None
    ssh_password: Optional[str] = None

class DeviceUpdate(BaseModel):
    community: Optional[str] = None
    snmp_ver: Optional[str] = None
    hostname: Optional[str] = None
    group_name: Optional[str] = None
    wiki_name: Optional[str] = None
    ssh_port: Optional[int] = None
    ssh_user: Optional[str] = None
    ssh_password: Optional[str] = None

class CrawlRequest(BaseModel):
    name: Optional[str] = "Topologia Fisica"
    group_name: Optional[str] = None

class WikiParseRequest(BaseModel):
    text: str
    group_name: Optional[str] = None
    default_community: Optional[str] = "public"


# ── Wiki parser ────────────────────────────────────────────

def parse_wiki_devices(text: str, group_name: str = None, default_community: str = "public") -> list:
    devices = []
    blocks = re.split(r'\n\s*\n', text.strip())

    for block in blocks:
        lines = [l.strip() for l in block.strip().splitlines() if l.strip()]
        if not lines:
            continue

        dev = {
            'ip': None, 'wiki_name': None, 'ssh_port': 22,
            'ssh_user': None, 'ssh_password': None,
            'community': default_community, 'snmp_ver': '2c',
            'group_name': group_name,
        }

        for i, line in enumerate(lines):
            clean = re.sub(r'^\*+\s*', '', line).strip()
            cl = clean.lower()

            # First non-bullet line = device name
            if not line.startswith('*') and i == 0:
                dev['wiki_name'] = clean
                dev['hostname'] = clean
                continue

            ip_match = re.search(r'\b(\d{1,3}(?:\.\d{1,3}){3})\b', clean)

            if re.search(r'\b(porta|port)\s*[:\-]?\s*\d+', cl):
                m = re.search(r'\b(?:porta|port)\s*[:\-]?\s*(\d+)', cl)
                if m: dev['ssh_port'] = int(m.group(1))
            elif re.search(r'\b(user|usuario|login)\s*[:\-]', cl):
                m = re.search(r'\b(?:user|usuario|login)\s*[:\-]\s*(\S+)', clean, re.IGNORECASE)
                if m: dev['ssh_user'] = m.group(1)
            elif re.search(r'\b(senha|password|pass)\s*[:\-]', cl):
                m = re.search(r'\b(?:senha|password|pass)\s*[:\-]\s*(\S+)', clean, re.IGNORECASE)
                if m: dev['ssh_password'] = m.group(1)
            elif re.search(r'\b(community|snmp)\s*[:\-]', cl):
                m = re.search(r'\b(?:community|snmp)\s*[:\-]\s*(\S+)', clean, re.IGNORECASE)
                if m: dev['community'] = m.group(1)
            elif ip_match and not dev['ip']:
                dev['ip'] = ip_match.group(1)

        if dev['ip']:
            devices.append(dev)

    return devices


# ── Helpers ────────────────────────────────────────────────

def _device_to_dict(d: PhysicalDevice) -> dict:
    return {
        'id': d.id, 'ip': d.ip, 'hostname': d.hostname,
        'group_name': d.group_name, 'community': d.community, 'snmp_ver': d.snmp_ver,
        'reachable': d.reachable, 'last_polled': d.last_polled,
        'sys_descr': d.sys_descr, 'meta': d.meta,
        'wiki_name': d.wiki_name, 'ssh_port': d.ssh_port,
        'ssh_user': d.ssh_user, 'ssh_password': d.ssh_password,
        'ssh_status': d.ssh_status, 'snmp_status': d.snmp_status,
        'ssh_log': d.ssh_log, 'snmp_log': d.snmp_log,
        'snmp_sysname': d.snmp_sysname, 'vendor': d.vendor,
        'created_at': d.created_at,
    }


# ── Device CRUD ────────────────────────────────────────────

@router.get("/devices")
def list_devices(db: Session = Depends(get_db)):
    return [_device_to_dict(d) for d in db.query(PhysicalDevice).order_by(PhysicalDevice.ip).all()]


@router.post("/devices")
def add_device(req: DeviceIn, db: Session = Depends(get_db)):
    existing = db.query(PhysicalDevice).filter(PhysicalDevice.ip == req.ip).first()
    if existing:
        if not existing.group_name and req.group_name:
            existing.group_name = req.group_name
            if req.community != "public": existing.community = req.community
            if req.ssh_user:             existing.ssh_user = req.ssh_user
            if req.ssh_password:         existing.ssh_password = req.ssh_password
            if req.ssh_port:             existing.ssh_port = req.ssh_port
            if req.wiki_name:            existing.wiki_name = req.wiki_name
            db.commit(); db.refresh(existing)
            return _device_to_dict(existing)
        raise HTTPException(status_code=409, detail=f"IP {req.ip} ja existe")
    dev = PhysicalDevice(
        ip=req.ip, community=req.community, snmp_ver=req.snmp_ver,
        hostname=req.hostname or req.ip, group_name=req.group_name,
        wiki_name=req.wiki_name, ssh_port=req.ssh_port or 22,
        ssh_user=req.ssh_user, ssh_password=req.ssh_password,
    )
    db.add(dev); db.commit(); db.refresh(dev)
    return _device_to_dict(dev)


@router.post("/devices/bulk")
def add_devices_bulk(devices: List[DeviceIn], db: Session = Depends(get_db)):
    added, skipped = [], []
    for d in devices:
        existing = db.query(PhysicalDevice).filter(PhysicalDevice.ip == d.ip).first()
        if existing:
            skipped.append(d.ip) if existing.group_name else added.append(d.ip)
            if not existing.group_name and d.group_name:
                existing.group_name = d.group_name
            continue
        dev = PhysicalDevice(
            ip=d.ip, community=d.community, snmp_ver=d.snmp_ver,
            hostname=d.hostname or d.ip, group_name=d.group_name,
            wiki_name=d.wiki_name, ssh_port=d.ssh_port or 22,
            ssh_user=d.ssh_user, ssh_password=d.ssh_password,
        )
        db.add(dev); added.append(d.ip)
    db.commit()
    return {"added": added, "skipped": skipped}


@router.post("/devices/wiki-import")
def wiki_import(req: WikiParseRequest, db: Session = Depends(get_db)):
    parsed = parse_wiki_devices(req.text, req.group_name, req.default_community or "public")
    if not parsed:
        raise HTTPException(status_code=400, detail="Nenhum equipamento encontrado. Verifique o formato.")
    added, skipped = [], []
    for d in parsed:
        existing = db.query(PhysicalDevice).filter(PhysicalDevice.ip == d['ip']).first()
        if existing:
            skipped.append(d['ip']); continue
        dev = PhysicalDevice(
            ip=d['ip'], community=d['community'], snmp_ver=d['snmp_ver'],
            hostname=d.get('wiki_name') or d['ip'], group_name=d['group_name'],
            wiki_name=d.get('wiki_name'), ssh_port=d.get('ssh_port') or 22,
            ssh_user=d.get('ssh_user'), ssh_password=d.get('ssh_password'),
        )
        db.add(dev); added.append(d['ip'])
    db.commit()
    return {"added": added, "skipped": skipped, "parsed": parsed}


@router.put("/devices/{device_id}")
def update_device(device_id: int, req: DeviceUpdate, db: Session = Depends(get_db)):
    dev = db.query(PhysicalDevice).filter(PhysicalDevice.id == device_id).first()
    if not dev: raise HTTPException(status_code=404, detail="Not found")
    for f in ['community','snmp_ver','hostname','group_name','wiki_name','ssh_port','ssh_user','ssh_password']:
        v = getattr(req, f, None)
        if v is not None: setattr(dev, f, v)
    db.commit(); db.refresh(dev)
    return _device_to_dict(dev)


@router.delete("/devices/{device_id}")
def delete_device(device_id: int, db: Session = Depends(get_db)):
    dev = db.query(PhysicalDevice).filter(PhysicalDevice.id == device_id).first()
    if not dev: raise HTTPException(status_code=404, detail="Not found")
    db.delete(dev); db.commit()
    return {"deleted": device_id}


@router.post("/devices/{device_id}/test")
def test_device(device_id: int, db: Session = Depends(get_db)):
    dev = db.query(PhysicalDevice).filter(PhysicalDevice.id == device_id).first()
    if not dev: raise HTTPException(status_code=404, detail="Not found")

    # SNMP
    snmp_result = poll_device(dev.ip, dev.community, dev.snmp_ver)
    dev.reachable   = snmp_result["reachable"]
    dev.last_polled = datetime.utcnow()
    if snmp_result["reachable"]:
        dev.snmp_status  = "ok"
        dev.snmp_log     = "SNMP OK"
        dev.hostname     = snmp_result.get("hostname") or dev.hostname
        dev.sys_descr    = snmp_result.get("sys_descr", "")
        raw_sysname      = snmp_result.get("hostname", "")
        if raw_sysname and raw_sysname != dev.ip:
            dev.snmp_sysname = raw_sysname
        from app.services.ssh_service import detect_vendor_from_sysdescr
        if dev.sys_descr:
            detected = detect_vendor_from_sysdescr(dev.sys_descr)
            if detected != 'unknown': dev.vendor = detected
    else:
        dev.snmp_status = "error"
        dev.snmp_log    = snmp_result.get("error", "SNMP sem resposta")

    # SSH
    ssh_result = None
    if dev.ssh_user and dev.ssh_password:
        from app.services.ssh_service import test_ssh
        ssh_result = test_ssh(dev.ip, dev.ssh_port or 22, dev.ssh_user, dev.ssh_password)
        dev.ssh_status = "ok" if ssh_result["ok"] else "error"
        dev.ssh_log    = ssh_result["log"]
        if ssh_result.get("vendor") and ssh_result["vendor"] != "unknown":
            dev.vendor = ssh_result["vendor"]

    db.commit(); db.refresh(dev)
    return {**_device_to_dict(dev), "snmp_result": snmp_result, "ssh_result": ssh_result}


@router.post("/devices/{device_id}/scan")
def scan_device(device_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    dev = db.query(PhysicalDevice).filter(PhysicalDevice.id == device_id).first()
    if not dev: raise HTTPException(status_code=404, detail="Not found")
    if not dev.ssh_user or not dev.ssh_password:
        raise HTTPException(status_code=400, detail="Credenciais SSH nao configuradas")
    dev.ssh_status = "scanning"
    db.commit()
    background_tasks.add_task(_run_scan, device_id)
    return {"status": "scanning", "device_id": device_id}


@router.get("/devices/{device_id}/scan-status")
def get_scan_status(device_id: int, db: Session = Depends(get_db)):
    dev = db.query(PhysicalDevice).filter(PhysicalDevice.id == device_id).first()
    if not dev: raise HTTPException(status_code=404, detail="Not found")
    return {"ssh_status": dev.ssh_status, "ssh_log": dev.ssh_log, "meta": dev.meta}


def _run_scan(device_id: int):
    from app.core.database import SessionLocal
    from app.services.ssh_service import scan_device_by_vendor
    db = SessionLocal()
    try:
        dev = db.query(PhysicalDevice).filter(PhysicalDevice.id == device_id).first()
        if not dev: return

        # Detect vendor via SNMP first (most reliable, no SSH needed)
        vendor = dev.vendor
        if not vendor or vendor == 'unknown':
            from app.services.lldp_crawler import poll_device as snmp_poll
            from app.services.ssh_service import detect_vendor_from_sysdescr
            snmp_r = snmp_poll(dev.ip, dev.community, dev.snmp_ver)
            if snmp_r.get('reachable'):
                sysdescr = snmp_r.get('sys_descr', '')
                vendor = detect_vendor_from_sysdescr(sysdescr)
                if vendor and vendor != 'unknown':
                    dev.vendor = vendor
                    db.commit()

        result = scan_device_by_vendor(
            vendor=vendor or 'unknown',
            ip=dev.ip,
            port=dev.ssh_port or 22,
            username=dev.ssh_user,
            password=dev.ssh_password,
            snmp_community=dev.community,
        )
        dev.ssh_status = "ok" if result["ok"] else "error"
        dev.ssh_log    = result["log"]
        meta = dev.meta or {}
        meta["scan_result"] = {
            "vendor": vendor,
            "changes_made": result["changes_made"], "changes": result["changes"],
            "snmp_config_after": result.get("snmp_config_after", ""),
            "community_lines": result.get("community_lines", []),
            "ports_configured": result.get("ports_configured", []),
            "scanned_at": datetime.utcnow().isoformat(),
        }
        dev.meta = meta
        db.commit()
    except Exception as e:
        db.rollback()
        dev = db.query(PhysicalDevice).filter(PhysicalDevice.id == device_id).first()
        if dev:
            dev.ssh_status = "error"; dev.ssh_log = str(e); db.commit()
    finally:
        db.close()


# ── Topologies ─────────────────────────────────────────────

@router.get("/topologies")
def list_topologies(db: Session = Depends(get_db)):
    return db.query(PhysicalTopology).order_by(PhysicalTopology.crawled_at.desc()).all()

@router.get("/topologies/latest")
def latest_topology(db: Session = Depends(get_db)):
    t = db.query(PhysicalTopology).order_by(PhysicalTopology.crawled_at.desc()).first()
    if not t: raise HTTPException(status_code=404, detail="Nenhuma topologia ainda")
    return t

@router.get("/topologies/{topo_id}")
def get_topology(topo_id: int, db: Session = Depends(get_db)):
    t = db.query(PhysicalTopology).filter(PhysicalTopology.id == topo_id).first()
    if not t: raise HTTPException(status_code=404, detail="Not found")
    return t

@router.delete("/topologies/{topo_id}")
def delete_topology(topo_id: int, db: Session = Depends(get_db)):
    t = db.query(PhysicalTopology).filter(PhysicalTopology.id == topo_id).first()
    if not t: raise HTTPException(status_code=404, detail="Not found")
    db.delete(t); db.commit()
    return {"deleted": topo_id}

@router.get("/groups")
def list_groups(db: Session = Depends(get_db)):
    from sqlalchemy import func
    rows = (db.query(PhysicalDevice.group_name, func.count(PhysicalDevice.id).label("count"))
            .group_by(PhysicalDevice.group_name).all())
    return [{"group": r.group_name or "", "count": r.count} for r in rows]


# ── Crawl ──────────────────────────────────────────────────

def _run_crawl(topo_id: int, devices_data: list):
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        topo = db.query(PhysicalTopology).filter(PhysicalTopology.id == topo_id).first()
        if not topo: return
        topo.status = "running"; db.commit()
        results, graph = asyncio.run(crawl_lldp(devices_data))
        for r in results:
            dev = db.query(PhysicalDevice).filter(PhysicalDevice.ip == r["ip"]).first()
            if dev:
                dev.reachable = r["reachable"]; dev.last_polled = datetime.utcnow()
                if r["reachable"]:
                    dev.hostname = r.get("hostname") or dev.hostname
                    dev.sys_descr = r.get("sys_descr", "")
        topo.graph_data = graph; topo.status = "done"; topo.crawled_at = datetime.utcnow()
        topo.meta = {
            "total_devices": len(devices_data),
            "reachable": sum(1 for r in results if r["reachable"]),
            "unreachable": sum(1 for r in results if not r["reachable"]),
            "nodes_discovered": len(graph.get("nodes", [])),
            "links_discovered": len(graph.get("edges", [])),
        }
        db.commit()
    except Exception as exc:
        db.rollback()
        topo = db.query(PhysicalTopology).filter(PhysicalTopology.id == topo_id).first()
        if topo: topo.status = "error"; topo.error_msg = str(exc); db.commit()
    finally:
        db.close()


@router.post("/crawl")
def start_crawl(req: CrawlRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    query = db.query(PhysicalDevice)
    if req.group_name: query = query.filter(PhysicalDevice.group_name == req.group_name)
    devices = query.all()
    if not devices:
        raise HTTPException(status_code=400, detail="Nenhum dispositivo encontrado para este grupo")
    from datetime import datetime as dt
    name = req.name or (f"Topologia {req.group_name}" if req.group_name else f"Topologia {dt.now().strftime('%d/%m %H:%M')}")
    topo = PhysicalTopology(name=name, group_name=req.group_name, status="running")
    db.add(topo); db.commit(); db.refresh(topo)
    devices_data = [{"ip": d.ip, "community": d.community, "snmp_ver": d.snmp_ver} for d in devices]
    background_tasks.add_task(_run_crawl, topo.id, devices_data)
    return {"topology_id": topo.id, "status": "running", "devices": len(devices_data)}


@router.get("/crawl/{topo_id}/status")
def crawl_status(topo_id: int, db: Session = Depends(get_db)):
    t = db.query(PhysicalTopology).filter(PhysicalTopology.id == topo_id).first()
    if not t: raise HTTPException(status_code=404, detail="Not found")
    return {"id": t.id, "status": t.status, "crawled_at": t.crawled_at,
            "error_msg": t.error_msg, "meta": t.meta}
