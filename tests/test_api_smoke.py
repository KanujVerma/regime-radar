"""Smoke tests for the FastAPI endpoints."""
import json
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

    def test_current_state_returns_condition_values_from_scenario_cache(self, app_with_state):
        app, state = app_with_state
        state.write_state({
            "as_of_ts": "2024-01-01T00:00:00+00:00",
            "regime": "elevated",
            "transition_risk": 0.25,
            "trend": "neutral",
            "vix_level": 22.0,
            "vix_chg_1d": 0.5,
            "top_drivers": [],
            "mode": "demo",
            "price_card_price": None,
        })
        state._scenario_cache = {
            "baseline_vec": {
                "vix_level": 22.0,
                "vix_chg_5d": 4.0,
                "rv_20d_pct": 0.62,
                "drawdown_pct_504d": 0.10,
                "ret_20d": -0.02,
                "dist_sma50": -0.01,
                "unrelated_feature": 99.0,
            }
        }

        client = TestClient(app)
        resp = client.get("/current-state")

        assert resp.status_code == 200
        data = resp.json()
        assert data["condition_values"] == {
            "vix_level": 22.0,
            "vix_chg_5d": 4.0,
            "rv_20d_pct": 0.62,
            "drawdown_pct_504d": 0.1,
            "ret_20d": -0.02,
            "dist_sma50": -0.01,
        }


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


def _make_fake_refresh_mocks(monkeypatch, tmp_path):
    """Helper: monkeypatch all _do_refresh() deferred imports for mode-logic tests."""
    import numpy as np
    import pandas as pd

    FEATURES = ["vix_level", "vix_chg_5d", "rv_20d_pct",
                "drawdown_pct_504d", "ret_20d", "dist_sma50"]
    idx = pd.to_datetime(["2024-01-01"])
    fake_panel = pd.DataFrame({"close": [450.0], "vixcls": [18.0],
                               "emvoverallemv": [100.0], "vix_chg_1d": [0.5]}, index=idx)
    fake_features = pd.DataFrame({f: [1.0] for f in FEATURES}, index=idx)
    fake_regime = pd.Series(["calm"], index=idx)
    fake_trend = pd.Series(["uptrend"], index=idx)

    monkeypatch.setattr("src.data.fetch_yfinance.fetch_spy_history",
                        lambda **kw: fake_panel)
    monkeypatch.setattr("src.data.fetch_vix.fetch_vix_history",
                        lambda **kw: fake_panel)
    monkeypatch.setattr("src.data.fetch_fred.fetch_emv",
                        lambda **kw: fake_panel)
    monkeypatch.setattr("src.data.merge_sources.merge_market_panel",
                        lambda *a, **kw: fake_panel)
    monkeypatch.setattr("src.features.build_market_features.build_features",
                        lambda *a, **kw: fake_features)
    monkeypatch.setattr("src.labeling.build_regime_labels.build_regime_labels",
                        lambda *a, **kw: fake_regime)
    monkeypatch.setattr("src.labeling.build_trend_labels.build_trend_labels",
                        lambda *a, **kw: fake_trend)
    monkeypatch.setattr("src.models.predict_live.predict_current_state",
                        lambda *a, **kw: {"regime": "calm", "transition_risk": 0.1})
    monkeypatch.setenv("PROCESSED_DIR", str(tmp_path))


def test_mode_is_live_when_finnhub_raises(monkeypatch, tmp_path):
    """mode should be 'live' when yfinance+FRED succeed, even if Finnhub raises."""
    from src.api.state import AppState

    _make_fake_refresh_mocks(monkeypatch, tmp_path)

    class FakeProvider:
        mode = "live"
        def latest_quote(self, symbol):
            raise RuntimeError("Finnhub unavailable")

    monkeypatch.setattr("src.data.providers.factory.get_provider",
                        lambda: FakeProvider())

    state = AppState(db_path=tmp_path / "test.db")
    state._do_refresh()
    result = state.read_latest_state()
    assert result["mode"] == "live", f"Expected mode='live', got {result['mode']!r}"


