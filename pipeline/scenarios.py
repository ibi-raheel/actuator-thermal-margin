"""Duty-cycle margin and end-of-line screening, both driven by the fitted LPTN.

The duty cycles are built from the operating envelope seen on the bench (current
amplitude, speed). The unit-to-unit variation in the end-of-line study is SYNTHETIC:
no public dataset has per-unit actuator defects, so it perturbs the fitted network.
"""
from __future__ import annotations

import numpy as np

from .lptn import simulate

WINDING_LIMIT_C = 130.0   # insulation class B hot-spot proxy (assumption)
MAGNET_LIMIT_C = 100.0    # assumed demagnetisation-safe magnet limit (grade dependent)
COOLANT_C = 40.0
AMBIENT_C = 25.0


def duty_cycle(name: str, i_peak: float, duration_s: int, dt: float = 1.0):
    """Return (i_s, n_krpm) at 1 s resolution. i_s is the RMS-equivalent amplitude per second."""
    t = np.arange(0, duration_s, dt)
    if name == "lift_and_hold":
        # 20 s lift at peak current and 1.5 krpm, 40 s hold at 60 % current near stall, 30 s rest
        ph = t % 90
        i = np.where(ph < 20, i_peak, np.where(ph < 60, 0.6 * i_peak, 0.05 * i_peak))
        n = np.where(ph < 20, 1.5, np.where(ph < 60, 0.05, 0.0))
    elif name == "walking_gait":
        # 1 Hz sinusoidal torque demand: RMS of |sin| profile = peak / sqrt(2); speed 2.5 krpm average
        i = np.full_like(t, i_peak / np.sqrt(2.0))
        n = np.full_like(t, 2.5)
    elif name == "continuous_carry":
        i = np.full_like(t, 0.8 * i_peak)
        n = np.full_like(t, 0.5)
    else:
        raise ValueError(name)
    return t, i.astype(float), n.astype(float)


DUTY_CYCLES = {
    "lift_and_hold": "Lift and hold (20 s lift, 40 s hold, 30 s rest)",
    "walking_gait": "Walking gait (1 Hz torque cycle, RMS-equivalent)",
    "continuous_carry": "Continuous carry (80 % current, slow speed)",
}


def margin_for(theta, name, i_peak, duration_s=3600):
    t, i, n = duty_cycle(name, i_peak, duration_s)
    tc = np.full_like(t, COOLANT_C, dtype=float)
    ta = np.full_like(t, AMBIENT_C, dtype=float)
    T, _ = simulate(theta, i, n, tc, ta, np.full(4, COOLANT_C), 1.0)
    pk_sw, pk_pm = T[:, 1].max(), T[:, 0].max()

    def first_cross(series, limit):
        idx = np.nonzero(series >= limit)[0]
        return float(t[idx[0]]) if len(idx) else None

    return {
        "duty_cycle": name, "i_peak_A": float(i_peak),
        "peak_winding_C": float(pk_sw), "peak_magnet_C": float(pk_pm),
        "winding_margin_K": float(WINDING_LIMIT_C - pk_sw),
        "magnet_margin_K": float(MAGNET_LIMIT_C - pk_pm),
        "t_winding_limit_s": first_cross(T[:, 1], WINDING_LIMIT_C),
        "t_magnet_limit_s": first_cross(T[:, 0], MAGNET_LIMIT_C),
        "trace": {"t_s": t[::30].tolist(), "winding_C": T[::30, 1].round(2).tolist(),
                  "magnet_C": T[::30, 0].round(2).tolist()},
    }


# ---------------------------------------------------------------- end-of-line (synthetic units)
IDX = {"C": [0, 1, 2, 3], "G": [4, 5, 6, 8, 10], "R0": 11, "G_sy_c": 4, "G_sw_st": 6}
DEFECTS = {
    "winding_resistance_+8pct": "Winding resistance +8 % (e.g. undersized wire, poor crimp)",
    "yoke_interface_-30pct": "Stator-to-housing conductance -30 % (e.g. void in thermal interface)",
    "slot_potting_-30pct": "Winding-to-tooth conductance -30 % (e.g. incomplete slot impregnation)",
}


def perturb(theta, rng, defect=None):
    th = theta.copy()
    th[IDX["R0"]] *= 1 + rng.normal(0, 0.015)            # 1.5 % sigma resistance spread
    th[IDX["G"]] *= 1 + rng.normal(0, 0.05, len(IDX["G"]))  # 5 % sigma conductance spread
    th[IDX["C"]] *= 1 + rng.normal(0, 0.03, 4)            # 3 % sigma capacitance spread
    if defect == "winding_resistance_+8pct":
        th[IDX["R0"]] *= 1.08
    elif defect == "yoke_interface_-30pct":
        th[IDX["G_sy_c"]] *= 0.70
    elif defect == "slot_potting_-30pct":
        th[IDX["G_sw_st"]] *= 0.70
    return th


def eol_test(theta_unit, theta_nom, test_s, i_test, n_test, rng, noise_K=0.1, dt=0.5):
    """Residual of measured minus nominal-model winding temperature at the end of the test."""
    m = int(test_s / dt) + 1
    i = np.full(m, i_test); n = np.full(m, n_test)
    tc = np.full(m, 25.0); ta = np.full(m, 25.0); t0 = np.full(4, 25.0)
    T_meas, _ = simulate(theta_unit, i, n, tc, ta, t0, dt)
    T_pred, _ = simulate(theta_nom, i, n, tc, ta, t0, dt)
    tail = max(1, int(5 / dt))
    meas = T_meas[-tail:, 1] + rng.normal(0, noise_K, tail)
    return float(meas.mean() - T_pred[-tail:, 1].mean())


def roc(scores_good, scores_bad):
    s = np.concatenate([scores_good, scores_bad])
    y = np.concatenate([np.zeros(len(scores_good)), np.ones(len(scores_bad))])
    order = np.argsort(-s)
    y = y[order]
    tpr = np.concatenate([[0], np.cumsum(y) / y.sum()])
    fpr = np.concatenate([[0], np.cumsum(1 - y) / (1 - y).sum()])
    auc = float(np.trapezoid(tpr, fpr))
    tpr_at_1 = float(np.interp(0.01, fpr, tpr))
    return fpr, tpr, auc, tpr_at_1
