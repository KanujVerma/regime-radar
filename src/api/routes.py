"""FastAPI route definitions for RegimeRadar."""
from __future__ import annotations
import json
import math
from datetime import datetime, date, timezone
from pathlib import Path
import pandas as pd
from fastapi import APIRouter, HTTPException, Request
from src.api.schemas import (
    HealthResponse, CurrentStateResponse, HistoricalStateResponse,
    EventReplayResponse, ModelDriversResponse, DriverItem,
    HistoricalPoint, EventReplayPoint, TransitionRiskResponse, TransitionRiskPoint,
    StateDelta, ScenarioRequest, ScenarioResponse, DriverDelta,
    ReliabilityResponse, DailyDiffResponse, ChangelogResponse,
    AnalogEntry, AnalogsResponse,
)
from src.utils.logging import get_logger

_logger = get_logger(__name__)
router = APIRouter()


def _get_state(request: Request):
    return request.app.state.app_state


@router.api_route("/health", methods=["GET", "HEAD"], response_model=HealthResponse)
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


_reliability_cache: dict | None = None


@router.get("/reliability", response_model=ReliabilityResponse)
async def reliability():
    global _reliability_cache
    if _reliability_cache is None:
        import json
        from src.utils.paths import get_project_root
        table_path = get_project_root() / "data" / "reliability" / "transition_reliability.json"
        if not table_path.exists():
            raise HTTPException(
                status_code=503,
                detail="Reliability table not found. Run scripts/build_reliability_table.py.",
            )
        with open(table_path) as f:
            _reliability_cache = json.load(f)
    return _reliability_cache


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


DRIVER_ROTATION_MIN_IMPORTANCE = 0.15


def _compute_changelog_entries(
    daily_state_dir: Path,
    limit: int = 50,
    since: str | None = None,
    notable_only: bool = True,
) -> list[dict]:
    """Diff consecutive daily state artifacts and return notable entries most-recent-first.

    Returns [] when daily_state_dir has < 2 files. Never raises HTTP exceptions.
    """
    if not daily_state_dir.exists():
        return []
    files = sorted(daily_state_dir.glob("*.json"))
    if len(files) < 2:
        return []

    entries = []
    for i in range(1, len(files)):
        current_data = json.loads(files[i].read_text())
        previous_data = json.loads(files[i - 1].read_text())

        current_date = current_data["as_of_date"]
        previous_date = previous_data["as_of_date"]
        gap_days = (date.fromisoformat(current_date) - date.fromisoformat(previous_date)).days

        risk_delta = round(current_data["transition_risk"] - previous_data["transition_risk"], 4)

        cur_vix = current_data.get("vix_level")
        prev_vix = previous_data.get("vix_level")
        vix_delta = round(cur_vix - prev_vix, 2) if (cur_vix is not None and prev_vix is not None) else None

        cur_top_drivers = current_data.get("top_drivers") or []
        prev_top_drivers = previous_data.get("top_drivers") or []
        cur_top = cur_top_drivers[0] if cur_top_drivers else None
        prev_top = prev_top_drivers[0] if prev_top_drivers else None

        # Compute triggers
        triggers: list[str] = []
        if current_data["regime"] != previous_data["regime"]:
            triggers.append("regime_shift")
        if abs(risk_delta) >= 0.05:
            triggers.append("risk_move")
        if vix_delta is not None and abs(vix_delta) >= 1.5:
            triggers.append("vix_move")
        if (
            cur_top is not None
            and prev_top is not None
            and cur_top["feature"] != prev_top["feature"]
            and cur_top.get("importance", 0.0) >= DRIVER_ROTATION_MIN_IMPORTANCE
        ):
            triggers.append("driver_rotation")

        # Primary trigger: highest priority
        primary_trigger: str | None = None
        for t in ("regime_shift", "risk_move", "vix_move", "driver_rotation"):
            if t in triggers:
                primary_trigger = t
                break

        # Narrative
        regime = current_data["regime"].title()
        prior_regime = previous_data["regime"].title()
        risk_pct = f"{current_data['transition_risk'] * 100:.0f}%"
        risk_delta_pp = f"{risk_delta * 100:+.0f}pp"

        if primary_trigger == "regime_shift":
            narrative = f"{prior_regime} → {regime}. Risk {risk_delta_pp} to {risk_pct}."
        elif primary_trigger == "risk_move":
            narrative = f"Transition risk {risk_delta_pp} to {risk_pct}. Regime: {regime}."
        elif primary_trigger == "vix_move":
            direction = "rose" if (vix_delta or 0) > 0 else "fell"
            narrative = f"VIX {direction} {abs(vix_delta or 0):.1f} to {cur_vix:.1f}. Risk {risk_pct}."
        elif primary_trigger == "driver_rotation":
            narrative = (
                f"Top driver shifted to {cur_top['plain_label']} "
                f"(was: {prev_top['plain_label']})."
            )
        else:
            narrative = "No notable market-state change from the prior snapshot."

        entry: dict = {
            "current_date": current_date,
            "previous_date": previous_date,
            "gap_days": gap_days,
            "is_stale_gap": gap_days > 5,
            "regime": current_data["regime"],
            "transition_risk": current_data["transition_risk"],
            "risk_delta": risk_delta,
            "vix_level": cur_vix,
            "vix_delta": vix_delta,
            "trend": current_data["trend"],
            "prior_regime": previous_data["regime"] if "regime_shift" in triggers else None,
            "prior_trend": previous_data["trend"] if current_data["trend"] != previous_data["trend"] else None,
            "top_driver": cur_top,
            "prior_top_driver": prev_top,
            "triggers": triggers,
            "primary_trigger": primary_trigger,
            "narrative": narrative,
        }

        if notable_only and not triggers:
            continue
        if since is not None and current_date <= since:
            continue

        entries.append(entry)

    # Most-recent-first, then apply limit
    entries.reverse()
    return entries[:limit]


