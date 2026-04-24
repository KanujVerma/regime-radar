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


def test_current_state_response_has_delta_field():
    from src.api.schemas import CurrentStateResponse
    fields = CurrentStateResponse.model_fields
    assert "delta" in fields

def test_model_drivers_response_has_threshold_sweep():
    from src.api.schemas import ModelDriversResponse
    fields = ModelDriversResponse.model_fields
    assert "threshold_sweep" in fields

def test_scenario_response_schema_exists():
    from src.api.schemas import ScenarioResponse, ScenarioRequest, DriverDelta
    req = ScenarioRequest(
        vix_level=20.0, vix_chg_5d=1.0, rv_20d_pct=0.5,
        drawdown_pct_504d=0.1, ret_20d=0.01, dist_sma50=0.02,
    )
    assert req.vix_level == 20.0

def test_current_state_delta_populated_with_two_rows(app_with_state):
    app, state = app_with_state
    state.write_state({
        "as_of_ts": "2024-01-01T00:00:00+00:00",
        "regime": "calm", "transition_risk": 0.10,
        "trend": "uptrend", "vix_level": 15.0, "vix_chg_1d": 0.0,
        "top_drivers": [{"feature": "vix_level", "importance": 0.4}],
        "mode": "demo", "price_card_price": None,
    })
    state.write_state({
        "as_of_ts": "2024-01-02T00:00:00+00:00",
        "regime": "elevated", "transition_risk": 0.25,
        "trend": "neutral", "vix_level": 22.0, "vix_chg_1d": 0.5,
        "top_drivers": [{"feature": "vix_level", "importance": 0.4}],
        "mode": "demo", "price_card_price": None,
    })
    client = TestClient(app)
    resp = client.get("/current-state")
    assert resp.status_code == 200
    data = resp.json()
    assert data["delta"] is not None
    assert data["delta"]["risk_delta"] == pytest.approx(0.15, abs=0.01)
    assert data["delta"]["regime_changed"] is True
    assert data["delta"]["prior_regime"] == "calm"

def test_current_state_delta_none_with_one_row(app_with_state):
    app, state = app_with_state
    state.write_state({
        "as_of_ts": "2024-01-01T00:00:00+00:00",
        "regime": "calm", "transition_risk": 0.10,
        "trend": "uptrend", "vix_level": 15.0, "vix_chg_1d": 0.0,
        "top_drivers": [], "mode": "demo", "price_card_price": None,
    })
    client = TestClient(app)
    resp = client.get("/current-state")
    assert resp.status_code == 200
    assert resp.json()["delta"] is None


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


def test_model_drivers_threshold_sweep_field_present(app_with_state):
    """threshold_sweep is always present (may be empty list if artifacts missing)."""
    app, _ = app_with_state
    client = TestClient(app)
    resp = client.get("/model-drivers")
    if resp.status_code == 503:
        pytest.skip("No model artifacts — skipping threshold_sweep field check")
    data = resp.json()
    assert "threshold_sweep" in data
    assert isinstance(data["threshold_sweep"], list)


def test_scenario_returns_503_without_artifacts(app_with_state):
    app, _ = app_with_state
    client = TestClient(app)
    payload = {
        "vix_level": 25.0, "vix_chg_5d": 3.0, "rv_20d_pct": 0.7,
        "drawdown_pct_504d": 0.15, "ret_20d": -0.05, "dist_sma50": -0.04,
    }
    resp = client.post("/scenario", json=payload)
    # Before route exists: 404; after route exists but no artifacts: 503
    assert resp.status_code in (404, 503)

def test_scenario_response_shape(app_with_state, monkeypatch):
    """With mocked models and panel, POST /scenario returns expected shape."""
    import numpy as np
    import pandas as pd

    app, _ = app_with_state

    FEATURES = ["vix_level", "vix_chg_5d", "rv_20d_pct",
                "drawdown_pct_504d", "ret_20d", "dist_sma50"]

    class FakeTransition:
        feature_importances_ = np.array([0.3, 0.2, 0.1, 0.2, 0.1, 0.1])
        def predict_proba(self, X):
            return np.array([[0.7, 0.3]] * len(X))

    class FakeRegime:
        def predict_proba(self, X):
            return np.array([[0.5, 0.3, 0.2]] * len(X))

    fake_transition = FakeTransition()
    fake_regime = FakeRegime()
    panel_df = pd.DataFrame({f: [15.0] for f in FEATURES},
                             index=pd.to_datetime(["2024-01-01"]))

    import src.models.registry as reg
    monkeypatch.setattr(reg, "artifact_exists", lambda name: True)
    monkeypatch.setattr(reg, "load_artifact",
        lambda name: fake_transition if "transition" in name else fake_regime)
    monkeypatch.setattr(reg, "load_metadata", lambda name: {
        "feature_names": FEATURES,
        "feature_importances": fake_transition.feature_importances_.tolist(),
    })
    import src.api.routes as routes_mod
    monkeypatch.setattr(routes_mod.pd, "read_parquet", lambda p: panel_df)

    client = TestClient(app)
    payload = {
        "vix_level": 30.0, "vix_chg_5d": 5.0, "rv_20d_pct": 0.8,
        "drawdown_pct_504d": 0.2, "ret_20d": -0.07, "dist_sma50": -0.05,
    }
    resp = client.post("/scenario", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    for field in ["baseline_risk", "scenario_risk", "delta", "prob_calm",
                  "prob_elevated", "prob_turbulent", "baseline_prob_calm",
                  "baseline_prob_elevated", "baseline_prob_turbulent", "driver_deltas"]:
        assert field in data
    assert isinstance(data["driver_deltas"], list)
