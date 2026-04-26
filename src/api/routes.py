"""FastAPI route definitions for RegimeRadar."""
from __future__ import annotations
import math
from datetime import datetime, date, timezone
import pandas as pd
from fastapi import APIRouter, HTTPException, Request
from src.api.schemas import (
    HealthResponse, CurrentStateResponse, HistoricalStateResponse,
    EventReplayResponse, ModelDriversResponse, DriverItem,
    HistoricalPoint, EventReplayPoint, TransitionRiskResponse, TransitionRiskPoint,
    StateDelta, ScenarioRequest, ScenarioResponse, DriverDelta,
)
from src.utils.logging import get_logger

_logger = get_logger(__name__)
router = APIRouter()


def _get_state(request: Request):
    return request.app.state.app_state


@router.get("/health", response_model=HealthResponse)
async def health(request: Request):
    app_state = _get_state(request)
    latest = app_state.read_latest_state()
    mode = latest["mode"] if latest else "demo"
    from src.models.registry import load_metadata, artifact_exists
    versions = {}
    for name in ("xgb_regime", "xgb_transition"):
        if artifact_exists(name):
            try:
                meta = load_metadata(name)
                versions[name] = meta.get("saved_at", "unknown")
            except Exception:
                versions[name] = "error"
    return HealthResponse(
        status="ok",
        mode=mode,
        last_refresh_ts=latest["as_of_ts"] if latest else None,
        model_versions=versions,
    )


@router.post("/refresh-data")
async def refresh_data(request: Request):
    app_state = _get_state(request)
    try:
        app_state.force_refresh()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "refreshed"}


@router.get("/current-state", response_model=CurrentStateResponse)
async def current_state(request: Request):
    app_state = _get_state(request)
    latest = app_state.read_latest_state()
    if latest is None:
        raise HTTPException(status_code=503, detail="No state available. Run /refresh-data first.")

    drivers = [DriverItem(**d) for d in (latest.get("top_drivers") or [])]

    delta = None
    prior = app_state.read_prior_state()
    if prior is not None:
        risk_delta = (latest.get("transition_risk") or 0.0) - (prior.get("transition_risk") or 0.0)
        regime_changed = latest.get("regime") != prior.get("regime")
        top_driver = drivers[0].feature if drivers else None
        delta = StateDelta(
            risk_delta=risk_delta,
            regime_changed=regime_changed,
            prior_regime=prior.get("regime"),
            top_feature_moved=top_driver,
            top_feature_direction="up" if risk_delta > 0 else "down",
        )

    return CurrentStateResponse(
        regime=latest.get("regime", "unknown"),
        transition_risk=latest.get("transition_risk", 0.0),
        trend=latest.get("trend", "neutral"),
        vix_level=latest.get("vix_level"),
        vix_chg_1d=latest.get("vix_chg_1d"),
        top_drivers=drivers,
        as_of_ts=latest.get("as_of_ts", ""),
        mode=latest.get("mode", "demo"),
        prob_calm=latest.get("prob_calm"),
        prob_elevated=latest.get("prob_elevated"),
        prob_turbulent=latest.get("prob_turbulent"),
        delta=delta,
    )


@router.get("/historical-state", response_model=HistoricalStateResponse)
async def historical_state(request: Request, start: date = date(2020, 1, 1), end: date | None = None):
    from src.utils.paths import PROCESSED_DIR
    from pathlib import Path
    panel_path = Path(PROCESSED_DIR) / "panel.parquet"
    if not panel_path.exists():
        raise HTTPException(status_code=503, detail="Panel data not found. Run bootstrap_data.py first.")

    panel = pd.read_parquet(panel_path)

    # Load OOF predictions for regime/transition history
    from src.models.registry import artifact_exists, load_artifact
    oof_path = Path(PROCESSED_DIR)

    panel = panel.loc[str(start):str(end)] if end else panel.loc[str(start):]

    from src.labeling.build_regime_labels import build_regime_labels
    from src.labeling.build_transition_labels import build_transition_labels
    from src.features.build_market_features import build_features

    regime = build_regime_labels(panel)
    features = build_features(panel, regime_series=regime).dropna()

    # Score with trained model
    try:
        from src.models.predict_live import predict_current_state, REGIME_NAMES
        from src.models.registry import load_artifact
        regime_model = load_artifact("xgb_regime")
        transition_model = load_artifact("xgb_transition")
        cal = load_artifact("xgb_transition_calibrator") if artifact_exists("xgb_transition_calibrator") else None
        from src.evaluation.calibration import apply_calibrator
        X = features.fillna(0)
        regime_pred = pd.Series([REGIME_NAMES[i] for i in regime_model.predict(X)], index=features.index)
        risk_raw = transition_model.predict_proba(X)[:, 1]
        risk = apply_calibrator(cal, risk_raw) if cal else risk_raw
    except Exception as e:
        _logger.warning("Model scoring failed for historical state: %s", e)
        regime_pred = regime.reindex(features.index)
        risk = [None] * len(features)

    panel_aligned = panel.reindex(features.index)
    points = []
    for i, (date, row) in enumerate(panel_aligned.iterrows()):
        points.append(HistoricalPoint(
            date=str(date.date()),
            regime=regime_pred.iloc[i] if i < len(regime_pred) else "unknown",
            transition_risk=float(risk[i]) if risk is not None and i < len(risk) and risk[i] is not None else None,
            vix_level=float(row["vixcls"]) if "vixcls" in row.index else None,
            close=float(row["close"]) if "close" in row.index else None,
        ))

    return HistoricalStateResponse(
        data=points,
        start=str(panel_aligned.index[0].date()) if len(panel_aligned) > 0 else str(start),
        end=str(panel_aligned.index[-1].date()) if len(panel_aligned) > 0 else str(end or ""),
    )