def _compute_daily_diff(daily_state_dir: Path) -> dict | None:
    """Return diff response dict, or None if fewer than 2 artifacts exist."""
    if not daily_state_dir.exists():
        return None
    files = sorted(daily_state_dir.glob("*.json"))
    if len(files) < 2:
        return None

    current_data = json.loads(files[-1].read_text())
    previous_data = json.loads(files[-2].read_text())

    current_date = date.fromisoformat(current_data["as_of_date"])
    previous_date = date.fromisoformat(previous_data["as_of_date"])
    gap_days = (current_date - previous_date).days

    cur_vix = current_data.get("vix_level")
    prev_vix = previous_data.get("vix_level")
    vix_delta = round(cur_vix - prev_vix, 2) if (cur_vix is not None and prev_vix is not None) else None

    cur_top_drivers = current_data.get("top_drivers") or []
    prev_top_drivers = previous_data.get("top_drivers") or []
    cur_top = cur_top_drivers[0] if cur_top_drivers else None
    prev_top = prev_top_drivers[0] if prev_top_drivers else None
    top_driver_changed = ((cur_top is None) != (prev_top is None)) or (
        cur_top is not None and prev_top is not None and cur_top["feature"] != prev_top["feature"]
    )

    regime_changed = current_data["regime"] != previous_data["regime"]
    trend_changed = current_data["trend"] != previous_data["trend"]

    return {
        "current": current_data,
        "previous": previous_data,
        "diff": {
            "regime_changed": regime_changed,
            "prior_regime": previous_data["regime"] if regime_changed else None,
            "risk_delta": round(current_data["transition_risk"] - previous_data["transition_risk"], 4),
            "vix_delta": vix_delta,
            "trend_changed": trend_changed,
            "prior_trend": previous_data["trend"] if trend_changed else None,
            "top_driver_changed": top_driver_changed,
            "prior_top_driver": {"feature": prev_top["feature"], "plain_label": prev_top["plain_label"]}
                                 if (prev_top and top_driver_changed) else None,
            "current_top_driver": {"feature": cur_top["feature"], "plain_label": cur_top["plain_label"]}
                                   if (cur_top and top_driver_changed) else None,
        },
        "metadata": {
            "current_date": str(current_date),
            "previous_date": str(previous_date),
            "gap_days": gap_days,
            "is_stale": gap_days > 5,
        },
    }


