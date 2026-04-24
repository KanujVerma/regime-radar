"""Smoke tests for the FastAPI endpoints."""
import pytest
from fastapi.testclient import TestClient
from src.api.main import create_app
from src.api.state import AppState
import tempfile
import os


@pytest.fixture
def app_with_state(tmp_path):
    """Create app with a fresh in-memory AppState backed by a temp DB."""
    state = AppState(db_path=tmp_path / "test.db")
    app = create_app(app_state=state, start_scheduler=False)
    return app, state


class TestHealthEndpoint:
    def test_health_returns_200(self, app_with_state):
        app, state = app_with_state
        client = TestClient(app)
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "mode" in data

    def test_health_mode_is_demo_without_key(self, app_with_state, monkeypatch):
        monkeypatch.delenv("FINNHUB_API_KEY", raising=False)
        app, state = app_with_state
        client = TestClient(app)
        resp = client.get("/health")
        assert resp.status_code == 200


class TestCurrentStateEndpoint:
    def test_current_state_503_when_no_data(self, app_with_state):
        app, _ = app_with_state
        client = TestClient(app)
        resp = client.get("/current-state")
        assert resp.status_code == 503

    def test_current_state_returns_200_after_write(self, app_with_state):
        app, state = app_with_state
        state.write_state({
            "as_of_ts": "2024-01-01T00:00:00+00:00",
            "regime": "calm",
            "transition_risk": 0.12,
            "trend": "uptrend",
            "vix_level": 15.3,
            "vix_chg_1d": -0.5,
            "top_drivers": [],
            "mode": "demo",
            "price_card_price": None,
        })
        client = TestClient(app)
        resp = client.get("/current-state")
        assert resp.status_code == 200
        data = resp.json()
        assert data["regime"] == "calm"
        assert data["transition_risk"] == pytest.approx(0.12)
        assert data["mode"] == "demo"


class TestRefreshEndpoint:
    def test_refresh_returns_500_without_data(self, app_with_state, monkeypatch):
        """Force refresh propagates errors as HTTP 500 when data is unavailable."""
        app, state = app_with_state

        def _failing_refresh():
            raise RuntimeError("No data available in test environment")

        monkeypatch.setattr(state, "force_refresh", _failing_refresh)
        client = TestClient(app)
        resp = client.post("/refresh-data")
        assert resp.status_code == 500

    def test_refresh_returns_200_on_success(self, app_with_state, monkeypatch):
        """Force refresh returns 200 when it completes without error."""
        app, state = app_with_state

        def _noop_refresh():
            pass

        monkeypatch.setattr(state, "force_refresh", _noop_refresh)
        client = TestClient(app)
        resp = client.post("/refresh-data")
        assert resp.status_code == 200
        assert resp.json()["status"] == "refreshed"


def test_read_prior_state_returns_none_on_empty_db(tmp_path):
    from src.api.state import AppState
    state = AppState(db_path=str(tmp_path / "test.db"))
    assert state.read_prior_state() is None

def test_cors_header_present(monkeypatch, tmp_path):
    # CORS_ORIGIN must be set before create_app() so the middleware captures it
    monkeypatch.setenv("CORS_ORIGIN", "http://localhost:3000")
    from src.api.state import AppState
    state = AppState(db_path=tmp_path / "test.db")
    app = create_app(app_state=state, start_scheduler=False)
    client = TestClient(app)
    resp = client.get("/health", headers={"Origin": "http://localhost:3000"})
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_read_prior_state_returns_second_row(tmp_path):
    from src.api.state import AppState
    state = AppState(db_path=str(tmp_path / "test.db"))
    state.write_state({"regime": "calm", "transition_risk": 0.05, "trend": "uptrend",
                       "vix_level": 15.0, "vix_chg_1d": 0.1, "top_drivers": [],
                       "mode": "demo", "price_card_price": None, "as_of_ts": "2024-01-01"})
    state.write_state({"regime": "elevated", "transition_risk": 0.25, "trend": "neutral",
                       "vix_level": 22.0, "vix_chg_1d": 0.5, "top_drivers": [],
                       "mode": "demo", "price_card_price": None, "as_of_ts": "2024-01-02"})
    prior = state.read_prior_state()
    assert prior is not None
    assert prior["regime"] == "calm"