@router.get("/transition-risk", response_model=TransitionRiskResponse)
async def transition_risk(request: Request, start: date = date(2020, 1, 1), end: date | None = None):
    resp = await historical_state(request, start=start, end=end)
    return TransitionRiskResponse(
        data=[TransitionRiskPoint(date=p.date, transition_risk=p.transition_risk) for p in resp.data],
        start=resp.start,
        end=resp.end,
    )


@router.get("/event-replay/{event_name}", response_model=EventReplayResponse)
async def event_replay(request: Request, event_name: str):
    from src.evaluation.event_replay import get_event_window, EVENT_WINDOWS
    from src.models.registry import artifact_exists, load_artifact

    if event_name not in EVENT_WINDOWS:
        raise HTTPException(status_code=404, detail=f"Unknown event: {event_name}. Available: {list(EVENT_WINDOWS)}")

    if not artifact_exists("oof_predictions"):
        raise HTTPException(status_code=503, detail="OOF predictions not found. Run bootstrap_data.py first.")

    oof_df = load_artifact("oof_predictions")
    start, end = get_event_window(event_name)
    window = oof_df.loc[start:end].copy()

    from src.evaluation.event_replay import _compute_lead_time
    lead_days = _compute_lead_time(window)

    points = [
        EventReplayPoint(
            date=str(idx.date()),
            regime_actual=str(row.get("regime_actual", "unknown")),
            regime_predicted=str(row.get("regime_predicted", "unknown")),
            transition_risk=float(row["transition_risk"]) if pd.notna(row.get("transition_risk")) else None,
            transition_actual=int(row.get("transition_actual", 0)),
        )
        for idx, row in window.iterrows()
    ]

    return EventReplayResponse(
        event_name=event_name,
        warning_lead_days=None if (lead_days is None or math.isnan(lead_days)) else lead_days,
        data=points,
    )


@router.get("/model-drivers", response_model=ModelDriversResponse)
async def model_drivers(request: Request):
    from src.models.registry import artifact_exists, load_artifact, load_metadata
    from src.utils.paths import PROCESSED_DIR
    from pathlib import Path
    import numpy as np

    if not artifact_exists("xgb_transition"):
        raise HTTPException(status_code=503, detail="Model not found. Run bootstrap_data.py.")

    meta = load_metadata("xgb_transition")
    feature_names = meta.get("feature_names", [])

    # Global importance from model
    model = load_artifact("xgb_transition")
    importance_vals = model.feature_importances_
    global_imp = sorted(
        [DriverItem(feature=f, importance=float(v)) for f, v in zip(feature_names, importance_vals)],
        key=lambda x: x.importance,
        reverse=True,
    )

    # Local explanation: try SHAP, fallback to global importance
    local_exp = {}
    try:
        import shap
        from src.evaluation.shap_utils import get_shap_explanation
        panel_path = Path(PROCESSED_DIR) / "panel.parquet"
        if panel_path.exists():
            panel = pd.read_parquet(panel_path)
            from src.labeling.build_regime_labels import build_regime_labels
            from src.features.build_market_features import build_features
            regime = build_regime_labels(panel)
            features = build_features(panel, regime_series=regime).dropna()
            if len(features) > 0:
                local_exp = get_shap_explanation(model, features, feature_names)
    except Exception as e:
        _logger.warning("SHAP explanation failed, using global importance: %s", e)
        local_exp = {item.feature: item.importance for item in global_imp[:10]}

    return ModelDriversResponse(
        global_importance=global_imp[:20],
        local_explanation=local_exp,
        threshold_sweep=meta.get("threshold_sweep", []),
    )


