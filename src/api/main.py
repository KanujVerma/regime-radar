"""FastAPI application factory for RegimeRadar."""
from __future__ import annotations
from fastapi import FastAPI, Request
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

    if app_state is None:
        app_state = AppState()

    app.state.app_state = app_state
    app.include_router(router)

    @app.on_event("startup")
    async def startup():
        _logger.info("RegimeRadar API starting up")
        if start_scheduler:
            app_state.start_scheduler()

    @app.on_event("shutdown")
    async def shutdown():
        _logger.info("RegimeRadar API shutting down")
        app_state.stop_scheduler()

    return app


# For running directly with `uvicorn src.api.main:app`
app = create_app()
