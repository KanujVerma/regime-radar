"""Dashboard page displaying current market regime state."""
from __future__ import annotations
import streamlit as st
import plotly.graph_objects as go


from src.dashboard.api_client import get_client as _get_client


def _make_gauge(transition_risk: float) -> go.Figure:
    """Build a Plotly indicator gauge for transition risk (0–1 scale)."""
    fig = go.Figure(
        go.Indicator(
            mode="gauge+number",
            value=transition_risk,
            number={"valueformat": ".2f", "font": {"size": 36}},
            title={"text": "Transition Risk", "font": {"size": 16}},
            gauge={
                "axis": {"range": [0, 1], "tickwidth": 1},
                "bar": {"color": "#455A64"},
                "steps": [
                    {"range": [0, 0.3], "color": "#2E7D32"},
                    {"range": [0.3, 0.6], "color": "#F9A825"},
                    {"range": [0.6, 1.0], "color": "#C62828"},
                ],
                "threshold": {
                    "line": {"color": "white", "width": 3},
                    "thickness": 0.8,
                    "value": transition_risk,
                },
            },
        )
    )
    fig.update_layout(height=280, margin=dict(t=60, b=20, l=30, r=30))
    return fig


def _trend_chip(trend: str) -> None:
    """Render a trend indicator chip."""
    _map = {
        "uptrend": ("↑ Uptrend", "#2E7D32"),
        "downtrend": ("↓ Downtrend", "#C62828"),
        "neutral": ("→ Neutral", "#455A64"),
    }
    label, color = _map.get(trend, ("→ Neutral", "#455A64"))
    st.markdown(
        f'<span style="background-color:{color};color:white;padding:4px 14px;'
        f'border-radius:16px;font-size:0.9rem;font-weight:600;">{label}</span>',
        unsafe_allow_html=True,
    )


def _vix_sparkline(vix_level: float | None, vix_chg: float | None) -> None:
    """Show VIX metric card."""
    if vix_level is None:
        st.metric("VIX Level", "N/A")
        return
    delta = f"{vix_chg:+.2f}" if vix_chg is not None else None
    st.metric("VIX Level", f"{vix_level:.2f}", delta=delta)


def _drivers_bar(top_drivers: list[dict]) -> go.Figure:
    """Horizontal bar chart of top 5 feature drivers."""
    if not top_drivers:
        return go.Figure()
    top5 = top_drivers[:5]
    features = [d["feature"] for d in top5]
    importance = [d["importance"] for d in top5]

    fig = go.Figure(
        go.Bar(
            x=importance,
            y=features,
            orientation="h",
            marker_color="#1565C0",
        )
    )
    fig.update_layout(
        title="Top Feature Drivers",
        xaxis_title="Importance",
        yaxis={"categoryorder": "total ascending"},
        margin=dict(t=50, b=30, l=20, r=20),
        height=300,
    )
    return fig


@st.cache_data(ttl=60)
def _load_health() -> dict:
    return _get_client().get_health()


@st.cache_data(ttl=60)
def _load_current_state() -> dict | None:
    return _get_client().get_current_state()


def _build_narrative(regime: str, risk: float, trend: str, vix: float | None, vix_chg: float | None) -> str:
    risk_level = (
        "very low" if risk < 0.05
        else "low" if risk < 0.20
        else "moderate" if risk < 0.40
        else "elevated"
    )
    trend_sentence = {
        "uptrend": "The trend is positive.",
        "downtrend": "The trend is negative.",
    }.get(trend, "The trend is neutral.")
    if vix is None:
        vix_str = ""
    else:
        chg = vix_chg or 0.0
        direction = "rising" if chg > 0.5 else "falling" if chg < -0.5 else "stable"
        vix_str = f" VIX is at {vix:.1f} and {direction}."
    return (
        f"SPY is in a {regime} regime with {risk_level} transition risk ({risk:.1%})."
        f" {trend_sentence}{vix_str}"
    )


def _regime_prob_chips(prob_calm: float | None, prob_elevated: float | None, prob_turbulent: float | None) -> None:
    """Render three inline chips showing regime class probabilities. Hidden if any value is None."""
    if any(v is None for v in (prob_calm, prob_elevated, prob_turbulent)):
        return
    cols = st.columns(3)
    labels = [("Calm", prob_calm, "#2E7D32"), ("Elevated", prob_elevated, "#F9A825"), ("Turbulent", prob_turbulent, "#C62828")]
    for col, (label, prob, color) in zip(cols, labels):
        col.markdown(
            f'<span style="background:{color}22;color:{color};border:1px solid {color}66;'
            f'border-radius:12px;padding:2px 10px;font-size:0.82rem;font-weight:600;">'
            f'{label} {prob:.0%}</span>',
            unsafe_allow_html=True,
        )


def _delta_panel(current: dict, prior: dict | None) -> None:
    """Render compact 3-metric delta row. Skipped if prior is None."""
    if prior is None:
        return
    risk_now = current.get("transition_risk") or 0.0
    risk_prev = prior.get("transition_risk") or 0.0
    delta_risk = risk_now - risk_prev
    regime_now = current.get("regime", "")
    regime_prev = prior.get("regime", "")
    regime_change = f"{regime_prev} → {regime_now}" if regime_now != regime_prev else "No change"
    c1, c2, c3 = st.columns(3)
    c1.metric("Risk Δ since last refresh", f"{risk_now:.1%}", f"{delta_risk:+.1%}")
    c2.metric("Regime", regime_now, regime_change if regime_now != regime_prev else None)
    c3.metric("Mode", current.get("mode", "demo").upper())


def render() -> None:
    st.title("Current Market State")

    health = _load_health()
    state = _load_current_state()
    if state is None:
        st.error("No state data available. Run a data refresh first.")
        return

    from src.dashboard.components import (
        DEFAULT_THRESHOLD, REGIME_COLORS, mode_badge, regime_pill, apply_regime_colormap
    )
    from src.dashboard.api_client import get_client as _get_client

    prior: dict | None = None
    try:
        client = _get_client()
        if hasattr(client, "_state"):
            prior = client._state.read_prior_state()
    except Exception:
        pass

    left, right = st.columns([1, 1])

    with left:
        regime_pill(state.get("regime", "unknown"))
        _trend_chip(state.get("trend", "neutral"))
        st.write("")
        narrative = _build_narrative(
            state.get("regime", "unknown"),
            state.get("transition_risk") or 0.0,
            state.get("trend", "neutral"),
            state.get("vix_level"),
            state.get("vix_chg_1d"),
        )
        st.markdown(narrative)
        st.write("")
        _regime_prob_chips(
            state.get("prob_calm"),
            state.get("prob_elevated"),
            state.get("prob_turbulent"),
        )
        st.write("")
        _delta_panel(state, prior)

    with right:
        st.plotly_chart(_make_gauge(state.get("transition_risk") or 0.0), use_container_width=True)
        _vix_sparkline(state.get("vix_level"), state.get("vix_chg_1d"))
        st.write("")
        mode = state.get("mode", "demo")
        mode_badge(mode)
        as_of = state.get("as_of_ts", "")
        if as_of:
            st.caption(f"Last refresh: {as_of}")
        st.write("")
        st.caption(
            f"At the default threshold ({DEFAULT_THRESHOLD:.2f}): "
            "alerts on ~34% of days, detecting 54% of transitions."
        )

    st.divider()
    st.subheader("Feature Drivers")
    drivers = state.get("top_drivers") or []
    if drivers:
        st.plotly_chart(_drivers_bar(drivers), use_container_width=True)
    else:
        st.info("Detailed driver explanations are unavailable for this refresh.")