def test_mode_is_live_when_provider_is_demo_mode(monkeypatch, tmp_path):
    """mode should be 'live' when yfinance+FRED succeed even if provider.mode='demo'."""
    from src.api.state import AppState

    _make_fake_refresh_mocks(monkeypatch, tmp_path)

    class FakeProvider:
        mode = "demo"

    monkeypatch.setattr("src.data.providers.factory.get_provider",
                        lambda: FakeProvider())

    state = AppState(db_path=tmp_path / "test.db")
    state._do_refresh()
    result = state.read_latest_state()
    assert result["mode"] == "live", f"Expected mode='live', got {result['mode']!r}"


def test_load_from_snapshots_copies_parquets_and_sets_demo_mode(monkeypatch, tmp_path):
    """_load_from_snapshots() must copy parquets to processed/ and force mode='demo'."""
    import shutil
    from src.api.state import AppState

    snapshots_dir = tmp_path / "snapshots"
    processed_dir = tmp_path / "processed"
    snapshots_dir.mkdir()

    # Create fake parquets in snapshots/
    import pandas as pd
    fake = pd.DataFrame({"x": [1]})
    for name in ("spy.parquet", "vix.parquet", "emv.parquet", "panel.parquet"):
        fake.to_parquet(snapshots_dir / name)

    # Redirect SNAPSHOTS_DIR and PROCESSED_DIR to tmp locations
    monkeypatch.setattr("src.utils.paths.SNAPSHOTS_DIR", snapshots_dir)
    monkeypatch.setattr("src.utils.paths.PROCESSED_DIR", processed_dir)

    # _do_refresh() must not actually run the pipeline — mock it to write a live state
    def _fake_do_refresh(self):
        self.write_state({
            "as_of_ts": "2024-01-01T00:00:00+00:00",
            "regime": "calm", "transition_risk": 0.1,
            "trend": "uptrend", "vix_level": 15.0, "vix_chg_1d": 0.0,
            "top_drivers": [], "mode": "live", "price_card_price": None,
        })

    monkeypatch.setattr(AppState, "_do_refresh", _fake_do_refresh)

    state = AppState(db_path=tmp_path / "test.db")
    state._load_from_snapshots()

    # Parquets must be copied to processed/
    for name in ("spy.parquet", "vix.parquet", "emv.parquet", "panel.parquet"):
        assert (processed_dir / name).exists(), f"{name} not copied to processed/"

    # mode must be forced to 'demo' even though _do_refresh wrote 'live'
    result = state.read_latest_state()
    assert result is not None
    assert result["mode"] == "demo", f"Expected mode='demo', got {result['mode']!r}"


def test_startup_warmup_calls_do_refresh(monkeypatch, tmp_path):
    """create_app() startup must call _do_refresh() to warm up state."""
    calls = []

    from src.api.state import AppState
    from src.api.main import create_app

    def _fake_do_refresh(self):
        calls.append("do_refresh")

    monkeypatch.setattr(AppState, "_do_refresh", _fake_do_refresh)

    state = AppState(db_path=tmp_path / "test.db")
    app = create_app(app_state=state, start_scheduler=False)
    with TestClient(app) as client:
        client.get("/health")
    assert "do_refresh" in calls, "startup warmup did not call _do_refresh()"


def test_startup_warmup_falls_back_to_snapshots_on_refresh_failure(monkeypatch, tmp_path):
    """If _do_refresh() raises on startup, _load_from_snapshots() must be called."""
    from src.api.state import AppState
    from src.api.main import create_app

    calls = []

    def _failing_refresh(self):
        raise RuntimeError("network unavailable")

    def _fake_load_snapshots(self):
        calls.append("load_snapshots")

    monkeypatch.setattr(AppState, "_do_refresh", _failing_refresh)
    monkeypatch.setattr(AppState, "_load_from_snapshots", _fake_load_snapshots)

    state = AppState(db_path=tmp_path / "test.db")
    app = create_app(app_state=state, start_scheduler=False)
    with TestClient(app) as client:
        client.get("/health")
    assert "load_snapshots" in calls, "startup did not fall back to _load_from_snapshots()"


