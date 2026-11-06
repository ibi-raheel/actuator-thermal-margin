"""Learned estimators on causal EWMA features: ridge regression and gradient-boosted trees."""
from __future__ import annotations

import numpy as np
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


def fit_ridge(X, Y, alpha):
    model = make_pipeline(StandardScaler(), Ridge(alpha=alpha))
    model.fit(X, Y)
    return model


def fit_lgbm(X, Y, n_estimators=400, learning_rate=0.05, num_leaves=31):
    import lightgbm as lgb

    models = []
    for j in range(Y.shape[1]):
        m = lgb.LGBMRegressor(n_estimators=n_estimators, learning_rate=learning_rate,
                              num_leaves=num_leaves, subsample=0.8, subsample_freq=1,
                              colsample_bytree=0.5, min_child_samples=200,
                              n_jobs=2, verbose=-1, random_state=0)
        m.fit(X, Y[:, j])
        models.append(m)
    return models


def predict_lgbm(models, X):
    return np.column_stack([m.predict(X) for m in models])


def mse_per_target(y_true, y_pred):
    return ((y_true - y_pred) ** 2).mean(axis=0)


def max_abs_per_target(y_true, y_pred):
    return np.abs(y_true - y_pred).max(axis=0)
