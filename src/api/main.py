"""FastAPI application factory for RegimeRadar."""
from __future__ import annotations
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from src.api.routes import router
from src.api.state import AppState
from src.utils.logging import get_logger

_logger = get_logger(__name__)


def create_app(app_state: AppState | None = None, start_scheduler: bool = True) -> FastAPI:
    """Create and configure the FastAPI application.

    Args:
        app_state: optional pre-built AppState (used in tests to inject fixtures)
        start_scheduler: if True, start the APScheduler background job
    """
    app = FastAPI(
        title="RegimeRadar",
        description="Live Market State & Transition Risk Monitor",
        version="1.0.0",
    )

    cors_origin = os.environ.get("CORS_ORIGIN")
    allow_origins = [cors_origin] if cors_origin else ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    if app_state is None:
        app_state = AppState()

    app.state.app_state = app_state
    app.include_router(router)

    @app.on_event("startup")
    async def startup():
        import threading
        _logger.info("RegimeRadar API starting up")

        # Step 1: immediately load committed snapshots so the server can serve
        # requests in demo mode within ~2–3 seconds — no network calls required.
        try:
            app_state._load_from_snapshots()
            _logger.info("Snapshot data loaded — serving in demo mode")
        except Exception as snap_exc:
            _logger.error("Snapshot load failed on startup: %s", snap_exc)

        # Step 2: start the recurring refresh scheduler.
        if start_scheduler:
            app_state.start_scheduler()

        # Step 3: attempt a live yfinance+FRED refresh in a background thread so
        # it never blocks the event loop or delays the first response. If it
        # succeeds the state flips to live; if it fails demo mode persists and
        # the scheduler retries on its normal interval.
        def _bg_live_refresh() -> None:
            try:
                app_state._do_refresh()
                _logger.info("Background startup refresh succeeded — now in live mode")
            except Exception as exc:
                _logger.warning("Background startup refresh failed, staying in demo: %s", exc)

        threading.Thread(
            target=_bg_live_refresh, daemon=True, name="startup-live-refresh"
        ).start()

    @app.on_event("shutdown")
    async def shutdown():
        _logger.info("RegimeRadar API shutting down")
        app_state.stop_scheduler()

    return app


# For running directly with `uvicorn src.api.main:app`
app = create_app()
