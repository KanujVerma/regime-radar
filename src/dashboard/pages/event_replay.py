"""Dashboard page for replaying historical stress events."""
from __future__ import annotations
import math
import streamlit as st
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from src.dashboard.components import DEFAULT_THRESHOLD

# Human-readable event names mapped to API event keys
EVENT_OPTIONS = {
    "2008 Financial Crisis": "financial_crisis_2008",
    "COVID-19 2020": "covid_2020",
    "Rate Hike Cycle 2022": "tightening_2022",
}

EVENT_DESCRIPTIONS = {
    "financial_crisis_2008": "The 2008 financial crisis saw SPY fall more than 50% from peak as credit markets seized.",
    "covid_2020": "The COVID-19 market crash in early 2020 was one of the fastest equity declines on record.",
    "tightening_2022": "The 2022 rate-tightening cycle saw aggressive Fed hikes as inflation reached 40-year highs.",
}

_METHODOLOGY_NOTE = (
    "Replay metrics are computed from out-of-fold predictions — each day in this window "
    "was scored by a model that did not train on that day."
)

_REGIME_NUM_TO_LABEL = {0.1: "Calm", 0.5: "Elevated", 0.9: "Turbulent"}


from src.dashboard.api_client import get_client as _get_client


@st.cache_data(ttl=600)
def _load_event(event_key: str) -> dict:
    client = _get_client()
    return client.get_event_replay(event_key)


def _summary_card(warning_lead_days: float | None, data: list[dict]) -> None:
    """Render hero stats row + supporting stats row above the chart."""
    risk_values = [p["transition_risk"] for p in data if p.get("transition_risk") is not None]
    peak_risk = max(risk_values) if risk_values else 0.0

    h1, h2 = st.columns(2)
    with h1:
        if warning_lead_days is not None and not math.isnan(warning_lead_days) and warning_lead_days > 0:
            st.metric("Warning Lead Time", f"{int(warning_lead_days)} trading days early")
        else:
            st.metric("Warning Lead Time", "No early warning detected")
    with h2:
        st.metric("Peak Transition Risk", f"{peak_risk:.0%}")

    alert_days = sum(1 for p in data if (p.get("transition_risk") or 0) > DEFAULT_THRESHOLD)
    first_cross_dates = [
        p["date"] for p in data
        if (p.get("transition_risk") or 0) > DEFAULT_THRESHOLD
    ]
    first_cross = first_cross_dates[0] if first_cross_dates else "—"

    valid_pairs = [
        p for p in data
        if p.get("regime_actual") not in (None, "unknown")
        and p.get("regime_predicted") not in (None, "unknown")
    ]
    match_rate = (
        sum(1 for p in valid_pairs if p["regime_actual"] == p["regime_predicted"]) / len(valid_pairs)
        if valid_pairs else 0.0
    )

    high_stress_days = sum(
        1 for p in data if p.get("regime_actual") in ("elevated", "turbulent")
    )

    s1, s2, s3, s4 = st.columns(4)
    s1.metric("Alert Days", alert_days)
    s2.metric("First Alert", first_cross)
    s3.metric("Regime Match Rate", f"{match_rate:.0%}")
    s4.metric("High-Stress Days", high_stress_days)


