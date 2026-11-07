# Actuator Thermal Margin

**Research question.** How do you prove a sealed motor actuator will hold its duty cycle without overheating when nothing can measure the magnet, and how short can the end-of-line test be before bad units slip through?

**Measured answer** (public test-bench data from a ~50 kW automotive PMSM, not a robot actuator):
- **Virtual sensor.** Physics plus two learned models, averaged, nearly matched the best published temperature estimator on held-out motor runs: 2.93 vs 2.87 K².
- **Test length (simulated units).** A 30-second test caught extra winding resistance (AUC 0.97), but a housing-interface void needed about 10 minutes (AUC 0.50 at 30 s, 0.95 at 600 s).
- **Derating.** In 10 of the 21 simulated duty-cycle runs that overheated, the magnet crossed its limit first, so a winding-only check passed 9 of them.

**The solution:** a one-page thermal test recipe and a small tool (`python -m pipeline.thermal_check margin|screen`). See **[SOLUTION.md](SOLUTION.md)**.

A virtual temperature sensor for permanent-magnet motors. It estimates magnet and winding temperature from current, voltage and speed, checks itself against a physics thermal network, and turns a duty cycle into the number of kelvin of margin an actuator has left.

**Live demo:** to be added after deployment

## The problem
Inside a sealed actuator, the magnet and winding temperatures cannot be measured, yet they decide whether the unit derates, demagnetises or fails its insulation. End-of-line tests and field derating therefore depend on a model that infers those temperatures from electrical signals. A unit that runs a few kelvin hotter than the model predicts, on the same test, is an early sign of a build defect.

## What it does
1. **Held-out test-bench runs.** Measured against predicted temperature for magnet, winding, stator tooth and stator yoke on three motor runs no model was trained on (8.9 h).
2. **Model vs physics.** A 4-node lumped-parameter thermal network (fitted with SciPy), ridge regression and gradient-boosted trees on causal moving-average features, compared with published results on the same split.
3. **Duty-cycle margin.** Peak winding and magnet temperature, margin to the limits and time to each limit, for three duty cycles at four coolant temperatures.
4. **End-of-line screen (simulated units).** How well the residual between measured and modelled temperature catches three build defects, as a function of test length.

## Results (held-out profiles 60, 62 and 74)
| Estimator | MSE (K²) | Max error (K) |
|---|---|---|
| 4-node thermal network | 12.94 | 13.1 |
| Ridge, moving-average features | 7.63 | 23.1 |
| Gradient-boosted trees | 7.90 | 23.7 |
| Average of the three | **2.93** | 15.1 |
| Published thermal neural network (reference) | 2.87 | 6.02 |

- Each single model here is worse than its published counterpart.
- Physics and learned errors are largely uncorrelated, so a plain average nearly matches the best published MSE (2.93 vs 2.87 K²). Its worst-case error is still 2.5× higher.
- At 90 °C coolant, the walking-gait cycle stays within limits only up to 100 A peak, against 300 A at 40 °C. The magnet often crosses its limit before the winding does: in 10 of the 21 runs that crossed a limit, between about 10 and 53 minutes into the cycle.
- On simulated units, a winding resistance defect of +8 % shows up in a 30 s test (AUC 0.97). A void in the stator-to-housing interface needs about 10 minutes (AUC 0.95 at 600 s, 0.50 at 30 s).

Validation:
- analytic RC step response within 0.05 K;
- energy balance closes to 3e-14;
- hand calculation of the winding rise on a measured plateau gives 88.8 K against 84.4 K measured (+5.2 %).

See [METHOD.md](METHOD.md) for the equations, assumptions, validation and limitations.

## How it works
- `pipeline/data.py`: loads the bench log, derives current and voltage magnitudes and electrical power, builds causal EWMA and EWMS features, and splits by whole profile.
- `pipeline/lptn.py` and `pipeline/fit_lptn.py`: the 4-node thermal network with temperature-corrected copper loss and speed-dependent iron loss. It is integrated with backward Euler (numba) and fitted by trust-region least squares.
- `pipeline/learned.py`: ridge and LightGBM estimators.
- `pipeline/scenarios.py`: duty-cycle margins and the simulated end-of-line study.
- `pipeline/thermal_check.py`: command-line wrapper for duty-cycle margin and the end-of-line residual screen (see [SOLUTION.md](SOLUTION.md)).
- `pipeline/run_all.py`: runs everything and writes static JSON to `web/public/data/`. The page needs no backend and no API keys.

## Run locally
```bash
# 1. data: download measures_v2.csv from the Kaggle dataset below into a folder of its own
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
PYTHON=.venv/bin/python ./run_pipeline.sh /path/to/measures_v2.csv   # ~4 min on 2 cores
.venv/bin/python -m pytest -q tests                                    # 14 tests

# 2. page
cd web && npm install && npm run dev
```

## Data
Electric Motor Temperature, LEA department, Paderborn University (W. Kirchgässner, O. Wallscheid, J. Böcker): https://www.kaggle.com/datasets/wkirgsn/electric-motor-temperature . The licence is **CC BY-SA 4.0**, and the derived JSON in `web/public/data/` is shared under the same licence. The dataset has 1.33 M rows at 2 Hz across 69 profiles (185 h).

The data comes from a ~50 kW automotive-class PMSM on a test bench, not a robot actuator. The duty cycles are constructed, and the end-of-line units are **simulated** on top of the fitted model; both are labelled as such.

Published reference values come from Kirchgässner, Wallscheid and Böcker, "Thermal neural networks", *Engineering Applications of Artificial Intelligence* 117 (2023) 105537.

---
Built by Ibi Raheel, mechanical engineer building AI tools. More work at [ibiraheel.com](https://ibiraheel.com).
