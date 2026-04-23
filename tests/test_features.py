"""Tests for market feature engineering."""
import numpy as np
import pandas as pd
import pytest
from src.features.build_market_features import build_features


class TestFeatureEngineering:
    def test_basic_shape(self, synthetic_ohlcv, synthetic_vix, synthetic_emv):
        from src.data.merge_sources import merge_market_panel
        panel = merge_market_panel(synthetic_ohlcv, synthetic_vix, synthetic_emv)
        features = build_features(panel)
        assert len(features.columns) >= 18
        assert features.index.equals(panel.index)

    def test_no_future_looking_windows(self, synthetic_ohlcv, synthetic_vix, synthetic_emv):
        """All rolling windows end at t. First row of any n-day window should be NaN."""
        from src.data.merge_sources import merge_market_panel
        panel = merge_market_panel(synthetic_ohlcv, synthetic_vix, synthetic_emv)
        features = build_features(panel)
        assert features["rv_20d"].iloc[:20].isna().all()

    def test_vix_pct_in_unit_interval(self, synthetic_ohlcv, synthetic_vix, synthetic_emv):
        """vix_pct_504d must be in [0, 1]."""
        from src.data.merge_sources import merge_market_panel
        panel = merge_market_panel(synthetic_ohlcv, synthetic_vix, synthetic_emv)
        features = build_features(panel)
        valid = features["vix_pct_504d"].dropna()
        assert (valid >= 0).all() and (valid <= 1).all()

    def test_no_target_leakage_in_regime_features(self, synthetic_ohlcv, synthetic_vix, synthetic_emv):
        """days_in_regime_lag1 and turbulent_count_30d_lag1 at a flip day
        reflect only the pre-flip regime state (leakage guard enforced)."""
        from src.data.merge_sources import merge_market_panel
        panel = merge_market_panel(synthetic_ohlcv, synthetic_vix, synthetic_emv)

        n = len(panel)
        regime = pd.Series(
            ["calm"] * 200 + ["turbulent"] * (n - 200),
            index=panel.index,
            name="regime",
        )

        features = build_features(panel, regime_series=regime)

        flip_day_days = features["days_in_regime_lag1"].iloc[200]
        assert flip_day_days == pytest.approx(200, abs=2), (
            f"At regime flip day, days_in_regime_lag1={flip_day_days}, "
            f"expected ~200 (pre-flip calm streak)"
        )

        flip_day_tc = features["turbulent_count_30d_lag1"].iloc[200]
        assert flip_day_tc == 0, (
            f"turbulent_count_30d_lag1 at flip day = {flip_day_tc}, expected 0"
        )
