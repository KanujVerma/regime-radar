"""Dashboard page showing historical regime classifications."""
from __future__ import annotations
from datetime import date, timedelta
import streamlit as st
import plotly.graph_objects as go
from plotly.subplots import make_subplots


from src.dashboard.api_client import get_client as _get_client


@st.cache_data(ttl=300)
def _load_historical(start: str, end: str | None) -> dict:
    client = _get_client()
    return client.get_historical_state(start, end)


def _build_price_chart(
    dates: list,
    closes: list,
    regimes: list,
    vix_levels: list | None,
    show_vix: bool,
) -> go.Figure:
    """Build SPY close line with regime background bands."""
    from src.dashboard.components import REGIME_COLORS, apply_regime_colormap

    rows = 2 if (show_vix and vix_levels) else 1
    row_heights = [0.7, 0.3] if rows == 2 else [1.0]

    fig = make_subplots(
        rows=rows,
        cols=1,
        shared_xaxes=True,
        row_heights=row_heights,
        vertical_spacing=0.06,
    )

    # SPY close price
    fig.add_trace(
        go.Scatter(
            x=dates,
            y=closes,
            mode="lines",
            name="SPY Close",
            line=dict(color="#42A5F5", width=2.0),
        ),
        row=1,
        col=1,
    )

    # Regime background bands
    apply_regime_colormap(fig, regimes, dates)

    # Add dummy traces for legend
    for regime, color in REGIME_COLORS.items():
        fig.add_trace(
            go.Scatter(
                x=[None],
                y=[None],
                mode="lines",
                name=regime.title(),
                line=dict(color=color, width=6),
                showlegend=True,
            ),
            row=1,
            col=1,
        )

    # VIX overlay
    if show_vix and vix_levels and rows == 2:
        fig.add_trace(
            go.Scatter(
                x=dates,
                y=vix_levels,
                mode="lines",
                name="VIX",
                line=dict(color="#E65100", width=1.0),
            ),
            row=2,
            col=1,
        )
        fig.update_yaxes(title_text="VIX", row=2, col=1)

    fig.update_yaxes(title_text="SPY Close", row=1, col=1)
    fig.update_layout(
        title="Regime Timeline — SPY Close",
        height=480 if rows == 2 else 360,
        margin=dict(t=60, b=30, l=60, r=20),
        hovermode="x unified",
    )
    return fig


def _build_risk_chart(dates: list, risks: list) -> go.Figure:
    """Transition risk area chart."""
    from src.dashboard.components import DEFAULT_THRESHOLD

    fig = go.Figure(
        go.Scatter(
            x=dates,
            y=risks,
            mode="lines",
            fill="tozeroy",
            name="Transition Risk",
            line=dict(color="#C62828", width=1.5),
            fillcolor="rgba(198, 40, 40, 0.18)",
        )
    )
    # Risk threshold lines
    threshold_lines = [
        (DEFAULT_THRESHOLD, "Watch (default threshold)"),
        (0.30, "Alert (high sensitivity)"),
    ]
    for level, label in threshold_lines:
        fig.add_hline(
            y=level,
            line_dash="dash",
            line_color="#F9A825",
            line_width=1,
            annotation_text=label,
            annotation_position="top right",
            annotation_font_size=10,
        )

    fig.update_layout(
        title="Transition Risk Over Time",
        yaxis=dict(title="Risk", range=[0, 1]),
        height=260,
        margin=dict(t=50, b=30, l=60, r=20),
        hovermode="x unified",
    )
    return fig


def render() -> None:
    """Render the History page."""
    st.title("History")

    # -- Controls -------------------------------------------------------------
    col_start, col_end, col_vix = st.columns([2, 2, 1])
    default_start = date.today() - timedelta(days=365 * 3)
    with col_start:
        start_date = st.date_input("Start date", value=default_start)
    with col_end:
        end_date = st.date_input("End date", value=date.today())
    with col_vix:
        show_vix = st.toggle("VIX overlay", value=True)

    start_str = str(start_date)
    end_str = str(end_date)

    # -- Fetch data -----------------------------------------------------------
    with st.spinner("Loading historical data…"):
        data = _load_historical(start_str, end_str)

    points = data.get("data", [])

    if not points:
        st.info(
            "No historical data available for this date range. "
            "Run the bootstrap pipeline to generate panel data."
        )
        return

    dates = [p["date"] for p in points]
    closes = [p.get("close") for p in points]
    regimes = [p.get("regime", "unknown") for p in points]
    risks_raw = [p.get("transition_risk") for p in points]
    vix_levels = [p.get("vix_level") for p in points]

    # Keep None values — Plotly renders them as gaps (connectgaps=False default)
    valid_closes = closes
    valid_risks = risks_raw
    valid_vix = vix_levels

    # -- Charts ---------------------------------------------------------------
    price_fig = _build_price_chart(dates, valid_closes, regimes, valid_vix, show_vix)
    st.plotly_chart(price_fig, use_container_width=True)
    st.write("")

    risk_fig = _build_risk_chart(dates, valid_risks)
    st.plotly_chart(risk_fig, use_container_width=True)

    st.caption(
        f"Showing {len(points)} trading days from {data.get('start', start_str)} "
        f"to {data.get('end', end_str)}."
    )