@router.get("/daily-diff", response_model=DailyDiffResponse)
async def daily_diff():
    from src.utils.paths import get_project_root
    result = _compute_daily_diff(get_project_root() / "data" / "daily_state")
    if result is None:
        raise HTTPException(status_code=404, detail="not enough daily snapshots to compute diff")
    return result


@router.get("/changelog", response_model=ChangelogResponse)
async def changelog(limit: int = 50, since: str | None = None, notable_only: bool = True):
    from src.utils.paths import get_project_root
    daily_state_dir = get_project_root() / "data" / "daily_state"
    files = sorted(daily_state_dir.glob("*.json")) if daily_state_dir.exists() else []
    if len(files) < 2:
        raise HTTPException(status_code=404, detail="not enough daily snapshots to compute changelog")
    # Single file-read pass — compute all entries, filter in memory
    all_entries = _compute_changelog_entries(daily_state_dir, limit=9999, since=None, notable_only=False)
    total_notable = sum(1 for e in all_entries if e["triggers"])
    filtered = [
        e for e in all_entries
        if (not notable_only or e["triggers"])
        and (since is None or e["current_date"] > since)
    ][:limit]
    return {
        "entries": filtered,
        "total_notable": total_notable,
        "total_days": len(files) - 1,
        "earliest_date": json.loads(files[0].read_text()).get("as_of_date"),
        "latest_date": json.loads(files[-1].read_text()).get("as_of_date"),
    }


@router.get("/analogs", response_model=AnalogsResponse)
async def analogs(request: Request):
    from src.models.analogs import find_analogs
    app_state = _get_state(request)
    if app_state._analog_index is None or app_state._latest_features is None or app_state._latest_date is None:
        raise HTTPException(status_code=503, detail="Analog index not available")
    latest = app_state.read_latest_state()
    if latest is None:
        raise HTTPException(status_code=503, detail="No current state available")
    results = find_analogs(
        query_date=app_state._latest_date,
        query_features=app_state._latest_features,
        index=app_state._analog_index,
    )
    return AnalogsResponse(
        query_date=str(app_state._latest_date),
        query_regime=latest.get("regime", "unknown"),
        query_transition_risk=float(latest.get("transition_risk") or 0.0),
        analogs=[AnalogEntry(**a) for a in results],
        feature_set_version=app_state._analog_index.feature_set_version,
    )


@router.post("/scenario", response_model=ScenarioResponse)
async def scenario(request: Request, body: ScenarioRequest):
    import numpy as np

    app_state = _get_state(request)
    cache = app_state._scenario_cache

    if cache is not None:
        transition_model = cache["transition_model"]
        regime_model = cache["regime_model"]
        feature_names: list[str] = cache["feature_names"]
        feature_importances: list[float] = cache["feature_importances"]
        baseline_vec: dict[str, float] = cache["baseline_vec"]
    else:
        # Cache not yet populated — fall back to loading from disk
        from src.models.registry import artifact_exists, load_artifact, load_metadata
        from src.utils.paths import PROCESSED_DIR
        from pathlib import Path

        for name in ("xgb_transition", "xgb_regime"):
            if not artifact_exists(name):
                raise HTTPException(status_code=503, detail=f"{name} artifact not found. Run bootstrap_data.py.")

        transition_model = load_artifact("xgb_transition")
        regime_model = load_artifact("xgb_regime")
        meta = load_metadata("xgb_transition")
        feature_names = meta.get("feature_names", [])
        feature_importances = meta.get("feature_importances",
            list(transition_model.feature_importances_))

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

    slider_features = ["vix_level", "vix_chg_5d", "rv_20d_pct", "drawdown_pct_504d", "ret_20d", "dist_sma50"]
    baseline_inputs = {f: round(baseline_vec.get(f, 0.0), 4) for f in slider_features}

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
        baseline_inputs=baseline_inputs,
    )
