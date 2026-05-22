"""Pydantic response schemas for RegimeRadar API."""
from __future__ import annotations
from typing import Literal
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
    days_in_regime_lag1: float | None = None
    turbulent_count_30d_lag1: float | None = None


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
    baseline_inputs: dict[str, float]


class ModelDriversResponse(BaseModel):
    global_importance: list[DriverItem]
    local_explanation: dict[str, float]
    threshold_sweep: list[dict] = []


class ReliabilityBin(BaseModel):
    p_low: float
    p_high: float
    p_mid: float
    empirical_rate: float
    n: int


class ReliabilityResponse(BaseModel):
    bins: list[ReliabilityBin]
    base_rate: float
    max_evaluated_p: float
    source: Literal["oof", "production_insample"] = "oof"


class DailyDriverEntry(BaseModel):
    feature: str
    plain_label: str
    importance: float


class DailyModelVersion(BaseModel):
    transition_model: str
    transition_trained_as_of: str
    regime_model: str
    regime_trained_as_of: str


class DailyStateSnapshot(BaseModel):
    as_of_date: str
    generated_at: str
    data_through_date: str
    regime: str
    transition_risk: float
    prob_calm: float | None
    prob_elevated: float | None
    prob_turbulent: float | None
    vix_level: float | None
    trend: str
    top_drivers: list[DailyDriverEntry]
    model_version: DailyModelVersion


class DailyTopDriverRef(BaseModel):
    feature: str
    plain_label: str


class DailyDiff(BaseModel):
    regime_changed: bool
    prior_regime: str | None
    risk_delta: float
    vix_delta: float | None
    trend_changed: bool
    prior_trend: str | None
    top_driver_changed: bool
    prior_top_driver: DailyTopDriverRef | None
    current_top_driver: DailyTopDriverRef | None


class DailyDiffMetadata(BaseModel):
    current_date: str
    previous_date: str
    gap_days: int
    is_stale: bool


class DailyDiffResponse(BaseModel):
    current: DailyStateSnapshot
    previous: DailyStateSnapshot
    diff: DailyDiff
    metadata: DailyDiffMetadata


class ChangelogEntry(BaseModel):
    current_date: str
    previous_date: str | None
    gap_days: int
    is_stale_gap: bool              # gap_days > 5
    regime: str
    transition_risk: float
    risk_delta: float
    vix_level: float | None
    vix_delta: float | None
    trend: str
    prior_regime: str | None
    prior_trend: str | None
    top_driver: DailyDriverEntry | None
    prior_top_driver: DailyDriverEntry | None
    triggers: list[str]
    primary_trigger: str | None     # None when triggers is empty
    narrative: str


class ChangelogResponse(BaseModel):
    entries: list[ChangelogEntry]   # most-recent-first
    total_notable: int
    total_days: int
    earliest_date: str | None
    latest_date: str | None
