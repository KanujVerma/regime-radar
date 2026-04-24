"""Scenario Explorer — sandbox scoring and threshold tuning."""
from __future__ import annotations

import math
from pathlib import Path

import pandas as pd
import streamlit as st

from src.dashboard.components import DEFAULT_THRESHOLD

# ---------------------------------------------------------------------------
# Feature label map (kept local to avoid coupling with model_drivers.py)
# ---------------------------------------------------------------------------
_LABELS: dict[str, str] = {
    "vix_level": "VIX level",
    "vix_chg_5d": "VIX 5-day change",
    "rv_20d_pct": "Realized-vol percentile",
    "drawdown_pct_504d": "Drawdown (2-year percentile)",
    "ret_20d": "20-day return",
    "dist_sma50": "Distance from SMA-50",
}

_SANDBOX_FEATURES = ["vix_level", "vix_chg_5d", "rv_20d_pct", "drawdown_pct_504d", "ret_20d", "dist_sma50"]

_SLIDER_CONFIG: dict[str, tuple] = {
    # feature_key: (min, max, step, default)
    "vix_level":         (5.0,   80.0,  0.5,  20.0),
    "vix_chg_5d":        (-15.0, 15.0,  0.1,  0.0),
    "rv_20d_pct":        (0.0,   1.0,   0.01, 0.50),
    "drawdown_pct_504d": (0.0,   1.0,   0.01, 0.05),
    "ret_20d":           (-0.30, 0.30,  0.01, 0.02),
    "dist_sma50":        (-0.15, 0.15,  0.005, 0.01),
}


@st.cache_resource
def _load_transition_model():
    """Load xgb_transition model and metadata from registry."""
    from src.models.registry import load_artifact, load_metadata
    model = load_artifact("xgb_transition")
    meta = load_metadata("xgb_transition")
    return model, meta


@st.cache_data(ttl=300)
def _load_live_values() -> dict[str, float | None]:
    """Try to read live feature values from the latest panel row."""
    panel_path = Path("data/processed/panel.parquet")
    if not panel_path.exists():
        return {}
    try:
        df = pd.read_parquet(panel_path)
        if df.empty:
            return {}
        row = df.iloc[-1]
        return {k: float(row[k]) for k in _SANDBOX_FEATURES if k in row and not math.isnan(float(row[k]))}
    except Exception:
        return {}


def _score(model, meta, feature_row: dict[str, float]) -> float:
    """Run model.predict_proba on a single feature row, returning P(transition)."""
    feature_names = meta.get("feature_names")
    if not feature_names:
        raise ValueError("Model metadata missing 'feature_names' — cannot construct feature vector.")
    X = pd.DataFrame([{f: feature_row.get(f, 0.0) for f in feature_names}])
    return float(model.predict_proba(X)[0, 1])


def _render_sandbox(model, meta, live_vals: dict) -> None:
    st.subheader("Scenario Sandbox")
    st.caption(
        "Adjust individual model inputs to see how transition risk responds. "
        "All other inputs are held at their current values."
    )

    panel_path = Path("data/processed/panel.parquet")
    baseline_features: dict[str, float] = {}
    if panel_path.exists():
        try:
            df = pd.read_parquet(panel_path)
            if not df.empty:
                row = df.iloc[-1]
                feature_names = meta.get("feature_names", [])
                baseline_features = {f: float(row[f]) for f in feature_names if f in row}
        except Exception:
            pass

    if st.button("Reset to current market state"):
        if live_vals:
            for k, v in live_vals.items():
                st.session_state[f"sandbox_{k}"] = v
        else:
            for k, (mn, mx, step, default) in _SLIDER_CONFIG.items():
                st.session_state[f"sandbox_{k}"] = default
            st.caption("Showing default values — live data unavailable.")

    sandbox_vals: dict[str, float] = {}
    for feat, (mn, mx, step, default) in _SLIDER_CONFIG.items():
        live_default = live_vals.get(feat, default)
        key = f"sandbox_{feat}"
        sandbox_vals[feat] = st.slider(
            _LABELS[feat],
            min_value=mn, max_value=mx, step=step,
            value=st.session_state.get(key, live_default),
            key=key,
        )

    adjusted_features = {**baseline_features, **sandbox_vals}
    baseline_risk = _score(model, meta, baseline_features) if baseline_features else _score(model, meta, sandbox_vals)
    adjusted_risk = _score(model, meta, adjusted_features)
    delta = adjusted_risk - baseline_risk

    c1, c2, c3 = st.columns(3)
    c1.metric("Baseline Risk", f"{baseline_risk:.1%}")
    c2.metric("Adjusted Risk", f"{adjusted_risk:.1%}")
    c3.metric("Delta", f"{delta:+.1%}", delta_color="inverse")

    changed = [
        _LABELS[f] for f in _SANDBOX_FEATURES
        if abs(sandbox_vals.get(f, 0.0) - baseline_features.get(f, sandbox_vals.get(f, 0.0))) > 1e-6
    ]
    changed_str = ", ".join(changed) if changed else "these inputs"
    direction = "increases" if adjusted_risk > baseline_risk + 1e-4 else "decreases" if adjusted_risk < baseline_risk - 1e-4 else "does not change"
    st.markdown(f"Adjusting **{changed_str}** {direction} transition risk from {baseline_risk:.1%} to {adjusted_risk:.1%}.")

    st.info(
        "This is a scenario tool. Sliders adjust individual model inputs to illustrate "
        "model sensitivity — not a forecast of actual future market conditions."
    )


