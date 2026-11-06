import numpy as np
import pandas as pd
import pytest

from pipeline.data import add_derived, add_ewma, feature_columns, split, TEST_PROFILES, VAL_PROFILES
from pipeline.lptn import THETA0, PARAM_NAMES, ALPHA_CU, simulate, steady_state, losses, downsample
from pipeline import scenarios as sc


def toy_frame(n=50, pids=(1, 60)):
    rows = []
    for pid in pids:
        for k in range(n):
            rows.append(dict(u_d=-3.0, u_q=4.0, i_d=-6.0, i_q=8.0, motor_speed=1000.0, coolant=20.0,
                             ambient=25.0, torque=1.0, pm=30.0, stator_winding=40.0, stator_tooth=35.0,
                             stator_yoke=30.0, profile_id=pid))
    return pd.DataFrame(rows)


def test_derived_magnitudes_and_power():
    df = add_derived(toy_frame(3))
    assert np.allclose(df["i_s"], 10.0)
    assert np.allclose(df["u_s"], 5.0)
    assert np.allclose(df["p_el"], 1.5 * (18.0 + 32.0))


def test_ewma_is_causal_and_per_profile():
    df = add_derived(toy_frame(20))
    df.loc[df.profile_id == 60, "i_q"] = 100.0
    df = add_derived(df)
    out = add_ewma(df)
    # constant input -> EWMA equals the input; no leakage from profile 60 into profile 1
    p1 = out[out.profile_id == 1]
    assert np.allclose(p1["i_s_ewma1320"], p1["i_s"])
    assert set(feature_columns()).issubset(out.columns)


def test_split_has_no_test_profile_in_training():
    df = pd.DataFrame({"profile_id": list(range(1, 82))})
    tr, va, te = split(df)
    assert set(df.profile_id[te]) == set(TEST_PROFILES)
    assert set(df.profile_id[va]) == set(VAL_PROFILES)
    assert not (tr & te).any() and not (tr & va).any()


def single_node_theta(C, G):
    """Make the network reduce to one heated node (winding) tied to coolant by G."""
    th = THETA0.copy()
    th[:] = 1e-9
    th[0:4] = [1.0, C, 1.0, 1.0]
    th[PARAM_NAMES.index("G_sw_c")] = G
    th[PARAM_NAMES.index("R0")] = 1e-9
    return th


def test_step_response_matches_first_order_solution():
    """Constant heat input into one RC node: T(t) = Tc + P/G (1 - exp(-t G / C))."""
    C, G, P = 500.0, 2.0, 100.0
    th = single_node_theta(C, G)
    # inject P through copper loss: 1.5 R i^2 = P with R ~ R0 (alpha effect removed by tiny R0)
    th[PARAM_NAMES.index("R0")] = 1.0
    i = np.sqrt(P / 1.5)
    # cancel temperature dependence by using alpha via a constant-temperature trick: hold T_sw near 20
    dt, m = 0.05, 20000
    tc = np.full(m, 20.0)
    T, _ = simulate(th, np.full(m, i), np.zeros(m), tc, tc, np.full(4, 20.0), dt)
    t = np.arange(m) * dt
    # analytic with temperature-dependent R: dT/dt = (P(1+a(T-20)) - G(T-20))/C  -> rate G' = G - aP
    g_eff = G - ALPHA_CU * P
    analytic = 20.0 + P / g_eff * (1 - np.exp(-t * g_eff / C))
    assert np.max(np.abs(T[:, 1] - analytic)) < 0.05


def test_energy_balance_closes():
    rng = np.random.default_rng(0)
    m = 2000
    i = np.abs(rng.normal(100, 30, m)); n = np.abs(rng.normal(3, 1, m))
    tc = np.full(m, 30.0)
    T, e = simulate(THETA0, i, n, tc, tc, np.full(4, 30.0), 0.5)
    loss, stored, out = e.sum(axis=0)
    assert abs(loss - stored - out) / loss < 1e-9


def test_steady_state_matches_long_simulation():
    m = 40000
    i = np.full(m, 120.0); n = np.full(m, 2.0); tc = np.full(m, 40.0)
    T, _ = simulate(THETA0, i, n, tc, tc, np.full(4, 40.0), 5.0)
    Tss = steady_state(THETA0, 120.0, 2.0, 40.0)
    assert np.allclose(T[-1], Tss, atol=0.05)


def test_copper_loss_temperature_correction():
    p = losses(THETA0, 100.0, 0.0, 120.0)
    R0 = THETA0[PARAM_NAMES.index("R0")]
    assert p[1] == pytest.approx(1.5 * R0 * (1 + ALPHA_CU * 100.0) * 100.0 ** 2)


def test_downsample_rms_keeps_copper_energy():
    i = np.array([0.0, 10.0, 0.0, 10.0])
    rms = np.sqrt(downsample(i ** 2, 2))
    assert np.allclose(rms ** 2 * 2, [100.0, 100.0])


def test_roc_perfect_and_random():
    _, _, auc, t1 = sc.roc(np.zeros(100), np.ones(100))
    assert auc == pytest.approx(1.0) and t1 == pytest.approx(1.0)
    rng = np.random.default_rng(1)
    _, _, auc, _ = sc.roc(rng.normal(size=4000), rng.normal(size=4000))
    assert abs(auc - 0.5) < 0.03


def test_defect_raises_eol_residual():
    rng = np.random.default_rng(3)
    bad = THETA0.copy(); bad[PARAM_NAMES.index("R0")] *= 1.08
    r_good = sc.eol_test(THETA0, THETA0, 60, 200.0, 0.0, rng, noise_K=0.0)
    r_bad = sc.eol_test(bad, THETA0, 60, 200.0, 0.0, rng, noise_K=0.0)
    assert abs(r_good) < 1e-9 and r_bad > 0


def test_duty_cycle_margin_monotone_in_current():
    a = sc.margin_for(THETA0, "continuous_carry", 50.0, 600)
    b = sc.margin_for(THETA0, "continuous_carry", 150.0, 600)
    assert b["peak_winding_C"] > a["peak_winding_C"]


def test_profile_arrays_follow_row_order_after_sort(tmp_path):
    """Predictions are stacked per profile; the frame must already be grouped the same way."""
    from pipeline.data import load
    from pipeline.fit_lptn import profile_arrays
    df = toy_frame(5, pids=(60, 2, 60))  # profile 60 split around 2, as in an unsorted file
    df.loc[df.profile_id == 2, "stator_winding"] = 99.0
    p = tmp_path / "m.csv"; df.to_csv(p, index=False)
    loaded = load(str(p))
    stacked = np.concatenate([y[:, 1] for _, _, _, _, _, y in profile_arrays(loaded)])
    assert np.allclose(stacked, loaded["stator_winding"].to_numpy())
