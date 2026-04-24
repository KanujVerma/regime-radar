"""Shared Streamlit UI components for the dashboard."""
from __future__ import annotations
import streamlit as st
import plotly.graph_objects as go

DEFAULT_THRESHOLD: float = 0.10

# Regime color map — used consistently across all charts
REGIME_COLORS = {
    "calm": "#2E7D32",
    "elevated": "#F9A825",
    "turbulent": "#C62828",
}

_REGIME_LABELS = {
    "calm": "Calm",
    "elevated": "Elevated",
    "turbulent": "Turbulent",
}

_MODE_CONFIG = {
    "live": {"label": "NEAR-LIVE DATA", "color": "#2E7D32"},
    "demo": {"label": "DEMO MODE", "color": "#F9A825"},
}


def mode_badge(mode: str) -> None:
    """Render a LIVE (green) or DEMO (amber) badge."""
    cfg = _MODE_CONFIG.get(mode, _MODE_CONFIG["demo"])
    color = cfg["color"]
    label = cfg["label"]
    # Render as colored markdown badge
    st.markdown(
        f'<span style="background-color:{color};color:white;padding:2px 10px;'
        f'border-radius:4px;font-weight:bold;font-size:0.75rem;">{label}</span>',
        unsafe_allow_html=True,
    )


def regime_pill(regime: str) -> None:
    """Render a large colored text pill for the current regime."""
    color = REGIME_COLORS.get(regime, "#9E9E9E")
    label = _REGIME_LABELS.get(regime, regime.title())
    st.markdown(
        f'<div style="display:inline-block;background-color:{color};color:white;'
        f'padding:8px 28px;border-radius:24px;font-size:1.5rem;font-weight:bold;'
        f'letter-spacing:0.04em;">{label}</div>',
        unsafe_allow_html=True,
    )


def apply_regime_colormap(
    fig: go.Figure,
    regime_series,
    date_series,
) -> go.Figure:
    """Add colored background bands for each regime period to a Plotly figure.

    Args:
        fig: Plotly Figure to mutate in place.
        regime_series: iterable of regime strings aligned with date_series.
        date_series: iterable of date/datetime strings or objects.

    Returns:
        The mutated figure (for chaining).
    """
    regimes = list(regime_series)
    dates = list(date_series)
    if not regimes or not dates:
        return fig

    # Build contiguous color bands
    shapes = []
    n = len(dates)
    i = 0
    while i < n:
        current_regime = regimes[i]
        j = i + 1
        while j < n and regimes[j] == current_regime:
            j += 1
        color = REGIME_COLORS.get(current_regime, "#9E9E9E")
        shapes.append(
            dict(
                type="rect",
                xref="x",
                yref="paper",
                x0=dates[i],
                x1=dates[j - 1],
                y0=0,
                y1=1,
                fillcolor=color,
                opacity=0.12,
                layer="below",
                line_width=0,
            )
        )
        i = j

    fig.update_layout(shapes=shapes)
    return fig
