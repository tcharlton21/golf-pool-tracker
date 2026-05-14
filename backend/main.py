import asyncio
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from models.database import SessionLocal, init_db
from routers import auth, events, live, pools

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="Golf Pool Tracker",
    description="Live tracking for Marshalek and Piper golf major pools",
    version="1.0.0",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS: allow localhost for dev + explicit origins from ALLOWED_ORIGINS env var.
# On Render, set ALLOWED_ORIGINS to your exact Vercel URL, e.g.:
#   https://golf-pool-tracker.vercel.app
_extra_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
_allowed_origins = ["http://localhost:3000", *_extra_origins]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(events.router, prefix="/api/v1")
app.include_router(pools.router, prefix="/api/v1")
app.include_router(live.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")


@app.on_event("startup")
async def on_startup():
    init_db()
    log = logging.getLogger(__name__)
    log.info("Database initialized")

    # Auto-resume refresh loops for any events that were active before restart
    from models.database import Event
    db = SessionLocal()
    try:
        active_events = db.query(Event).filter_by(is_active=True).all()
        for event in active_events:
            log.info(f"Auto-starting refresh loop for active event: {event.name}")
            task = asyncio.create_task(
                live._refresh_loop(event.id, event.dk_event_slug)
            )
            live._refresh_tasks[event.id] = task
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok"}
