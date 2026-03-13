from sqlalchemy import Column, Integer, String, DateTime, JSON, Boolean, Text
from datetime import datetime
from app.core.database import Base


class PhysicalDevice(Base):
    """A network device (switch/router) discovered or manually added."""
    __tablename__ = "physical_devices"

    id          = Column(Integer, primary_key=True, index=True)
    ip          = Column(String(64), unique=True, nullable=False, index=True)
    hostname    = Column(String(255), nullable=True)
    group_name  = Column(String(128), nullable=True)   # e.g. "Conect BA", "Conect SP"
    community   = Column(String(128), default="public")
    snmp_ver    = Column(String(8), default="2c")
    device_type = Column(String(64), nullable=True)   # switch / router / unknown
    sys_descr   = Column(Text, nullable=True)
    sys_oid     = Column(String(128), nullable=True)
    reachable   = Column(Boolean, default=False)
    last_polled = Column(DateTime, nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    meta        = Column(JSON, nullable=True)          # vendor, model, etc.
    # SSH credentials
    wiki_name   = Column(String(255), nullable=True)   # name from wiki (e.g. "S6730 (SP4)")
    ssh_port    = Column(Integer, default=22)
    ssh_user    = Column(String(128), nullable=True)
    ssh_password= Column(String(255), nullable=True)
    # Status fields
    ssh_status  = Column(String(16), nullable=True)    # ok | error | null
    snmp_status = Column(String(16), nullable=True)    # ok | error | null
    ssh_log     = Column(Text, nullable=True)
    snmp_log    = Column(Text, nullable=True)
    snmp_sysname= Column(String(255), nullable=True)   # sysName from SNMP
    vendor      = Column(String(64), nullable=True)    # huawei | cisco | juniper | etc


class PhysicalTopology(Base):
    """Snapshot of the physical topology graph built from LLDP."""
    __tablename__ = "physical_topologies"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(255), default="Topologia Física")
    group_name = Column(String(128), nullable=True)   # null = all groups merged
    graph_data = Column(JSON, nullable=True)   # {nodes, edges}
    crawled_at = Column(DateTime, default=datetime.utcnow)
    status     = Column(String(32), default="idle")  # idle | running | done | error
    error_msg  = Column(Text, nullable=True)
    meta       = Column(JSON, nullable=True)
