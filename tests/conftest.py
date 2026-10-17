import pandas as pd
import pytest

from autotrader.data import synthetic_prices


@pytest.fixture
def prices() -> pd.DataFrame:
    return synthetic_prices(900, seed=1)


def make_bars(opens, closes):
    idx = pd.date_range("2024-01-01", periods=len(opens), freq="1D", tz="UTC")
    o, c = pd.Series(opens, dtype=float), pd.Series(closes, dtype=float)
    return pd.DataFrame({"open": o.values, "close": c.values,
                         "high": pd.concat([o, c], axis=1).max(axis=1).values,
                         "low": pd.concat([o, c], axis=1).min(axis=1).values}, index=idx)
