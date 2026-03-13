from sqlalchemy import Column, Integer, String, Float, DateTime, JSON, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class Topology(Base):
    __tablename__ = "topologies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    protocol = Column(String(50), default="ospf")
    area = Column(String(50), default="0.0.0.0")
    client_group = Column(String(128), nullable=True)   # link to physical client group
    raw_lsdb = Column(Text, nullable=True)
    graph_data = Column(JSON, nullable=True)   # {nodes, edges}
    meta = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    snapshots = relationship("TopologySnapshot", back_populates="topology", cascade="all, delete-orphan")
    events = Column(JSON, nullable=True, default=list)   # monitoring events list

class TopologySnapshot(Base):
    __tablename__ = "topology_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    topology_id = Column(Integer, ForeignKey("topologies.id"), nullable=False)
    graph_data = Column(JSON, nullable=False)
    label = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    topology = relationship("Topology", back_populates="snapshots")
