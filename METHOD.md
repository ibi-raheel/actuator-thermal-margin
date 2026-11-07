# Method

This file covers the equations, assumptions, validation and limitations behind every number in the demo. The pipeline lives in `pipeline/`. Running `./run_pipeline.sh <measures_v2.csv>` regenerates `results/summary.json` and the static JSON in `web/public/data/`.

## Research question

How do you prove a sealed motor actuator will hold its duty cycle without overheating when nothing can measure the magnet, and how short can the end-of-line test be before bad units slip through?

Three sub-questions follow, each answered below:
- How well can magnet temperature be inferred from current, voltage and speed? (sections 2 to 4)
- Which limit binds on a duty cycle, the winding or the magnet? (section 6)
- How long must an end-of-line test run to catch each defect class? (section 7, simulated units)

The decision rules drawn from these results, and the tool that applies them, are in [SOLUTION.md](SOLUTION.md).

## 1. Data

**Electric Motor Temperature** dataset, LEA department, Paderborn University (W. Kirchgässner, O. Wallscheid, J. Böcker), published on Kaggle as `wkirgsn/electric-motor-temperature`, file `measures_v2.csv`, licence **CC BY-SA 4.0**. The derived data in `web/public/data/` is shared under the same licence.

- A three-phase permanent-magnet synchronous motor (PMSM) on a test bench, water-cooled through the housing.
- 1,330,816 rows at 2 Hz: 69 measurement profiles, 184.8 h in total.
- Inputs: d/q voltages and currents, motor speed, coolant and ambient temperature. Torque is also logged, but it is an estimate, so it is not used as an input.
- Targets, measured with thermocouples: magnet (`pm`, read by telemetry), stator winding, stator tooth and stator yoke.
- Split by whole profile, never by row:
  - test: profiles 60, 62 and 74, the dataset's standard held-out set (8.9 h);
  - validation: profiles 4 and 58, used only to choose the ridge penalty;
  - training: the remaining 64 profiles.

  A unit test (`test_split_has_no_test_profile_in_training`) checks that no test profile reaches training.

Derived features, using the amplitude-invariant dq frame:

    i_s = sqrt(i_d^2 + i_q^2)              current amplitude [A]
    u_s = sqrt(u_d^2 + u_q^2)              voltage amplitude [V]
    P_el = 3/2 (u_d i_d + u_q i_q)          electrical power [W]
    i_s * n,  u_s * i_s                     interaction terms

## 2. Physics baseline: 4-node lumped-parameter thermal network (LPTN)

Nodes: magnet (rotor) PM, winding SW, stator tooth ST and stator yoke SY. The boundary is the coolant temperature T_c, which is measured.

    C_i dT_i/dt = P_i - Σ_j G_ij (T_i - T_j) - G_i,c (T_i - T_c)

Couplings:
- G_SW-ST (slot insulation);
- G_ST-SY (stator back iron);
- G_PM-ST = G0 + G1·n (air gap, speed-dependent convection);
- G_SY-c (housing to water jacket);
- G_SW-c (end winding to housing);
- G_PM-c = G0' + G1'·n (shaft and bearings).

Losses, with n in krpm:

    P_SW = 3/2 R0 (1 + α_Cu (T_SW - 20 °C)) i_s^2        α_Cu = 0.00393 1/K
    P_ST = k1 n + k2 n^2 + k3 i_s^2 n                    hysteresis, eddy, current-driven eddy
    P_SY = k4 n + k5 n^2
    P_PM = k6 n^2 + k7 i_s^2 n                           rotor eddy losses from harmonics

**Integration.** Backward Euler, which is unconditionally stable. Each step solves one 4×4 linear system, `(C/Δt + L) T_k+1 = C/Δt T_k + P_k + G_c T_c`, with the losses taken at the previous temperature. The step is 10 s for fitting and 0.5 s for evaluation.

**Fitting.** `scipy.optimize.least_squares` (trust-region reflective) over the log-parameters, minimising the squared error on all four temperatures across the 66 training and validation profiles at 10 s resolution. Every profile starts from its measured temperatures.

**Identifiability.** If every C, G and loss coefficient is scaled by the same factor, the temperatures do not change, so temperatures alone cannot fix the watt scale. R0 is therefore pinned at an assumed 15 mΩ. That value sets the watt scale only; the temperature predictions are unaffected.

