"""Expanding walk-forward cross-validation splitter for time series."""
from __future__ import annotations
from typing import Iterator
import numpy as np
import pandas as pd


def walk_forward_splits(
    n: int,
    min_train_days: int = 1260,
    test_days: int = 63,
) -> Iterator[tuple[np.ndarray, np.ndarray]]:
    """Yields (train_idx, test_idx) pairs with expanding training windows.

    Guarantees: max(train_idx) < min(test_idx) for every fold.

    Args:
        n: total number of samples
        min_train_days: minimum training window size for first fold
        test_days: size of each test fold

    Yields:
        (train_idx, test_idx) — numpy arrays of integer indices
    """
    start = min_train_days
    while start + test_days <= n:
        train_idx = np.arange(0, start)
        test_idx = np.arange(start, start + test_days)
        yield train_idx, test_idx
        start += test_days


def n_folds(n: int, min_train_days: int = 1260, test_days: int = 63) -> int:
    """Count how many folds walk_forward_splits will produce."""
    return max(0, (n - min_train_days) // test_days)