def _build_event_chart(data: list[dict]) -> go.Figure:
    """Build overlaid actual vs predicted regime + transition risk chart."""
    from src.dashboard.components import REGIME_COLORS, apply_regime_colormap

    dates = [p["date"] for p in data]
    regime_actual = [p.get("regime_actual", "unknown") for p in data]
    regime_predicted = [p.get("regime_predicted", "unknown") for p in data]
    risks = [p.get("transition_risk") or 0.0 for p in data]
    transition_actual = [p.get("transition_actual", 0) for p in data]

    fig = make_subplots(
        rows=2,
        cols=1,
        shared_xaxes=True,
        row_heights=[0.6, 0.4],
        vertical_spacing=0.08,
        subplot_titles=["Actual vs Predicted Regime", "Transition Risk"],
    )

    # Actual regime background bands
    apply_regime_colormap(fig, regime_actual, dates)

    # Predicted regime as a step line (numeric encoding for visual separation)
    regime_order = {"calm": 0.1, "elevated": 0.5, "turbulent": 0.9}
    pred_y = [regime_order.get(r, 0.5) for r in regime_predicted]
    actual_y = [regime_order.get(r, 0.5) for r in regime_actual]

    fig.add_trace(
        go.Scatter(
            x=dates,
            y=actual_y,
            mode="lines",
            name="Actual Regime",
            line=dict(color="#1565C0", width=2, dash="solid"),
            customdata=[_REGIME_NUM_TO_LABEL.get(v, "Unknown") for v in actual_y],
            hovertemplate="%{x}<br>%{customdata}<extra></extra>",
        ),
        row=1,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=dates,
            y=pred_y,
            mode="lines",
            name="Predicted Regime",
            line=dict(color="#E65100", width=2, dash="dash"),
            customdata=[_REGIME_NUM_TO_LABEL.get(v, "Unknown") for v in pred_y],
            hovertemplate="%{x}<br>%{customdata}<extra></extra>",
        ),
        row=1,
        col=1,
    )

    # Mark actual transition events
    date_to_idx = {d: i for i, d in enumerate(dates)}
    event_dates = [d for d, t in zip(dates, transition_actual) if t == 1]
    event_ys = [regime_order.get(regime_actual[date_to_idx[d]], 0.5) for d in event_dates]
    if event_dates:
        fig.add_trace(
            go.Scatter(
                x=event_dates,
                y=event_ys,
                mode="markers",
                name="Transition Event",
                marker=dict(color="#C62828", size=10, symbol="x"),
            ),
            row=1,
            col=1,
        )

    # Transition risk area
    fig.add_trace(
        go.Scatter(
            x=dates,
            y=risks,
            mode="lines",
            fill="tozeroy",
            name="Transition Risk",
            line=dict(color="#C62828", width=1.5),
            fillcolor="rgba(198, 40, 40, 0.18)",
        ),
        row=2,
        col=1,
    )
    fig.add_hline(y=0.5, line_dash="dot", line_color="#F9A825", row=2, col=1)

    # Vertical line at first threshold crossing
    cross_dates = [
        p["date"] for p in data
        if (p.get("transition_risk") or 0) > DEFAULT_THRESHOLD
    ]
    if cross_dates:
        fig.add_vline(
            x=cross_dates[0],
            line_dash="dash",
            line_color="#F9A825",
            line_width=1,
            row=2, col=1,
        )

    fig.update_yaxes(
        tickvals=[0.1, 0.5, 0.9],
        ticktext=["Calm", "Elevated", "Turbulent"],
        row=1,
        col=1,
    )
    fig.update_yaxes(title_text="Risk", range=[0, 1], row=2, col=1)
    fig.update_layout(
        height=520,
        margin=dict(t=80, b=30, l=80, r=20),
        hovermode="x unified",
    )
    return fig


def render() -> None:
    """Render the Event Replay page."""
    st.title("Event Replay")
    st.markdown(
        "Replay historical stress windows to see how the model would have characterized "
        "each crisis period."
    )

    # -- Event selector -------------------------------------------------------
    selected_label = st.selectbox(
        "Select crisis window",
        options=list(EVENT_OPTIONS.keys()),
    )
    event_key = EVENT_OPTIONS[selected_label]

    # -- Fetch event data -----------------------------------------------------
    with st.spinner(f"Loading {selected_label}…"):
        result = _load_event(event_key)

    data = result.get("data", [])
    warning_lead_days = result.get("warning_lead_days")

    if not data:
        st.info(
            f"No event replay data available for '{selected_label}'. "
            "Run the bootstrap pipeline to generate out-of-fold predictions."
        )
        return

    # -- Event context --------------------------------------------------------
    description = EVENT_DESCRIPTIONS.get(event_key)
    if description:
        st.markdown(description)
    st.caption(_METHODOLOGY_NOTE)

    st.write("")

    # -- Summary cards --------------------------------------------------------
    _summary_card(warning_lead_days, data)

    st.write("")

    # -- Chart ----------------------------------------------------------------
    fig = _build_event_chart(data)
    st.plotly_chart(fig, use_container_width=True)

    st.caption(
        f"Showing {len(data)} trading days for {selected_label}. "
        "Colored bands represent actual regimes. Orange dashed line = predicted regime."
    )
