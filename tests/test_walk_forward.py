"""Tests for walk-forward time-series splitter."""
import numpy as np
import pytest
from src.evaluation.walk_forward import walk_forward_splits, n_folds


class TestWalkForward:
    def test_no_temporal_leakage(self):
        """Every fold must have max(train) < min(test)."""
        for tr, te in walk_forward_splits(2000, min_train_days=500, test_days=100):
            assert tr.max() < te.min()

    def test_expanding_train(self):
        """Each subsequent fold has a larger training set."""
        folds = list(walk_forward_splits(2000, min_train_days=500, test_days=100))
        train_sizes = [len(tr) for tr, te in folds]
        assert train_sizes == sorted(train_sizes), "Training sets should grow monotonically"

    def test_correct_fold_count(self):
        """Number of folds matches n_folds() helper."""
        n, min_tr, test_d = 2000, 500, 100
        folds = list(walk_forward_splits(n, min_tr, test_d))
        assert len(folds) == n_folds(n, min_tr, test_d)

    def test_no_folds_when_too_short(self):
        """Returns zero folds when n < min_train_days + test_days."""
        folds = list(walk_forward_splits(100, min_train_days=500, test_days=100))
        assert len(folds) == 0

    def test_test_size_exact(self):
        """Each test fold has exactly test_days rows."""
        for _, te in walk_forward_splits(2000, min_train_days=500, test_days=63):
            assert len(te) == 63
