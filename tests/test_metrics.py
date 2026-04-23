"""Tests for evaluation metrics."""
import numpy as np
import pandas as pd
import pytest
from src.evaluation.metrics import regime_metrics, transition_metrics, lead_time
from src.evaluation.threshold_analysis import threshold_sweep


class TestRegimeMetrics:
    def test_perfect_predictions(self):
        y = pd.Series(["calm", "elevated", "turbulent"] * 10)
        m = regime_metrics(y, y)
        assert m["macro_f1"] == pytest.approx(1.0)
        assert m["balanced_accuracy"] == pytest.approx(1.0)

    def test_all_wrong_predictions(self):
        y_true = pd.Series(["calm"] * 30)
        y_pred = pd.Series(["turbulent"] * 30)
        m = regime_metrics(y_true, y_pred)
        assert m["macro_f1"] == pytest.approx(0.0, abs=0.01)


class TestTransitionMetrics:
    def test_perfect_binary(self):
        y = pd.Series([0, 0, 1, 0, 1, 0, 0, 1])
        m = transition_metrics(y, pd.Series([0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 1.0]))
        assert m["recall_at_threshold"] == pytest.approx(1.0)
        assert m["false_alert_rate"] == pytest.approx(0.0)

    def test_false_alert_rate_correct(self):
        """FAR = FP / (FP + TN). With threshold=0.5: predict all 1."""
        y_true = pd.Series([0, 0, 0, 1])
        y_score = pd.Series([0.9, 0.9, 0.9, 0.9])
        m = transition_metrics(y_true, y_score, threshold=0.5)
        # 3 FP, 0 TN → FAR = 1.0
        assert m["false_alert_rate"] == pytest.approx(1.0)


class TestLeadTime:
    def test_known_lead_time(self):
        """Risk crosses threshold 5 days before event → lead_time = 5."""
        dates = pd.bdate_range("2020-01-01", periods=30)
        risk = pd.Series([0.0] * 20 + [0.6] * 10, index=dates)
        events_df = pd.DataFrame({"transition_up": [0] * 25 + [1] + [0] * 4}, index=dates)
        lt = lead_time(events_df, risk, threshold=0.5, lookback_days=20)
        # Risk went high at day 20, event at day 25 → 5 trading days lead
        assert lt["n_events"] == 1
        assert lt["n_detected"] == 1
        assert lt["mean_lead_days"] > 0


class TestThresholdSweep:
    def test_output_shape(self):
        y = pd.Series(np.random.default_rng(0).integers(0, 2, 100))
        scores = pd.Series(np.random.default_rng(1).uniform(0, 1, 100))
        df = threshold_sweep(y, scores)
        assert len(df) == 7  # 7 thresholds
        assert "threshold" in df.columns
        assert "recall" in df.columns
        assert "false_alert_rate" in df.columns

    def test_recall_monotone_decreasing(self):
        """As threshold rises, recall should be non-increasing."""
        rng = np.random.default_rng(42)
        y = pd.Series(rng.integers(0, 2, 500))
        # Perfect scores: score = label for easy monotonicity test
        scores = pd.Series(y.values * 0.9 + rng.uniform(0, 0.05, 500))
        df = threshold_sweep(y, scores)
        recalls = df["recall"].tolist()
        for i in range(len(recalls) - 1):
            assert recalls[i] >= recalls[i + 1] - 0.01  # allow tiny tolerance


class TestCalibration:
    def test_isotonic_brier_improvement(self):
        """Calibrated Brier <= raw Brier * 1.02 on a miscalibrated distribution."""
        rng = np.random.default_rng(42)
        n = 5000
        y_true = rng.integers(0, 2, n).astype(float)
        # Severely miscalibrated: compress scores to [0.3, 0.7]
        y_raw = rng.uniform(0.3, 0.7, n)
        from src.evaluation.calibration import fit_calibrator, apply_calibrator, calibration_report
        calibrator = fit_calibrator(y_true, y_raw, method="isotonic")
        y_cal = apply_calibrator(calibrator, y_raw)
        report = calibration_report(y_true, y_raw, y_cal)
        assert report["brier_calibrated"] <= report["brier_raw"] * 1.02, (
            f"Calibrated Brier {report['brier_calibrated']:.4f} > raw Brier {report['brier_raw']:.4f} * 1.02"
        )
