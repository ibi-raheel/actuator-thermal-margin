"""Fit the LPTN parameters on training profiles (10 s resolution) with scipy least squares."""
from __future__ import annotations

import numpy as np
from scipy.optimize import least_squares

from .data import TARGETS
from .lptn import THETA0, PARAM_NAMES, R0_PINNED, simulate, downsample

FIT_FACTOR = 20  # 2 Hz -> 0.1 Hz for fitting


def profile_arrays(df, factor=1):
    """Yield per-profile arrays (i_s, n_krpm, coolant, ambient, targets) at the given decimation."""
    for pid, g in df.groupby("profile_id", sort=True):
        i_s = g["i_s"].to_numpy()
        n = g["motor_speed"].to_numpy() / 1000.0
        tc = g["coolant"].to_numpy()
        ta = g["ambient"].to_numpy()
        y = g[TARGETS].to_numpy()
        if factor > 1:
            # copper losses scale with i^2, so decimate i_s as an RMS value
            i_s = np.sqrt(downsample(i_s ** 2, factor))
            n, tc, ta, y = (downsample(a, factor) for a in (n, tc, ta, y))
        yield pid, i_s, n, tc, ta, y


def predict_profiles(theta, profiles, dt):
    out = {}
    for pid, i_s, n, tc, ta, y in profiles:
        T, _ = simulate(theta, i_s, n, tc, ta, y[0].copy(), dt)
        out[pid] = (T, y)
    return out


def fit(df_train, max_nfev=150, verbose=0, warm=None):
    profiles = list(profile_arrays(df_train, FIT_FACTOR))
    dt = FIT_FACTOR / 2.0

    i_r0 = PARAM_NAMES.index("R0")
    free = np.array([i != i_r0 for i in range(len(PARAM_NAMES))])
    base = THETA0.copy()
    base[i_r0] = R0_PINNED

    def full(logfree):
        th = base.copy()
        th[free] = np.exp(logfree)
        return th

    def resid(logfree):
        theta = full(logfree)
        res = []
        for pid, i_s, n, tc, ta, y in profiles:
            T, _ = simulate(theta, i_s, n, tc, ta, y[0].copy(), dt)
            res.append((T - y).ravel())
        return np.concatenate(res)

    x0 = np.log(THETA0)[free]
    start = np.log(warm)[free] if warm is not None else x0
    sol = least_squares(resid, np.clip(start, x0 - 5.9, x0 + 5.9), method="trf", x_scale=1.0, max_nfev=max_nfev,
                        ftol=1e-10, xtol=1e-10,
                        bounds=(x0 - 6, x0 + 6), verbose=verbose)
    theta = full(sol.x)
    r = sol.fun.reshape(-1, 4)
    return theta, {"train_mse_K2": float((r ** 2).mean()), "nfev": int(sol.nfev),
                   "params": dict(zip(PARAM_NAMES, map(float, theta)))}
