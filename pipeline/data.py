"""Load the Paderborn PMSM test-bench data, derive physical features, split by profile."""
from __future__ import annotations

import numpy as np
import pandas as pd

TARGETS = ["pm", "stator_winding", "stator_tooth", "stator_yoke"]
TARGET_LABELS = {
    "pm": "Magnet (rotor)",
    "stator_winding": "Winding",
    "stator_tooth": "Stator tooth",
    "stator_yoke": "Stator yoke",
}
TEST_PROFILES = (60, 62, 74)  # standard held-out set for this dataset
VAL_PROFILES = (4, 58)        # used only to pick hyper-parameters
FS_HZ = 2.0                   # sampling rate of the bench log
EWMA_SPANS = (1320, 3360, 6360, 9480)  # samples; spans used in the published linear benchmark

BASE_INPUTS = ["u_d", "u_q", "i_d", "i_q", "motor_speed", "coolant", "ambient"]


def load(path: str) -> pd.DataFrame:
    df = pd.read_csv(path)
    df["profile_id"] = df["profile_id"].astype(int)
    return add_derived(df)


def add_derived(df: pd.DataFrame) -> pd.DataFrame:
    """Space-vector magnitudes and electrical power (amplitude-invariant dq frame)."""
    df = df.copy()
    df["i_s"] = np.sqrt(df["i_d"] ** 2 + df["i_q"] ** 2)          # A, current amplitude
    df["u_s"] = np.sqrt(df["u_d"] ** 2 + df["u_q"] ** 2)          # V, voltage amplitude
    df["p_el"] = 1.5 * (df["u_d"] * df["i_d"] + df["u_q"] * df["i_q"])  # W
    df["i_s_x_n"] = df["i_s"] * df["motor_speed"] / 1000.0
    df["u_s_x_i_s"] = df["u_s"] * df["i_s"]
    return df


def feature_columns() -> list[str]:
    inputs = BASE_INPUTS + ["i_s", "u_s", "p_el", "i_s_x_n", "u_s_x_i_s"]
    cols = list(inputs)
    for span in EWMA_SPANS:
        cols += [f"{c}_ewma{span}" for c in inputs]
    return cols


def add_ewma(df: pd.DataFrame) -> pd.DataFrame:
    """Exponentially weighted moving averages per profile (causal, so usable online)."""
    inputs = BASE_INPUTS + ["i_s", "u_s", "p_el", "i_s_x_n", "u_s_x_i_s"]
    out = [df]
    g = df.groupby("profile_id", sort=False)[inputs]
    for span in EWMA_SPANS:
        e = g.transform(lambda s, sp=span: s.ewm(span=sp, adjust=True).mean())
        e.columns = [f"{c}_ewma{span}" for c in inputs]
        out.append(e)
    return pd.concat(out, axis=1)


def split(df: pd.DataFrame):
    test = df["profile_id"].isin(TEST_PROFILES)
    val = df["profile_id"].isin(VAL_PROFILES)
    train = ~(test | val)
    return train.to_numpy(), val.to_numpy(), test.to_numpy()
