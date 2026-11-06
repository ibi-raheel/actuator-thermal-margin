"""Four-node lumped-parameter thermal network (LPTN) of a PMSM.

Nodes: 0 magnet (rotor), 1 winding, 2 stator tooth, 3 stator yoke.
Boundaries: coolant (water jacket, touches the yoke and the end winding) and ambient.

    C_i dT_i/dt = P_i(i_s, n, T) - sum_j G_ij (T_i - T_j) - sum_b G_ib (T_i - T_b)

Integrated with backward Euler (unconditionally stable); losses use the previous
temperature, so each step is one 4x4 linear solve.
"""
from __future__ import annotations

import numpy as np
from numba import njit

ALPHA_CU = 0.00393  # 1/K, copper resistance temperature coefficient

PARAM_NAMES = [
    "C_pm", "C_sw", "C_st", "C_sy",            # J/K
    "G_sy_c", "G_st_sy", "G_sw_st", "G_sw_c",  # W/K
    "G_pm_st0", "G_pm_st1",                    # W/K, airgap: G0 + G1 * n[krpm]
    "G_pm_c",                                  # W/K, rotor -> housing through shaft/bearings
    "R0",                                      # Ohm, phase resistance at 20 degC
    "k_st1", "k_st2", "k_sy1", "k_sy2",        # W/krpm, W/krpm^2 iron losses (tooth, yoke)
    "k_pm1", "k_pm2",                          # W/krpm^2, W/(A^2 krpm) rotor losses
    "k_st3",                                   # W/(A^2 krpm) current-driven tooth eddy losses
    "G_pm_c1",                                 # W/(K krpm), speed-dependent rotor/shaft convection
]

# Temperatures are invariant to scaling every C, G and loss coefficient by the same factor,
# so the watt scale is not identifiable from temperatures alone. R0 is pinned to an assumed
# phase resistance to remove that flat direction; it sets the watt scale only.
R0_PINNED = 0.015

# Initial guess, physically plausible for a ~50 kW water-cooled PMSM.
THETA0 = np.array([
    2.0e3, 3.0e3, 4.0e3, 8.0e3,
    60.0, 80.0, 20.0, 5.0,
    2.0, 1.0,
    1.0,
    0.015,
    10.0, 5.0, 10.0, 5.0,
    2.0, 1e-4,
    1e-4,
    1.0,
])


@njit(cache=True)
def losses(theta, i_s, n_krpm, t_sw):
    r = theta[11] * (1.0 + ALPHA_CU * (t_sw - 20.0))
    p_cu = 1.5 * r * i_s * i_s
    a = abs(n_krpm)
    p_st = theta[12] * a + theta[13] * a * a + theta[18] * i_s * i_s * a
    p_sy = theta[14] * a + theta[15] * a * a
    p_pm = theta[16] * a * a + theta[17] * i_s * i_s * a
    return p_pm, p_cu, p_st, p_sy


@njit(cache=True)
def simulate(theta, i_s, n_krpm, t_cool, t_amb, t0, dt):
    """Return T[k, 4] and per-step energy bookkeeping [k, 3] = (loss, stored, to_boundary) in J."""
    m = i_s.shape[0]
    out = np.empty((m, 4))
    energy = np.zeros((m, 3))
    C = theta[0:4]
    T = t0.copy()
    out[0] = T
    for k in range(1, m):
        p_pm, p_cu, p_st, p_sy = losses(theta, i_s[k], n_krpm[k], T[1])
        P = np.array([p_pm, p_cu, p_st, p_sy])
        g_air = theta[8] + theta[9] * abs(n_krpm[k])
        A = np.zeros((4, 4))
        # couplings between nodes
        pairs = ((0, 2, g_air), (1, 2, theta[6]), (2, 3, theta[5]))
        for (i, j, g) in pairs:
            A[i, i] += g
            A[j, j] += g
            A[i, j] -= g
            A[j, i] -= g
        # boundaries: yoke->coolant, end winding->coolant, rotor->coolant(housing)
        gb = np.array([theta[10] + theta[19] * abs(n_krpm[k]), theta[7], 0.0, theta[4]])
        rhs = C / dt * T + P + gb * t_cool[k]
        for i in range(4):
            A[i, i] += C[i] / dt + gb[i]
        Tn = np.linalg.solve(A, rhs)
        energy[k, 0] = P.sum() * dt
        energy[k, 1] = (C * (Tn - T)).sum()
        energy[k, 2] = (gb * (Tn - t_cool[k])).sum() * dt
        T = Tn
        out[k] = T
    return out, energy


def steady_state(theta, i_s, n_krpm, t_cool, iters=50):
    """Fixed-point solve of the steady-state network (R depends on winding temperature)."""
    T = np.full(4, t_cool, dtype=float)
    for _ in range(iters):
        P = np.array(losses(theta, i_s, n_krpm, T[1]))
        g_air = theta[8] + theta[9] * abs(n_krpm)
        A = np.zeros((4, 4))
        for (i, j, g) in ((0, 2, g_air), (1, 2, theta[6]), (2, 3, theta[5])):
            A[i, i] += g; A[j, j] += g; A[i, j] -= g; A[j, i] -= g
        gb = np.array([theta[10] + theta[19] * abs(n_krpm), theta[7], 0.0, theta[4]])
        A += np.diag(gb)
        T = np.linalg.solve(A, P + gb * t_cool)
    return T


def downsample(arr: np.ndarray, factor: int) -> np.ndarray:
    m = (len(arr) // factor) * factor
    return arr[:m].reshape(-1, factor, *arr.shape[1:]).mean(axis=1)
