import pytest

from autotrader.risk import RiskLimits, RiskManager


def mgr(**kw):
    return RiskManager(RiskLimits(**kw))


def test_invalid_limits_rejected():
    with pytest.raises(ValueError):
        RiskLimits(max_position_frac=0)
    with pytest.raises(ValueError):
        RiskLimits(max_drawdown_frac=1.5)


def test_position_cap():
    m = mgr(max_position_frac=0.25)
    m.update(day=1, equity=100, price=10, position_frac=0)
    assert m.allow(1.0, price=10, in_position=False) == 0.25
    assert m.allow(0.1, price=10, in_position=False) == 0.1


def test_stop_loss_exits_and_blocks_reentry_until_flat_signal():
    m = mgr(stop_loss_frac=0.1)
    m.update(day=1, equity=100, price=100, position_frac=0.2)  # entry recorded at 100
    assert m.allow(1.0, price=95, in_position=True) > 0
    assert m.allow(1.0, price=89, in_position=True) == 0.0  # stop hit
    m.update(day=1, equity=100, price=95, position_frac=0.0)
    assert m.allow(1.0, price=95, in_position=False) == 0.0  # still wants long: blocked
    assert m.allow(0.0, price=95, in_position=False) == 0.0  # strategy goes flat: unblock
    assert m.allow(1.0, price=95, in_position=False) > 0


def test_daily_loss_halts_until_next_day():
    m = mgr(daily_loss_limit_frac=0.03)
    m.update(day=1, equity=100, price=10, position_frac=0.2)
    m.update(day=1, equity=96, price=10, position_frac=0.2)
    assert m.allow(1.0, price=10, in_position=True) == 0.0
    m.update(day=2, equity=96, price=10, position_frac=0.0)
    assert m.allow(1.0, price=10, in_position=False) > 0


def test_drawdown_halt_persists_until_owner_reset():
    m = mgr(max_drawdown_frac=0.15, daily_loss_limit_frac=1.0)
    m.update(day=1, equity=100, price=10, position_frac=0.2)
    m.update(day=2, equity=84, price=10, position_frac=0.2)
    assert m.halted_until_reset and "drawdown" in m.halt_reason
    m.update(day=3, equity=90, price=10, position_frac=0.0)  # recovery does not unhalt
    assert m.allow(1.0, price=10, in_position=False) == 0.0
    m.reset_halt()
    m.update(day=4, equity=90, price=10, position_frac=0.0)
    assert m.allow(1.0, price=10, in_position=False) > 0
