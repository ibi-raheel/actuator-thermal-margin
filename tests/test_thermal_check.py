"""Checks for the thermal_check CLI against the shipped, precomputed results."""
import json
from pathlib import Path

import numpy as np
import pandas as pd

from pipeline import scenarios as sc
from pipeline import thermal_check as tc
from pipeline.lptn import simulate

ROOT = Path(__file__).resolve().parents[1]


def cycle_frame(i_s, n_krpm, coolant_C):
    """A duty cycle written in the bench log's columns (current on the q axis)."""
    return pd.DataFrame({"u_d": 0.0, "u_q": 0.0, "i_d": 0.0, "i_q": i_s, "motor_speed": n_krpm * 1000.0,
                         "coolant": coolant_C, "ambient": sc.AMBIENT_C})


def test_margin_reproduces_shipped_walking_gait_result(tmp_path):
    # Shipped result: walking gait, 200 A peak, 90 degC coolant -> magnet crosses its limit at 747 s.
    runs = json.loads((ROOT / "web/public/data/duty_cycles.json").read_text())["runs"]
    ref = next(r for r in runs if r["duty_cycle"] == "walking_gait" and r["i_peak_A"] == 200.0
               and r["coolant_C"] == 90.0)
    _, i, n = sc.duty_cycle("walking_gait", 200.0, 3600)
    csv = tmp_path / "cycle.csv"
    cycle_frame(i, n, 90.0).to_csv(csv, index=False)

    r = tc.margin(pd.read_csv(csv), tc.load_theta(), dt=1.0)
    assert r["t_magnet_limit_s"] == ref["t_magnet_limit_s"] == 747.0
    assert r["t_winding_limit_s"] is None
    assert r["binding_limit"] == "magnet"
    assert abs(r["magnet_margin_K"] - ref["magnet_margin_K"]) < 0.01
    # the shipped grid says 100 A is safe and 125 A is not at 90 degC; RMS-equivalent i_s = peak / sqrt(2)
    safe = tc.max_safe_current(pd.read_csv(csv), tc.load_theta(), dt=1.0)
    assert 100 / np.sqrt(2) <= safe < 125 / np.sqrt(2)


def test_screen_flags_resistance_defect_at_30s():
    theta = tc.load_theta()
    rng = np.random.default_rng(0)
    dt, test_s = 0.5, 30
    m = int(test_s / dt) + 1
    i = np.full(m, 200.0); n = np.zeros(m); t25 = np.full(m, 25.0)
    bad = theta.copy(); bad[sc.IDX["R0"]] *= 1.08
    frames = []
    for uid, th in (("nominal", theta), ("r_plus_8pct", bad)):
        T, _ = simulate(th, i, n, t25, t25, np.full(4, 25.0), dt)
        f = cycle_frame(i, n, 25.0)
        f["stator_winding"] = T[:, 1] + rng.normal(0, 0.1, m)
        f["unit_id"] = uid
        frames.append(f)
    out, thr = tc.screen(pd.concat(frames, ignore_index=True), theta, test_s)
    verdict = dict(zip(out.unit_id, out.verdict))
    assert verdict == {"r_plus_8pct": "FAIL-investigate", "nominal": "PASS"}
    assert out.unit_id.iloc[0] == "r_plus_8pct"
    L, seen = tc.visible_defects(test_s)
    assert L == 30 and seen == ["winding_resistance_+8pct"]