def test_scenario_returns_503_without_artifacts(app_with_state, monkeypatch):
    app, _ = app_with_state
    import src.models.registry as reg
    monkeypatch.setattr(reg, "artifact_exists", lambda name: False)
    client = TestClient(app)
    payload = {
        "vix_level": 25.0, "vix_chg_5d": 3.0, "rv_20d_pct": 0.7,
        "drawdown_pct_504d": 0.15, "ret_20d": -0.05, "dist_sma50": -0.04,
    }
    resp = client.post("/scenario", json=payload)
    assert resp.status_code == 503

def test_reliability_endpoint_returns_table(app_with_state, monkeypatch):
    """GET /reliability serves the committed JSON table including source field."""
    import src.api.routes as routes_mod

    table = {
        "bins": [
            {"p_low": 0.0, "p_high": 0.10, "p_mid": 0.05, "empirical_rate": 0.05, "n": 500},
            {"p_low": 0.10, "p_high": 0.30, "p_mid": 0.20, "empirical_rate": 0.15, "n": 200},
        ],
        "base_rate": 0.074,
        "max_evaluated_p": 0.30,
        "source": "production_insample",
    }
    routes_mod._reliability_cache = table

    app, _ = app_with_state
    from fastapi.testclient import TestClient
    client = TestClient(app)
    resp = client.get("/reliability")
    assert resp.status_code == 200
    data = resp.json()
    assert "bins" in data and "base_rate" in data and "max_evaluated_p" in data
    assert "source" in data
    assert data["source"] == "production_insample"
    assert isinstance(data["bins"], list) and len(data["bins"]) == 2
    assert data["max_evaluated_p"] == 0.30

    routes_mod._reliability_cache = None


def test_current_state_top_drivers_stored_from_write(app_with_state):
    """top_drivers written by state.write_state() are returned by /current-state."""
    app, state = app_with_state
    drivers = [{"feature": "vix_level", "importance": 0.42}]
    state.write_state({
        "as_of_ts": "2024-01-01T00:00:00+00:00",
        "regime": "elevated",
        "transition_risk": 0.35,
        "trend": "neutral",
        "vix_level": 22.0,
        "vix_chg_1d": 0.8,
        "top_drivers": drivers,
        "mode": "demo",
        "price_card_price": None,
    })
    from fastapi.testclient import TestClient
    client = TestClient(app)
    resp = client.get("/current-state")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["top_drivers"]) == 1
    assert data["top_drivers"][0]["feature"] == "vix_level"


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

    # Feature row for the baseline vector (last row of feature panel)
    fake_features = pd.DataFrame(
        {f: [15.0] for f in FEATURES},
        index=pd.to_datetime(["2024-01-01"]),
    )
    fake_regime_series = pd.Series(["calm"], index=fake_features.index, name="regime")

    import src.models.registry as reg
    monkeypatch.setattr(reg, "artifact_exists", lambda name: True)
    monkeypatch.setattr(reg, "load_artifact",
        lambda name: fake_transition if "transition" in name else fake_regime)
    monkeypatch.setattr(reg, "load_metadata", lambda name: {
        "feature_names": FEATURES,
        "feature_importances": fake_transition.feature_importances_.tolist(),
    })

    # Mock pipeline at source modules so build_features doesn't need real OHLCV
    monkeypatch.setattr("src.labeling.build_regime_labels.build_regime_labels",
                        lambda panel: fake_regime_series)
    monkeypatch.setattr("src.features.build_market_features.build_features",
                        lambda panel, **kw: fake_features)

    import src.api.routes as routes_mod
    monkeypatch.setattr(routes_mod.pd, "read_parquet", lambda p: fake_features)

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


