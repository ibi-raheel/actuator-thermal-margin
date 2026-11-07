"""Thermal check: a thin command-line wrapper over the fitted thermal network.

    python -m pipeline.thermal_check margin cycle.csv [--max-safe]
    python -m pipeline.thermal_check screen eol_logs.csv --test-s 30 [--good-col is_good]

`margin` takes a duty cycle in the bench log's columns (i_d, i_q, motor_speed, coolant, ambient;
2 Hz by default) and reports peak winding and magnet temperature, the margin to each limit, the
time to each limit and which limit binds. With --max-safe it also scales the current to find the
highest peak that keeps both margins >= 0, capped at the 300 A the bench data covers.

`screen` takes per-unit end-of-line logs (unit_id plus the same columns plus stator_winding), and
ranks units by residual = measured minus nominal-model winding temperature over the last 5 s.
The FAIL threshold is the 99th percentile of good-unit residuals (1 % false rejects): from units
labelled good in --good-col, or else from 600 simulated good units on the standard test
(200 A, standstill, 25 degC). No new model is fitted; everything reuses the existing pipeline.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from .data import add_derived
from .lptn import simulate
from . import scenarios as sc

ROOT = Path(__file__).resolve().parents[1]
PARAMS = ROOT / "results" / "lptn_params.json"
EOL_JSON = ROOT / "web" / "public" / "data" / "eol.json"
BENCH_MAX_A = 300.0  # current amplitude covered by the bench data; no extrapolation beyond it


def load_theta(path: Path = PARAMS) -> np.ndarray:
    return np.array(json.loads(Path(path).read_text())["theta"], dtype=float)


def _inputs(df: pd.DataFrame):
    # The thermal network uses current, speed and temperatures only; voltages are optional in the input.
    df = df.copy()
    for col in ("u_d", "u_q"):
        if col not in df.columns:
            df[col] = 0.0
    df = add_derived(df)
    return (df["i_s"].to_numpy(float), (df["motor_speed"] / 1000.0).to_numpy(float),
            df["coolant"].to_numpy(float), df["ambient"].to_numpy(float))


def _first_cross(series, limit, dt):
    idx = np.nonzero(series >= limit)[0]
    return float(idx[0] * dt) if len(idx) else None


def margin(df: pd.DataFrame, theta: np.ndarray, dt: float = 0.5, scale: float = 1.0) -> dict:
    i_s, n, tc, ta = _inputs(df)
    T, _ = simulate(theta, i_s * scale, n, tc, ta, np.full(4, tc[0]), dt)
    pk_sw, pk_pm = float(T[:, 1].max()), float(T[:, 0].max())
    m_sw, m_pm = sc.WINDING_LIMIT_C - pk_sw, sc.MAGNET_LIMIT_C - pk_pm
    return {
        "peak_current_A": round(float(i_s.max() * scale), 1),
        "peak_winding_C": round(pk_sw, 2), "peak_magnet_C": round(pk_pm, 2),
        "winding_margin_K": round(m_sw, 2), "magnet_margin_K": round(m_pm, 2),
        "t_winding_limit_s": _first_cross(T[:, 1], sc.WINDING_LIMIT_C, dt),
        "t_magnet_limit_s": _first_cross(T[:, 0], sc.MAGNET_LIMIT_C, dt),
        "binding_limit": "magnet" if m_pm < m_sw else "winding",
    }


def max_safe_current(df: pd.DataFrame, theta: np.ndarray, dt: float = 0.5, iters: int = 30) -> float | None:
    """Highest peak current amplitude (A) for this cycle's shape that keeps both margins >= 0."""
    i_s, *_ = _inputs(df)
    if i_s.max() <= 0:
        return None
    ok = lambda s: (r := margin(df, theta, dt, s))["winding_margin_K"] >= 0 and r["magnet_margin_K"] >= 0
    lo, hi = 0.0, BENCH_MAX_A / i_s.max()
    if ok(hi):
        return round(BENCH_MAX_A, 1)
    for _ in range(iters):
        mid = 0.5 * (lo + hi)
        lo, hi = (mid, hi) if ok(mid) else (lo, mid)
    return round(float(lo * i_s.max()), 1) if lo > 0 else None