## 3. Learned estimators

The features are causal exponentially weighted moving averages (EWMA) and standard deviations (EWMS) of the 12 inputs and derived signals. The spans are 1320, 3360, 6360 and 9480 samples, as in the published linear benchmark. Together with the raw signals this gives 108 features. All features are causal, so they could run online in a drive.

- **Ridge regression.** Standardised features. The penalty α is picked from {1 … 1e5} on the validation profiles (α = 1), then the model is refit on training plus validation.
- **Gradient-boosted trees (LightGBM).** One model per target: 400 trees, learning rate 0.05, 31 leaves. Trained on every 4th training and validation row. The hyper-parameters are fixed and were not tuned against the test set.
- **Average of the three.** An unweighted mean of LPTN, ridge and boosted trees. The weights are fixed in advance, not fitted.

## 4. Results on held-out profiles 60, 62 and 74

The averages below are taken over the four targets. Per-target values are in `results/summary.json`.

| Estimator | MSE (K²) | Max error (K) |
|---|---|---|
| LPTN, 4-node (this repo) | 12.94 | 13.1 |
| Ridge on EWMA/EWMS features (this repo) | 7.63 | 23.1 |
| Gradient-boosted trees (this repo) | 7.90 | 23.7 |
| **Average of the three (this repo)** | **2.93** | 15.1 |
| OLS, published | 4.47 | 9.85 |
| Expert-designed LPTN, published | 3.64 | 7.37 |
| Thermal neural network, published | 2.87 | 6.02 |

The published figures come from Kirchgässner, Wallscheid and Böcker, "Thermal neural networks: Lumped-parameter thermal modelling with state-space machine learning", *Engineering Applications of Artificial Intelligence* 117 (2023) 105537, Table III, on the dataset's held-out set.

**Plain reading of the results:**
- Each single model here does worse than its published counterpart. The 4-node LPTN is 3.6× worse than the expert-designed network, and ridge is 1.7× worse than the published OLS.
- The errors of the physics model and the learned models are largely uncorrelated, so their plain average reaches 2.93 K². That is on par with the best published model on MSE, but its worst-case error (15.1 K, on the magnet) is 2.5× worse.
- For an end-of-line or derating decision the worst case matters, so the published thermal neural network remains the better estimator.

## 5. Validation

1. **Analytic step response.** One RC node with temperature-dependent copper loss has the closed-form solution `T(t) = T_c + P/G' (1 − exp(−G' t / C))`, where `G' = G − α_Cu P`. The integrator matches it within 0.05 K (`test_step_response_matches_first_order_solution`).
2. **Energy balance.** Over the three test profiles, integrated losses equal heat stored plus heat to coolant. The relative residual is 3e-14, which is floating-point level, and is closed per step by construction of the implicit scheme (`test_energy_balance_closes`).
3. **Steady state.** A fixed-point solve of the network agrees with a long transient simulation within 0.05 K (`test_steady_state_matches_long_simulation`).
4. **Hand calculation on a measured plateau.** The pipeline searched for the highest-current constant operating point held for 20 min with the winding slope under 0.1 K/min. No window in the test profiles qualified, so the plateau comes from training profile 2, from 2,460 s to 3,660 s: i_s = 271.8 A, 100 rpm, coolant 18.8 °C.
   - Copper loss: `P_cu = 3/2 · R(T) · i_s² = 3/2 · 0.0199 Ω · 271.8² = 2,206 W`, with R corrected to the measured winding temperature.
   - Series path, winding → tooth → yoke → coolant: `R_th = 1/G_SW-ST + 1/G_ST-SY + 1/G_SY-c = 0.0399 K/W`.
   - Hand estimate: `ΔT = P_cu · R_th + P_ST (1/G_ST-SY + 1/G_SY-c) = 88.8 K`, against a **measured winding-over-coolant rise of 84.4 K**. That is +4.4 K, or 5.2 %. The series path ignores the parallel route through the rotor, so it over-predicts slightly.
   - The full network steady state gives 85.0 K (+0.6 K).
5. **Split integrity and row alignment.** These are unit tests. One of them caught a real bug: the CSV is not ordered by profile, which misaligned predictions until the loader grouped rows by profile.

