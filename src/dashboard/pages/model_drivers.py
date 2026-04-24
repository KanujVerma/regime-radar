"""Dashboard page showing SHAP-based model drivers."""
from __future__ import annotations
import streamlit as st
import plotly.graph_objects as go


from src.dashboard.api_client import get_client as _get_client


FEATURE_LABELS: dict[str, str] = {
    "vix_pct_504d": "VIX relative to 2-year history",
    "vix_level": "Current VIX level",
    "vix_zscore_252d": "VIX z-score (1-year)",
    "vix_chg_5d": "VIX 5-day change",
    "rv_20d_pct": "Realized volatility percentile",
    "drawdown_pct_504d": "Drawdown relative to 2-year history",
    "ret_20d": "20-day SPY return",
    "momentum_20d": "20-day momentum",
    "dist_sma50": "Distance from 50-day moving average",
    "emv_level": "Equity market volatility index",
    "days_in_regime_lag1": "Days in current regime (lagged)",
    "turbulent_count_30d_lag1": "Turbulent days in past 30 days (lagged)",
    "trend_code": "Trend direction",
}


def _label(feature: str) -> str:
    return FEATURE_LABELS.get(feature, feature)


def _shap_narrative(local_explanation: dict[str, float], global_importance: list[dict]) -> None:
    """Render plain-English explanation block between global and local charts."""
    if local_explanation:
        sorted_shap = sorted(local_explanation.items(), key=lambda x: abs(x[1]), reverse=True)
        # De-duplicate: skip ret_20d when momentum_20d is also present (they measure the same thing)
        deduped = []
        for feat, val in sorted_shap:
            if feat == "ret_20d" and any(f == "momentum_20d" for f, _ in sorted_shap):
                continue
            deduped.append((feat, val))

        upward = [(f, v) for f, v in deduped if v > 0]
        downward = [(f, v) for f, v in deduped if v < 0]

        lines = []
        if upward:
            lines.append("**What pushed risk higher:**")
            for i, (feat, val) in enumerate(upward[:2]):
                qualifier = "contributed most strongly upward" if i == 0 else "also added upward pressure"
                lines.append(f"- {_label(feat)} {qualifier} (SHAP: {val:+.3f})")
        if downward:
            lines.append("\n**What held risk down:**")
            lines.append(f"- {_label(downward[0][0])} was the strongest downward contributor")

        if lines:
            st.markdown("\n".join(lines))

    elif global_importance:
        top = global_importance[0]
        st.info(
            f"Overall, {_label(top['feature'])} has the largest influence on this model's "
            "transition risk estimates across all historical predictions."
        )


@st.cache_data(ttl=600)
def _load_drivers() -> dict:
    client = _get_client()
    return client.get_model_drivers()


def _global_importance_chart(global_importance: list[dict]) -> go.Figure:
    """Horizontal bar chart of top 15 global feature importances."""
    top15 = global_importance[:15]
    features = [d["feature"] for d in top15]
    values = [d["importance"] for d in top15]

    fig = go.Figure(
        go.Bar(
            x=values,
            y=features,
            orientation="h",
            marker_color="#1565C0",
        )
    )
    fig.update_layout(
        title="Global Feature Importance (Top 15)",
        xaxis_title="Importance",
        yaxis={"categoryorder": "total ascending"},
        height=420,
        margin=dict(t=60, b=30, l=20, r=20),
    )
    return fig


def _local_explanation_chart(local_explanation: dict[str, float]) -> go.Figure:
    """Horizontal bar chart for SHAP local explanation of the latest row."""
    # Sort by absolute value, show top 15
    sorted_items = sorted(local_explanation.items(), key=lambda x: abs(x[1]), reverse=True)[:15]
    features = [k for k, _ in sorted_items]
    values = [v for _, v in sorted_items]
    colors = ["#C62828" if v > 0 else "#2E7D32" for v in values]

    fig = go.Figure(
        go.Bar(
            x=values,
            y=features,
            orientation="h",
            marker_color=colors,
        )
    )
    fig.update_layout(
        title="Local Explanation — Latest Row (SHAP)",
        xaxis_title="SHAP Value",
        yaxis={"categoryorder": "total ascending"},
        height=420,
        margin=dict(t=60, b=30, l=20, r=20),
    )
    return fig


def render() -> None:
    """Render the Model Drivers page."""
    st.title("Model Drivers")
    st.markdown(
        "Feature importances from the transition-risk model. "
        "Global importance reflects overall model behavior; "
        "local explanation shows what drove the most recent prediction."
    )

    # -- Fetch data -----------------------------------------------------------
    with st.spinner("Loading model driver data…"):
        drivers = _load_drivers()

    global_importance = drivers.get("global_importance", [])
    local_explanation = drivers.get("local_explanation", {})

    if not global_importance:
        st.info(
            "No model artifact found. "
            "Run the bootstrap pipeline (`bootstrap_data.py`) to train models and generate artifacts."
        )
        return

    # -- Global importance chart ----------------------------------------------
    st.subheader("Global Feature Importance")
    global_fig = _global_importance_chart(global_importance)
    st.plotly_chart(global_fig, use_container_width=True)

    st.write("")
    _shap_narrative(local_explanation, global_importance)
    st.write("")

    st.divider()

    # -- Local explanation chart ----------------------------------------------
    st.subheader("Local Explanation — Latest Prediction")
    if local_explanation:
        local_fig = _local_explanation_chart(local_explanation)
        st.plotly_chart(local_fig, use_container_width=True)
        st.caption(
            "Red bars push transition risk higher; green bars push it lower. "
            "Values are SHAP contributions for the most recent data point."
        )
    else:
        st.info(
            "No local explanation available. "
            "SHAP values are computed when panel data is present."
        )
