"""Pydantic response schemas for RegimeRadar API."""
from __future__ import annotations
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    mode: str  # "live" or "demo"
    last_refresh_ts: str | None
    model_versions: dict[str, str]


class DriverItem(BaseModel):
    feature: str
    importance: float


class StateDelta(BaseModel):
    risk_delta: float
    regime_changed: bool
    prior_regime: str | None
    top_feature_moved: str | None
    top_feature_direction: str | None


class CurrentStateResponse(BaseModel):
    regime: str
    transition_risk: float
    trend: str
    vix_level: float | None
    vix_chg_1d: float | None
    top_drivers: list[DriverItem]
    as_of_ts: str
    mode: str
    prob_calm: float | None = None
    prob_elevated: float | None = None
    prob_turbulent: float | None = None
    delta: StateDelta | None = None


class HistoricalPoint(BaseModel):
    date: str
    regime: str
    transition_risk: float | None
    vix_level: float | None
    close: float | None


class HistoricalStateResponse(BaseModel):
    data: list[HistoricalPoint]
    start: str
    end: str


class EventReplayPoint(BaseModel):
    date: str
    regime_actual: str
    regime_predicted: str
    transition_risk: float | None
    transition_actual: int


class EventReplayResponse(BaseModel):
    event_name: str
    warning_lead_days: float | None
    data: list[EventReplayPoint]


class TransitionRiskPoint(BaseModel):
    date: str
    transition_risk: float | None


class TransitionRiskResponse(BaseModel):
    data: list[TransitionRiskPoint]
    start: str
    end: str


class DriverDelta(BaseModel):
    feature: str
    plain_label: str
    delta_value: float


class ScenarioRequest(BaseModel):
    vix_level: float
    vix_chg_5d: float
    rv_20d_pct: float
    drawdown_pct_504d: float
    ret_20d: float
    dist_sma50: float


class ScenarioResponse(BaseModel):
    baseline_risk: float
    scenario_risk: float
    delta: float
    prob_calm: float
    prob_elevated: float
    prob_turbulent: float
    baseline_prob_calm: float
    baseline_prob_elevated: float
    baseline_prob_turbulent: float
    driver_deltas: list[DriverDelta]


class ModelDriversResponse(BaseModel):
    global_importance: list[DriverItem]
    local_explanation: dict[str, float]
    threshold_sweep: list[dict] = []
