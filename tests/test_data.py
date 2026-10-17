import pandas as pd
import pytest

from autotrader.data import load_csv, synthetic_prices, validate_ohlc


def test_synthetic_is_valid_and_reproducible():
    a, b = synthetic_prices(100, seed=3), synthetic_prices(100, seed=3)
    pd.testing.assert_frame_equal(a, b)
    validate_ohlc(a)


def test_rejects_nan_and_bad_high_low(prices):
    bad = prices.copy()
    bad.iloc[5, bad.columns.get_loc("close")] = float("nan")
    with pytest.raises(ValueError, match="NaN"):
        validate_ohlc(bad)
    bad = prices.copy()
    bad.iloc[5, bad.columns.get_loc("high")] = bad["low"].iloc[5] * 0.5
    with pytest.raises(ValueError, match="inconsistent"):
        validate_ohlc(bad)


def test_rejects_duplicate_or_unsorted_index(prices):
    dup = pd.concat([prices.iloc[:3], prices.iloc[:3]])
    with pytest.raises(ValueError, match="strictly increasing"):
        validate_ohlc(dup)


def test_load_csv_roundtrip(tmp_path, prices):
    path = tmp_path / "p.csv"
    prices.rename_axis("timestamp").reset_index().to_csv(path, index=False)
    loaded = load_csv(path)
    assert len(loaded) == len(prices)
    assert loaded.index.is_monotonic_increasing