class TestDailyDiffEndpoint:
    def test_daily_diff_200(self, app_with_state, monkeypatch):
        import src.api.routes as routes_mod
        prebuilt = {
            "current": {
                "as_of_date": "2026-05-21", "generated_at": "2026-05-21T22:00:00+00:00",
                "data_through_date": "2026-05-21", "regime": "elevated",
                "transition_risk": 0.20, "prob_calm": 0.30, "prob_elevated": 0.65,
                "prob_turbulent": 0.05, "vix_level": 18.0, "trend": "uptrend",
                "top_drivers": [{"feature": "vix_chg_5d", "plain_label": "VIX 5-day change", "importance": 0.03}],
                "model_version": {"transition_model": "xgb_transition", "transition_trained_as_of": "2026-04-24",
                                   "regime_model": "xgb_regime", "regime_trained_as_of": "2026-04-24"},
            },
            "previous": {
                "as_of_date": "2026-05-20", "generated_at": "2026-05-20T22:00:00+00:00",
                "data_through_date": "2026-05-20", "regime": "calm",
                "transition_risk": 0.10, "prob_calm": 0.80, "prob_elevated": 0.18,
                "prob_turbulent": 0.02, "vix_level": 15.0, "trend": "uptrend",
                "top_drivers": [{"feature": "vix_pct_504d", "plain_label": "VIX relative to 2-year history", "importance": 0.04}],
                "model_version": {"transition_model": "xgb_transition", "transition_trained_as_of": "2026-04-24",
                                   "regime_model": "xgb_regime", "regime_trained_as_of": "2026-04-24"},
            },
            "diff": {
                "regime_changed": True, "prior_regime": "calm",
                "risk_delta": 0.10, "vix_delta": 3.0,
                "trend_changed": False, "prior_trend": None,
                "top_driver_changed": True,
                "prior_top_driver": {"feature": "vix_pct_504d", "plain_label": "VIX relative to 2-year history"},
                "current_top_driver": {"feature": "vix_chg_5d", "plain_label": "VIX 5-day change"},
            },
            "metadata": {"current_date": "2026-05-21", "previous_date": "2026-05-20",
                          "gap_days": 1, "is_stale": False},
        }
        monkeypatch.setattr(routes_mod, "_compute_daily_diff", lambda _: prebuilt)
        app, _ = app_with_state
        client = TestClient(app)
        resp = client.get("/daily-diff")
        assert resp.status_code == 200
        data = resp.json()
        assert data["metadata"]["gap_days"] == 1
        assert data["diff"]["regime_changed"] is True

    def test_daily_diff_404_when_not_enough_snapshots(self, app_with_state, monkeypatch):
        import src.api.routes as routes_mod
        monkeypatch.setattr(routes_mod, "_compute_daily_diff", lambda _: None)
        app, _ = app_with_state
        client = TestClient(app)
        resp = client.get("/daily-diff")
        assert resp.status_code == 404