## 6. Duty-cycle margin

The fitted LPTN is driven by three duty cycles inside the bench's operating envelope (i_s ≤ 300 A), for 1 h at coolant temperatures of 25, 40, 65 and 90 °C:
- lift-and-hold: 20 s lift, 40 s hold at 60 % current, 30 s rest;
- walking gait: a 1 Hz torque cycle, represented by its RMS current;
- continuous carry: 80 % current at low speed.

Margins are measured against two assumed limits:
- winding 130 °C, a class B insulation proxy;
- magnet 100 °C, an assumed demagnetisation-safe limit that depends on the magnet grade.

The output is the peak temperatures, the margins and the time to each limit. The duty-cycle shapes are constructed and labelled as such.

**Result.** At 25 and 40 °C coolant, all three cycles hold the full 300 A within both limits. The highest peak current that stays within both limits falls as the coolant warms:

| Duty cycle | 65 °C coolant | 90 °C coolant |
|---|---|---|
| Walking gait | 225 A | 100 A |
| Continuous carry | 275 A | 175 A |
| Lift-and-hold | 300 A | 200 A |

**The magnet often limits before the winding, and late.** Two examples at 90 °C coolant:
- walking gait at 200 A never reaches the winding limit (peak 123.7 °C), but the magnet crosses 100 °C after 747 s;
- lift-and-hold at 250 A crosses the magnet limit only after 1,717 s, about 29 min.

A test or derating rule that watches only the winding, or runs only a few minutes, misses this.

## 7. End-of-line screen (synthetic units, labelled)

No public dataset has per-unit actuator defects, so the units in this study are **simulated**:

- **Good units.** The fitted network with unit-to-unit spread: R0 σ = 1.5 %, conductances σ = 5 %, capacitances σ = 3 %.
- **Defects:**
  - winding resistance +8 %;
  - stator-to-housing conductance −30 %, a thermal interface void;
  - winding-to-tooth conductance −30 %, incomplete slot impregnation.
- **Test.** 200 A at standstill from 25 °C, with the winding temperature read with 0.1 K noise.
- **Score.** The residual: measured minus the nominal model at the end of the test, averaged over the last 5 s.
- **Sample.** 600 good units and 200 per defect, scored with ROC AUC and detection at a 1 % false-reject rate.

| Test length | R +8 % AUC (TPR@1 %) | Slot impregnation AUC (TPR@1 %) | Housing interface AUC (TPR@1 %) |
|---|---|---|---|
| 10 s | 0.95 (49 %) | 0.65 (6 %) | 0.50 (1 %) |
| 30 s | 0.97 (72 %) | 0.89 (37 %) | 0.50 (4 %) |
| 60 s | 0.98 (77 %) | 0.98 (82 %) | 0.51 (3 %) |
| 120 s | 0.98 (77 %) | 1.00 (98 %) | 0.53 (3 %) |
| 300 s | 0.98 (72 %) | 1.00 (100 %) | 0.75 (10 %) |
| 600 s | 0.97 (66 %) | 1.00 (100 %) | 0.95 (48 %) |

What the residual can and cannot see:
- A resistance defect shows up within 30 s, because extra copper loss heats the winding at once.
- A slot impregnation defect needs about 60 to 120 s.
- A housing interface defect cannot be seen in a short test at all. Heat has not yet reached the yoke, so it needs roughly 10 minutes, or a different test such as a hot-coolant soak.

The detection rate for the resistance defect stops improving as the test gets longer: the normal 1.5 % spread in R0 makes up a growing share of the residual.

## 8. Assumptions and limitations

- The bench motor is a ~50 kW automotive-class PMSM, not a robot joint actuator. The method transfers; the fitted parameters do not.
- R0 is pinned, so the absolute watts depend on that assumption. Temperatures do not.
- The 4-node network is coarse. The published expert network uses more structure and reaches 3.64 K².
- The magnet temperature is measured on one point of the rotor, so it is not the hot spot.
- The end-of-line study is simulated on top of the fitted model: it shows how detectable each defect is in principle, not how a real line performs.
- The duty cycles are constructed, and the walking-gait cycle uses RMS current at 1 s resolution.
- The temperature limits are assumptions that depend on the insulation class and magnet grade.
