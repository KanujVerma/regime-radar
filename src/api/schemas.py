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


class ModelDriversResponse(BaseModel):
    global_importance: list[DriverItem]
    local_explanation: dict[str, float]