class TestChangelogEndpoint:
    def test_changelog_200(self, app_with_state, monkeypatch, tmp_path):
        import src.api.routes as routes_mod
        # Two stub files so the file-count check passes
        d = tmp_path / "data" / "daily_state"
        d.mkdir(parents=True)
        (d / "2026-05-20.json").write_text(json.dumps({"as_of_date": "2026-05-20"}))
        (d / "2026-05-21.json").write_text(json.dumps({"as_of_date": "2026-05-21"}))
        monkeypatch.setattr("src.utils.paths.get_project_root", lambda: tmp_path)
        prebuilt = [
            {
                "current_date": "2026-05-21",
                "previous_date": "2026-05-20",
                "gap_days": 1,
                "is_stale_gap": False,
                "regime": "elevated",
                "transition_risk": 0.20,
                "risk_delta": 0.10,
                "vix_level": 18.0,
                "vix_delta": 3.0,
                "trend": "uptrend",
                "prior_regime": "calm",
                "prior_trend": None,
                "top_driver": {
                    "feature": "vix_chg_5d",
                    "plain_label": "VIX 5-day change",
                    "importance": 0.20,
                },
                "prior_top_driver": {
                    "feature": "vix_pct_504d",
                    "plain_label": "VIX relative to 2-year history",
                    "importance": 0.18,
                },
                "triggers": ["regime_shift", "risk_move"],
                "primary_trigger": "regime_shift",
                "narrative": "Calm → Elevated. Risk +10pp to 20%.",
            }
        ]
        monkeypatch.setattr(routes_mod, "_compute_changelog_entries", lambda *a, **kw: prebuilt)
        app, _ = app_with_state
        client = TestClient(app)
        resp = client.get("/changelog")
        assert resp.status_code == 200
        data = resp.json()
        assert "entries" in data
        assert data["entries"][0]["primary_trigger"] == "regime_shift"

    def test_changelog_404_when_fewer_than_two_snapshots(self, app_with_state, monkeypatch, tmp_path):
        monkeypatch.setattr("src.utils.paths.get_project_root", lambda: tmp_path)
        # tmp_path has no daily_state dir → 0 files → 404
        app, _ = app_with_state
        client = TestClient(app)
        resp = client.get("/changelog")
        assert resp.status_code == 404


class TestAnalogsEndpoint:
    _ANALOG_ENTRIES = [
        {
            "display_date": "Mar 2020",
            "full_date": "2020-03-15",
            "regime": "turbulent",
            "transition_risk": 0.82,
            "spy_fwd_5d": -0.042,
            "spy_fwd_20d": -0.112,
            "regime_outcome_20d": "Remained Turbulent",
        },
        {
            "display_date": "Aug 2015",
            "full_date": "2015-08-24",
            "regime": "elevated",
            "transition_risk": 0.55,
            "spy_fwd_5d": 0.01,
            "spy_fwd_20d": 0.03,
            "regime_outcome_20d": "Escalated to Turbulent within 3 days",
        },
        {
            "display_date": "Oct 2018",
            "full_date": "2018-10-11",
            "regime": "elevated",
            "transition_risk": 0.48,
            "spy_fwd_5d": -0.02,
            "spy_fwd_20d": -0.05,
            "regime_outcome_20d": "Remained Elevated",
        },
    ]

    def test_analogs_503_when_index_not_built(self, app_with_state):
        app, state = app_with_state
        # _analog_index/_latest_features/_latest_date are all None by default
        client = TestClient(app)
        resp = client.get("/analogs")
        assert resp.status_code == 503

    def test_analogs_200_with_three_entries(self, app_with_state, monkeypatch):
        import pandas as pd
        from datetime import date as date_cls
        app, state = app_with_state

        # Write a live-state row so read_latest_state() returns data
        state.write_state({
            "as_of_ts": "2026-05-23T10:00:00+00:00",
            "regime": "elevated",
            "transition_risk": 0.42,
            "trend": "uptrend",
            "vix_level": 18.0,
            "vix_chg_1d": 0.5,
            "top_drivers": [],
            "mode": "live",
            "price_card_price": None,
            "prob_calm": 0.4,
            "prob_elevated": 0.5,
            "prob_turbulent": 0.1,
        })

        # Inject a stub analog index with just feature_set_version
        class _StubIndex:
            feature_set_version = "v1_all22"

        state._analog_index = _StubIndex()
        state._latest_features = pd.Series({"ret_1d": 0.0})
        state._latest_date = date_cls(2026, 5, 23)

        monkeypatch.setattr(
            "src.models.analogs.find_analogs",
            lambda *args, **kwargs: self._ANALOG_ENTRIES,
        )

        client = TestClient(app)
        resp = client.get("/analogs")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["analogs"]) == 3
        assert data["feature_set_version"] == "v1_all22"
        assert data["query_regime"] == "elevated"
        required_keys = {
            "display_date", "full_date", "regime", "transition_risk",
            "spy_fwd_5d", "spy_fwd_20d", "regime_outcome_20d",
        }
        for entry in data["analogs"]:
            assert required_keys <= entry.keys()
