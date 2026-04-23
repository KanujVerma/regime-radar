"""SHAP-based feature explanation with fallback to XGBoost gain importance."""
from __future__ import annotations
import numpy as np
import pandas as pd
from src.utils.logging import get_logger

_logger = get_logger(__name__)


def get_shap_explanation(
    model,
    features: pd.DataFrame,
    feature_names: list[str] | None = None,
    row_idx: int = -1,
) -> dict[str, float]:
    """Compute SHAP values for a single row (default: last row).

    Returns a dict mapping feature_name → shap_value.
    Falls back to XGBoost feature_importances_ if SHAP fails.
    """
    if feature_names is None:
        feature_names = list(features.columns)

    X = features.fillna(0)
    row = X.iloc[[row_idx]]

    try:
        import shap
        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(row)
        # For binary classifier, shap_values is a 2D array (1 row × n_features)
        if isinstance(shap_values, list):
            vals = shap_values[1][0]  # class 1 SHAP values
        else:
            vals = shap_values[0]
        return {f: float(v) for f, v in zip(feature_names, vals)}
    except Exception as e:
        _logger.warning("SHAP failed: %s. Using XGBoost gain importance.", e)
        try:
            importance = model.feature_importances_
            return {f: float(v) for f, v in zip(feature_names, importance)}
        except Exception:
            return {}
