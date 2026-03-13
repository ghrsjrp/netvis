from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import engine, Base
from app.api.topologies import router as topo_router
from app.api.physical import router as physical_router
import app.models.topology   # noqa
import app.models.physical   # noqa

Base.metadata.create_all(bind=engine)

# ── Safe column migrations (add if not exists) ─────────────
def _migrate():
    from sqlalchemy import text
    with engine.connect() as conn:
        for stmt in [
            "ALTER TABLE physical_devices ADD COLUMN IF NOT EXISTS group_name VARCHAR(128)",
            "ALTER TABLE physical_topologies ADD COLUMN IF NOT EXISTS group_name VARCHAR(128)",
            "ALTER TABLE topologies ADD COLUMN IF NOT EXISTS client_group VARCHAR(128)",
            "ALTER TABLE physical_devices ADD COLUMN IF NOT EXISTS wiki_name VARCHAR(255)",
            "ALTER TABLE physical_devices ADD COLUMN IF NOT EXISTS ssh_port INTEGER DEFAULT 22",
            "ALTER TABLE physical_devices ADD COLUMN IF NOT EXISTS ssh_user VARCHAR(128)",
            "ALTER TABLE physical_devices ADD COLUMN IF NOT EXISTS ssh_password VARCHAR(255)",
            "ALTER TABLE physical_devices ADD COLUMN IF NOT EXISTS ssh_status VARCHAR(16)",
            "ALTER TABLE physical_devices ADD COLUMN IF NOT EXISTS snmp_status VARCHAR(16)",
            "ALTER TABLE physical_devices ADD COLUMN IF NOT EXISTS ssh_log TEXT",
            "ALTER TABLE physical_devices ADD COLUMN IF NOT EXISTS snmp_log TEXT",
            "ALTER TABLE physical_devices ADD COLUMN IF NOT EXISTS snmp_sysname VARCHAR(255)",
            "ALTER TABLE physical_devices ADD COLUMN IF NOT EXISTS vendor VARCHAR(64)",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                conn.rollback()

_migrate()

app = FastAPI(
    title="NetVis API",
    description="OSPF + Physical topology visualization",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(topo_router, prefix="/api")
app.include_router(physical_router, prefix="/api")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/api/migrate")
def run_migrate():
    """Force-run DB migrations. Safe to call multiple times (IF NOT EXISTS)."""
    _migrate()
    return {"status": "ok", "message": "migrations applied"}

@app.get("/api/debug/columns")
def debug_columns():
    """Check which columns exist in key tables."""
    from sqlalchemy import text, inspect
    insp = inspect(engine)
    return {
        table: [c["name"] for c in insp.get_columns(table)]
        for table in ["topologies", "physical_devices", "physical_topologies"]
        if insp.has_table(table)
    }
