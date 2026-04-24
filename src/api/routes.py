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
            transition_risk=float(risk[i]) if risk is not None and i < len(risk) else None,
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