FEATURE_PLAIN_LABELS = {
    "vix_pct_504d":             "VIX relative to 2-year history",
    "vix_level":                "Current VIX level",
    "vix_zscore_252d":          "VIX z-score (1-year)",
    "vix_chg_5d":               "VIX 5-day change",
    "rv_20d_pct":               "Realized volatility percentile",
    "drawdown_pct_504d":        "Drawdown relative to 2-year history",
    "ret_20d":                  "20-day SPY return",
    "momentum_20d":             "20-day momentum",
    "dist_sma50":               "Distance from 50-day moving average",
    "emv_level":                "Equity market volatility index",
    "days_in_regime_lag1":      "Days in current regime (lagged)",
    "turbulent_count_30d_lag1": "Turbulent days in past 30 days (lagged)",
    "trend_code":               "Trend direction",
}


@router.post("/scenario", response_model=ScenarioResponse)
async def scenario(request: Request, body: ScenarioRequest):
    from src.models.registry import artifact_exists, load_artifact, load_metadata
    from src.utils.paths import PROCESSED_DIR
    from pathlib import Path
    import numpy as np

    for name in ("xgb_transition", "xgb_regime"):
        if not artifact_exists(name):
            raise HTTPException(status_code=503, detail=f"{name} artifact not found. Run bootstrap_data.py.")

    transition_model = load_artifact("xgb_transition")
    regime_model = load_artifact("xgb_regime")
    meta = load_metadata("xgb_transition")
    feature_names: list[str] = meta.get("feature_names", [])
    feature_importances: list[float] = meta.get("feature_importances",
        list(transition_model.feature_importances_))

    # Build baseline vector from engineered features on latest panel row
    panel_path = Path(PROCESSED_DIR) / "panel.parquet"
    if panel_path.exists():
        from src.features.build_market_features import build_features
        from src.labeling.build_regime_labels import build_regime_labels
        panel = pd.read_parquet(panel_path)
        regime = build_regime_labels(panel)
        features_df = build_features(panel, regime_series=regime).dropna()
        last_feat_row = features_df.iloc[-1]
        baseline_vec = {f: float(last_feat_row[f]) if f in last_feat_row.index else 0.0
                        for f in feature_names}
    else:
        baseline_vec = {f: 0.0 for f in feature_names}

    # Scenario vector = baseline overridden with request fields
    overrides: dict[str, float] = {
        "vix_level": body.vix_level,
        "vix_chg_5d": body.vix_chg_5d,
        "rv_20d_pct": body.rv_20d_pct,
        "drawdown_pct_504d": body.drawdown_pct_504d,
        "ret_20d": body.ret_20d,
        "dist_sma50": body.dist_sma50,
    }
    if body.days_in_regime_lag1 is not None:
        overrides["days_in_regime_lag1"] = body.days_in_regime_lag1
    if body.turbulent_count_30d_lag1 is not None:
        overrides["turbulent_count_30d_lag1"] = body.turbulent_count_30d_lag1
    scenario_vec = {**baseline_vec, **overrides}

    X_base = pd.DataFrame([baseline_vec])[feature_names].fillna(0)
    X_scen = pd.DataFrame([scenario_vec])[feature_names].fillna(0)

    baseline_risk = float(transition_model.predict_proba(X_base)[0, 1])
    scenario_risk = float(transition_model.predict_proba(X_scen)[0, 1])

    base_regime_probs = regime_model.predict_proba(X_base)[0]
    scen_regime_probs = regime_model.predict_proba(X_scen)[0]

    # Driver deltas: top-5 by |delta_val * importance|
    imp_map = dict(zip(feature_names, feature_importances))
    deltas = []
    for feat in overrides:
        if feat in imp_map:
            delta_val = scenario_vec.get(feat, 0.0) - baseline_vec.get(feat, 0.0)
            score = abs(delta_val * imp_map[feat])
            deltas.append((feat, delta_val, score))
    deltas.sort(key=lambda x: x[2], reverse=True)

    driver_deltas = [
        DriverDelta(
            feature=feat,
            plain_label=FEATURE_PLAIN_LABELS.get(feat, feat),
            delta_value=round(dv, 4),
        )
        for feat, dv, _ in deltas[:5]
    ]

    return ScenarioResponse(
        baseline_risk=round(baseline_risk, 4),
        scenario_risk=round(scenario_risk, 4),
        delta=round(scenario_risk - baseline_risk, 4),
        prob_calm=round(float(scen_regime_probs[0]), 4),
        prob_elevated=round(float(scen_regime_probs[1]), 4),
        prob_turbulent=round(float(scen_regime_probs[2]), 4),
        baseline_prob_calm=round(float(base_regime_probs[0]), 4),
        baseline_prob_elevated=round(float(base_regime_probs[1]), 4),
        baseline_prob_turbulent=round(float(base_regime_probs[2]), 4),
        driver_deltas=driver_deltas,
    )