def _render_threshold_tuning(meta: dict) -> None:
    st.subheader("Threshold Tuning")
    st.caption(
        "Explore how the alert threshold trades off recall against false-alert frequency. "
        "Lower thresholds catch more transitions but generate more noise."
    )

    sweep = meta.get("threshold_sweep", [])
    if not sweep:
        st.warning("Threshold sweep data not available in model metadata.")
        return

    thresholds = [r["threshold"] for r in sweep]
    default_threshold = DEFAULT_THRESHOLD if DEFAULT_THRESHOLD in thresholds else thresholds[0]
    threshold = st.select_slider(
        "Alert threshold", options=thresholds, value=default_threshold
    )

    row = next((r for r in sweep if abs(r["threshold"] - threshold) < 1e-9), None)
    if row is None:
        st.warning(f"No sweep data for threshold {threshold}.")
        return

    recall = row["recall"]
    far = row["false_alert_rate"]
    freq = row["alert_frequency"]
    lead = row["avg_lead_time_days"]

    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Recall", f"{recall:.0%}")
    m2.metric("False Alert Rate", f"{far:.0%}")
    m3.metric("Alert Frequency", f"{freq:.0%}")
    m4.metric("Avg Lead Time", f"{int(lead)} days" if not math.isnan(lead) else "—")

    if not math.isnan(lead):
        st.markdown(
            f"At **{threshold:.2f}**: alerts on {freq:.0%} of trading days, "
            f"catching {recall:.0%} of actual transitions an average of {int(lead)} days before they occur."
        )
    else:
        st.markdown(
            f"At **{threshold:.2f}**: alerts on {freq:.0%} of trading days, "
            f"catching {recall:.0%} of actual transitions — no early warning detected at this threshold."
        )


def _render_methodology() -> None:
    with st.expander("How does RegimeRadar work?"):
        st.markdown("""
- **Market regime** — SPY is classified as Calm, Elevated, or Turbulent using a composite stress score built from VIX percentile, realized volatility percentile, and drawdown.
- **Transition risk** — the probability that the regime escalates within the next 5 trading days, estimated by an XGBoost model trained on 30+ years of daily data.
- **Thresholds** — lower values are more sensitive (fewer missed transitions) but produce more frequent alerts. Use the tuning panel to find your preferred operating point.
- **Near-live, not intraday** — the model refreshes daily using end-of-day data; it is not suitable for intraday timing decisions.
- **HF Spaces** — demo-only (pre-built historical replay); NEAR-LIVE DATA mode requires running the full docker compose stack locally.
""")


def render() -> None:
    st.title("Scenario Explorer")

    try:
        model, meta = _load_transition_model()
    except Exception as exc:
        st.error(f"Could not load transition model: {exc}")
        return

    live_vals = _load_live_values()

    _render_sandbox(model, meta, live_vals)
    st.divider()
    _render_threshold_tuning(meta)
    st.divider()
    _render_methodology()