def unit_residual(df: pd.DataFrame, theta: np.ndarray, dt: float = 0.5) -> float:
    i_s, n, tc, ta = _inputs(df)
    T_pred, _ = simulate(theta, i_s, n, tc, ta, np.full(4, tc[0]), dt)
    tail = max(1, int(5 / dt))
    return float(df["stator_winding"].to_numpy(float)[-tail:].mean() - T_pred[-tail:, 1].mean())


def simulated_threshold(theta: np.ndarray, test_s: float, n_units: int = 600, seed: int = 7) -> float:
    rng = np.random.default_rng(seed)
    good = [sc.eol_test(sc.perturb(theta, rng), theta, test_s, 200.0, 0.0, rng) for _ in range(n_units)]
    return float(np.percentile(good, 99))


def visible_defects(test_s: float, path: Path = EOL_JSON) -> tuple[int, list[str]]:
    rows = json.loads(Path(path).read_text())["by_length"]
    row = min(rows, key=lambda r: abs(r["test_s"] - test_s))
    return row["test_s"], [d for d, v in row["defects"].items() if v["auc"] >= 0.9]


def screen(df: pd.DataFrame, theta: np.ndarray, test_s: float, good_col: str | None = None,
           dt: float = 0.5) -> tuple[pd.DataFrame, float]:
    res = {u: unit_residual(g, theta, dt) for u, g in df.groupby("unit_id", sort=False)}
    out = pd.DataFrame({"unit_id": list(res), "residual_K": list(res.values())})
    if good_col:
        good_ids = df.loc[df[good_col].astype(bool), "unit_id"].unique()
        thr = float(np.percentile(out.loc[out.unit_id.isin(good_ids), "residual_K"], 99))
    else:
        thr = simulated_threshold(theta, test_s)
    out["verdict"] = np.where(out["residual_K"] > thr, "FAIL-investigate", "PASS")
    out = out.sort_values("residual_K", ascending=False).reset_index(drop=True)
    out["residual_K"] = out["residual_K"].round(3)
    return out, thr


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="thermal_check", description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    pm = sub.add_parser("margin", help="margin, binding limit and safe current for a duty cycle")
    pm.add_argument("csv"); pm.add_argument("--max-safe", action="store_true")
    pm.add_argument("--dt", type=float, default=0.5, help="sample period in s (bench log: 0.5)")
    ps = sub.add_parser("screen", help="rank end-of-line units by thermal residual")
    ps.add_argument("csv"); ps.add_argument("--test-s", type=float, required=True)
    ps.add_argument("--good-col", default=None, help="column marking known-good units (1/0)")
    ps.add_argument("--dt", type=float, default=0.5)
    a = p.parse_args(argv)
    theta = load_theta()
    df = pd.read_csv(a.csv)

    if a.cmd == "margin":
        r = margin(df, theta, a.dt)
        if a.max_safe:
            r["max_safe_peak_current_A"] = max_safe_current(df, theta, a.dt)
        r["limits_C"] = {"winding": sc.WINDING_LIMIT_C, "magnet": sc.MAGNET_LIMIT_C}
        print(json.dumps(r, indent=2))
    else:
        out, thr = screen(df, theta, a.test_s, a.good_col, a.dt)
        out.to_csv(sys.stdout, index=False)
        L, seen = visible_defects(a.test_s)
        print(f"# threshold {thr:.3f} K (99th percentile of good units, "
              f"{'labelled' if a.good_col else 'simulated'})", file=sys.stderr)
        print(f"# a {L:g} s test can see (simulated AUC >= 0.9): {', '.join(seen) or 'none'}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
