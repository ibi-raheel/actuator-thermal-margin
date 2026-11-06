"""End-to-end pipeline: data -> LPTN fit -> learned models -> validation -> scenarios -> JSON.

Usage:  python -I -m pipeline.run_all <path/to/measures_v2.csv> [--refit]
(run from the repo root with PYTHONPATH=. so `-I` still finds the package)
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

from .data import (TARGETS, TARGET_LABELS, TEST_PROFILES, VAL_PROFILES, EWMA_SPANS,
                   load, add_ewma, feature_columns, split)
from .fit_lptn import fit as fit_lptn, profile_arrays
from .learned import fit_ridge, fit_lgbm, predict_lgbm, mse_per_target, max_abs_per_target
from .lptn import PARAM_NAMES, ALPHA_CU, simulate, steady_state
from . import scenarios as sc

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "results"
WEB = ROOT / "web" / "public" / "data"

# Published reference (Kirchgaessner, Wallscheid, Boecker, "Thermal neural networks", Eng. Appl.
# AI 117 (2023) 105537, Table III): MSE averaged over the four targets on the held-out set.
BENCHMARK = [
    {"model": "MLP (published)", "mse_K2": 5.58, "max_K": 14.29},
    {"model": "OLS on EWMA features (published)", "mse_K2": 4.47, "max_K": 9.85},
    {"model": "1D-CNN (published)", "mse_K2": 4.43, "max_K": 15.54},
    {"model": "LPTN, expert-designed (published)", "mse_K2": 3.64, "max_K": 7.37},
    {"model": "Thermal neural network (published)", "mse_K2": 2.87, "max_K": 6.02},
]


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def lptn_predict(theta, df_part, dt=0.5):
    preds = []
    energy = np.zeros(3)
    for pid, i_s, n, tc, ta, y in profile_arrays(df_part):
        T, e = simulate(theta, i_s, n, tc, ta, y[0].copy(), dt)
        preds.append(T)
        energy += e.sum(axis=0)
    return np.vstack(preds), energy


def find_plateau(df, pids, win_s=1200):
    """Longest-held constant operating point where the winding has stopped heating."""
    best = None
    w = int(win_s * 2)
    for pid in pids:
        g = df[df.profile_id == pid].reset_index(drop=True)
        i_s = g["i_s"].to_numpy(); n = g["motor_speed"].to_numpy(); tw = g["stator_winding"].to_numpy()
        for start in range(0, len(g) - w, 120):
            seg = slice(start, start + w)
            if i_s[seg].mean() < 40 or i_s[seg].std() > 3 or n[seg].std() > 30:
                continue
            tail = tw[start + w - 600:start + w]           # last 5 min
            slope = (tail[-1] - tail[0]) / 5.0              # K/min
            if abs(slope) > 0.1:
                continue
            score = i_s[seg].mean()
            if best is None or score > best[0]:
                best = (score, pid, start, start + w)
    return best


def main(csv_path: str, refit: bool = False):
    RES.mkdir(exist_ok=True); WEB.mkdir(parents=True, exist_ok=True)
    log("load")
    df = load(csv_path)
    tr, va, te = split(df)
    assert not set(df.loc[tr, "profile_id"]) & set(TEST_PROFILES)
    summary = {"dataset": {"rows": int(len(df)), "profiles": int(df.profile_id.nunique()),
                           "hours": round(len(df) / 2 / 3600, 1),
                           "train_profiles": int(df.loc[tr, "profile_id"].nunique()),
                           "val_profiles": list(VAL_PROFILES), "test_profiles": list(TEST_PROFILES)}}

    # ---------------------------------------------------------------- physics: LPTN
    pfile = RES / "lptn_params.json"
    if pfile.exists() and not refit:
        theta = np.array(json.loads(pfile.read_text())["theta"])
        fit_info = json.loads(pfile.read_text())["fit"]
    else:
        log("fit LPTN on train+val profiles")
        wf = RES / "lptn_warm.npy"  # optional warm start from an earlier fit
        warm = np.load(wf) if wf.exists() else None
        theta, fit_info = fit_lptn(df[tr | va], verbose=1, warm=warm)
        pfile.write_text(json.dumps({"names": PARAM_NAMES, "theta": theta.tolist(), "fit": fit_info}, indent=1))
    log(f"LPTN params {dict(zip(PARAM_NAMES, np.round(theta, 4)))}")

    df_te = df[te]
    Y_te = df_te[TARGETS].to_numpy()
    lp_pred, energy = lptn_predict(theta, df_te)

    # ---------------------------------------------------------------- learned models
    log("EWMA features")
    df = add_ewma(df)
    cols = feature_columns()
    X = df[cols].to_numpy(np.float32); Y = df[TARGETS].to_numpy()
    alphas = [1, 10, 100, 1000, 1e4, 1e5]
    val_scores = {}
    for a in alphas:
        m = fit_ridge(X[tr], Y[tr], a)
        val_scores[a] = float(mse_per_target(Y[va], m.predict(X[va])).mean())
    best_alpha = min(val_scores, key=val_scores.get)
    log(f"ridge val MSE by alpha {val_scores} -> {best_alpha}")
    ridge = fit_ridge(X[tr | va], Y[tr | va], best_alpha)
    ridge_pred = ridge.predict(X[te])

    log("LightGBM")
    sub = np.nonzero(tr | va)[0][::4]
    gbm = fit_lgbm(X[sub], Y[sub])
    gbm_pred = predict_lgbm(gbm, X[te])

    models = {"LPTN, 4-node (this repo)": lp_pred,
              "Ridge on EWMA features (this repo)": ridge_pred,
              "Gradient-boosted trees on EWMA features (this repo)": gbm_pred}
    table = []
    for name, P in models.items():
        mse = mse_per_target(Y_te, P); mx = max_abs_per_target(Y_te, P)
        table.append({"model": name, "mse_K2": round(float(mse.mean()), 2),
                      "max_K": round(float(mx.max()), 2),
                      "per_target": {t: {"mse_K2": round(float(mse[j]), 2), "max_K": round(float(mx[j]), 2)}
                                     for j, t in enumerate(TARGETS)}})
        log(f"{name}: MSE {mse.round(2)} avg {mse.mean():.2f}  max {mx.round(1)}")
    # simple average of the learned and physics models (a cheap ensemble, reported for honesty)
    ens = (lp_pred + ridge_pred + gbm_pred) / 3
    mse = mse_per_target(Y_te, ens); mx = max_abs_per_target(Y_te, ens)
    table.append({"model": "Average of the three (this repo)", "mse_K2": round(float(mse.mean()), 2),
                  "max_K": round(float(mx.max()), 2),
                  "per_target": {t: {"mse_K2": round(float(mse[j]), 2), "max_K": round(float(mx[j]), 2)}
                                 for j, t in enumerate(TARGETS)}})
    summary["models"] = table
    summary["benchmark_published"] = BENCHMARK
    summary["ridge_alpha"] = best_alpha
    summary["ridge_val_mse"] = val_scores
    summary["lptn_fit"] = fit_info

    # ---------------------------------------------------------------- validation
    val = {}
    val["energy_balance"] = {"loss_J": float(energy[0]), "stored_J": float(energy[1]),
                             "to_coolant_J": float(energy[2]),
                             "rel_residual": float(abs(energy[0] - energy[1] - energy[2]) / energy[0])}
    # first-order step response is covered by tests; plateau hand calculation here
    pl = find_plateau(df, TEST_PROFILES) or find_plateau(df, sorted(df.profile_id.unique()))
    if pl:
        _, pid, a, b = pl
        g = df[df.profile_id == pid].iloc[a:b]
        tail = g.iloc[-600:]
        i_s = float(tail["i_s"].mean()); n_k = float(tail["motor_speed"].mean()) / 1000
        t_sw = float(tail["stator_winding"].mean()); t_c = float(tail["coolant"].mean())
        R0 = theta[PARAM_NAMES.index("R0")]
        R = R0 * (1 + ALPHA_CU * (t_sw - 20))
        p_cu = 1.5 * R * i_s ** 2
        G = dict(zip(PARAM_NAMES, theta))
        r_series = 1 / G["G_sw_st"] + 1 / G["G_st_sy"] + 1 / G["G_sy_c"]
        a_ = abs(n_k)
        p_st = G["k_st1"] * a_ + G["k_st2"] * a_ ** 2 + G["k_st3"] * i_s ** 2 * a_
        p_sy = G["k_sy1"] * a_ + G["k_sy2"] * a_ ** 2
        # hand calc: copper loss through the series path + iron losses superposed on the lower legs
        dT_hand = p_cu * r_series + p_st * (1 / G["G_st_sy"] + 1 / G["G_sy_c"]) + p_sy / G["G_sy_c"]
        Tss = steady_state(theta, i_s, n_k, t_c)
        val["plateau_hand_calc"] = {
            "profile": int(pid), "window_s": [a / 2, b / 2], "i_s_A": round(i_s, 1),
            "speed_rpm": round(n_k * 1000, 0), "coolant_C": round(t_c, 2),
            "R_ohm": round(R, 5), "P_cu_W": round(p_cu, 1), "P_tooth_W": round(p_st, 1), "P_yoke_W": round(p_sy, 1),
            "R_series_K_per_W": round(r_series, 5),
            "measured_rise_K": round(t_sw - t_c, 2), "hand_calc_rise_K": round(dT_hand, 2),
            "network_steady_state_rise_K": round(float(Tss[1] - t_c), 2),
            "hand_vs_measured_K": round(dT_hand - (t_sw - t_c), 2),
            "in_test_set": int(pid) in TEST_PROFILES,
        }
    summary["validation"] = val
    log(f"validation {json.dumps(val, indent=1)}")

    # ---------------------------------------------------------------- scenarios
    log("duty cycles")
    duty = []
    for name in sc.DUTY_CYCLES:
        for tc in sc.COOLANT_GRID_C:
            for ip in range(50, 301, 25):   # bench data covers i_s up to ~300 A; no extrapolation
                duty.append(sc.margin_for(theta, name, float(ip), coolant_C=tc))
    (WEB / "duty_cycles.json").write_text(json.dumps({
        "limits": {"winding_C": sc.WINDING_LIMIT_C, "magnet_C": sc.MAGNET_LIMIT_C,
                   "coolant_grid_C": list(sc.COOLANT_GRID_C)}, "labels": sc.DUTY_CYCLES, "runs": duty}))
    safe = {}
    for name in sc.DUTY_CYCLES:
        for tc in sc.COOLANT_GRID_C:
            ok = [d["i_peak_A"] for d in duty if d["duty_cycle"] == name and d["coolant_C"] == tc
                  and d["winding_margin_K"] > 0 and d["magnet_margin_K"] > 0]
            safe[f"{name}@{tc:g}C"] = max(ok) if ok else None
    summary["duty_cycle_max_safe_peak_A"] = safe

    log("end-of-line study (synthetic units)")
    rng = np.random.default_rng(7)
    lengths = [10, 30, 60, 120, 300, 600]
    n_good, n_bad = 600, 200
    eol = {"synthetic": True, "i_test_A": 200.0, "speed_krpm": 0.0, "noise_K": 0.1,
           "n_good": n_good, "n_bad_per_defect": n_bad, "defects": sc.DEFECTS, "by_length": []}
    units_good = [sc.perturb(theta, rng) for _ in range(n_good)]
    units_bad = {d: [sc.perturb(theta, rng, d) for _ in range(n_bad)] for d in sc.DEFECTS}
    for L in lengths:
        sg = np.array([sc.eol_test(u, theta, L, 200.0, 0.0, rng) for u in units_good])
        row = {"test_s": L, "good_residual_K": {"mean": float(sg.mean()), "std": float(sg.std())},
               "defects": {}}
        for d, units in units_bad.items():
            sb = np.array([sc.eol_test(u, theta, L, 200.0, 0.0, rng) for u in units])
            fpr, tpr, auc, t1 = sc.roc(sg, sb)
            keep = np.linspace(0, len(fpr) - 1, 60).astype(int)
            row["defects"][d] = {"auc": round(auc, 4), "tpr_at_1pct_fpr": round(t1, 4),
                                 "residual_mean_K": round(float(sb.mean()), 3),
                                 "roc": {"fpr": fpr[keep].round(4).tolist(), "tpr": tpr[keep].round(4).tolist()},
                                 "hist_bad": np.round(sb, 3).tolist()[:200]}
        row["hist_good"] = np.round(sg, 3).tolist()[:300]
        eol["by_length"].append(row)
        log(f"EOL {L}s: " + ", ".join(f"{d} AUC {v['auc']} TPR@1% {v['tpr_at_1pct_fpr']}" for d, v in row['defects'].items()))
    (WEB / "eol.json").write_text(json.dumps(eol))
    summary["eol"] = {L["test_s"]: {d: {k: v[k] for k in ("auc", "tpr_at_1pct_fpr", "residual_mean_K")}
                                    for d, v in L["defects"].items()} for L in eol["by_length"]}

    # ---------------------------------------------------------------- held-out traces for the viewer
    prof = []
    off = 0
    for pid in TEST_PROFILES:
        g = df_te[df_te.profile_id == pid]
        m = len(g); s = slice(off, off + m); off += m
        step = 20  # 10 s
        prof.append({
            "profile": int(pid), "t_s": (np.arange(0, m, step) / 2).tolist(),
            "i_s_A": g["i_s"].to_numpy()[::step].round(1).tolist(),
            "speed_rpm": g["motor_speed"].to_numpy()[::step].round(0).tolist(),
            "torque_Nm": g["torque"].to_numpy()[::step].round(1).tolist(),
            "coolant_C": g["coolant"].to_numpy()[::step].round(2).tolist(),
            "measured": {t: Y_te[s, j][::step].round(2).tolist() for j, t in enumerate(TARGETS)},
            "lptn": {t: lp_pred[s, j][::step].round(2).tolist() for j, t in enumerate(TARGETS)},
            "ridge": {t: ridge_pred[s, j][::step].round(2).tolist() for j, t in enumerate(TARGETS)},
            "gbm": {t: gbm_pred[s, j][::step].round(2).tolist() for j, t in enumerate(TARGETS)},
        })
    (WEB / "profiles.json").write_text(json.dumps({"labels": TARGET_LABELS, "profiles": prof}))
    summary["ewma_spans"] = list(EWMA_SPANS)
    (WEB / "summary.json").write_text(json.dumps(summary, indent=1))
    (RES / "summary.json").write_text(json.dumps(summary, indent=1))
    log("done")


if __name__ == "__main__":
    main(sys.argv[1], refit="--refit" in sys.argv)
