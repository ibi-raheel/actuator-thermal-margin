# The actuator thermal test recipe

**Question.** How do you prove a sealed motor actuator will hold its duty cycle without overheating when nothing can measure the magnet, and how short can the end-of-line test be before bad units slip through?

**Answer.** Physics plus two learned models, averaged, nearly matched the best published temperature estimator on held-out motor runs (2.93 vs 2.87 K²). On simulated units, a 30-second test caught extra winding resistance (AUC 0.97), but a housing-interface void needed about 10 minutes. In 10 of the 21 simulated duty-cycle runs that overheated, the magnet crossed its limit first, so a winding-only check passed 9 of them.

Everything below comes from public test-bench data from a ~50 kW automotive PMSM, not a robot actuator. The end-of-line numbers come from **simulated units**. See [METHOD.md](METHOD.md) for the equations and checks.

## The playbook

1. **Characterise.** Fit the 4-node thermal network (magnet, winding, tooth, yoke) to bench runs of a golden unit. Gate it with a hand calculation on a steady plateau (within about 5 %) and an energy-balance check.
2. **Virtual sensor.** Average the physics model with the learned models on causal moving-average features to infer magnet temperature from current, voltage and speed. Use the average for trends. Use the physics residual for pass/fail, because the average's worst-case error is 15 K.
3. **Pick the test length by defect class.** Copper or crimp resistance: 30 s at standstill and high current. Slot impregnation: 60–120 s. Housing or thermal-interface void: about 10 min, or a separate hot-coolant soak, because a short test cannot see it.
4. **Pass/fail.** Residual = measured minus nominal-model winding temperature over the last 5 s. Set the threshold at a 1 % false-reject rate from the good-unit spread.
5. **Derate on the magnet, not the winding.** Publish a safe-peak-current table per duty cycle and per housing or coolant temperature.

## Decision rules and the results behind them

### 1. Which estimator to use
| Estimator (held-out runs 60, 62, 74) | MSE (K²) | Worst case (K) |
|---|---|---|
| 4-node thermal network | 12.94 | 13.1 |
| Ridge, moving-average features | 7.63 | 23.1 |
| Gradient-boosted trees | 7.90 | 23.7 |
| Average of the three | **2.93** | 15.1 |
| Published thermal neural network | 2.87 | 6.0 |

Rule: use the average for monitoring and trends. For a pass/fail call the worst case matters, so use the physics residual. Where a better worst-case model exists, it wins.

### 2. How long to test (simulated units, 200 A at standstill, 25 °C)
| Defect | AUC at 30 s | Caught at 1 % false rejects, 30 s | AUC at 60 s | AUC at 600 s |
|---|---|---|---|---|
| Winding resistance +8 % | 0.97 | 72 % | 0.98 | 0.97 |
| Slot impregnation (winding-to-tooth conductance −30 %) | 0.89 | 37 % | 0.98 | 1.00 |
| Housing-interface void (stator-to-housing conductance −30 %) | 0.50 | 3.5 % | 0.51 | 0.95 |

Rules:
- Resistance and crimp defects: 30 s.
- Slot impregnation: 1–2 min.
- Housing-interface voids: about 10 min, or a hot soak. A 30 s test is a coin flip for this defect.

### 3. Pass/fail threshold
Rule: FAIL-investigate when the residual is above the 99th percentile of known-good residuals, which gives a 1 % false-reject rate. With no labelled good units, the tool takes the threshold from 600 simulated good units at the same test length.

### 4. Derating
| Walking gait, peak current that stays inside both limits | Coolant 25 °C | 40 °C | 65 °C | 90 °C |
|---|---|---|---|---|
| Safe peak current (A) | 300 | 300 | 225 | 100 |

Rule: rate on the magnet. At 100 A with 90 °C coolant the magnet has 2.6 K of margin and the winding has 29.9 K. Of the 132 constructed runs (3 duty cycles × 4 coolant temperatures × 11 currents), 21 crossed a limit within the hour. The magnet crossed first in 10, and in 9 of those the winding never reached its limit, so a winding-only check would have passed them.

Limits used: winding 130 °C, magnet 100 °C. Both are assumptions that depend on insulation class and magnet grade.

## The tool

`pipeline/thermal_check.py` is a thin command-line wrapper over the existing pipeline. It fits no new model.

```bash
# duty-cycle margin: peak temperatures, margin and time to each limit, binding limit, safe peak current
python -m pipeline.thermal_check margin cycle.csv --max-safe

# end-of-line screen: ranked queue of units with PASS or FAIL-investigate
python -m pipeline.thermal_check screen eol_logs.csv --test-s 30 [--good-col is_good]
```

Inputs use the bench log's columns at 2 Hz (`--dt` changes the sample period). Voltages (`u_d, u_q`) are optional; the thermal network does not use them. Currents are read as the amplitude `sqrt(i_d² + i_q²)`, so the safe current is the peak of that amplitude in the file:
- `margin`: `i_d, i_q, motor_speed, coolant, ambient`.
- `screen`: `unit_id` plus the same columns plus `stator_winding`. An optional 1/0 column marks known-good units.

Outputs:
- `margin` prints JSON: `peak_winding_C`, `peak_magnet_C`, `winding_margin_K`, `magnet_margin_K`, `t_winding_limit_s`, `t_magnet_limit_s`, `binding_limit` and, with `--max-safe`, `max_safe_peak_current_A` (capped at the 300 A the bench data covers).
- `screen` prints a CSV of `unit_id, residual_K, verdict`, sorted by residual. It also prints the threshold and the defect classes this test length can see (simulated AUC ≥ 0.9) to stderr.

Tests (`tests/test_thermal_check.py`):
- `margin` on the walking gait at 200 A and 90 °C coolant reproduces the shipped result: the magnet crosses its limit at 747 s and binds.
- `screen` at 30 s flags a +8 % resistance unit as FAIL and passes a nominal unit.

## Week 1 on a real line

This runs on public test-bench data. In week 1 on a production line it would run on one actuator type's end-of-line history and produce the recipe for that line.

- **Day 1.** Pick one actuator type. Pull its end-of-line station logs (current, voltage, speed, winding or thermistor reading, housing or coolant temperature) and any bench characterisation runs. Map them to the tool's input columns.
- **Day 2.** Refit the thermal network on known-good units. Validate it with a hand calculation on a steady plateau and with held-out units, and report the error honestly.
- **Day 3.** Run the residual screen on every unit tested so far and rank it. Check the top of the queue against rework, teardown and field-return records to see whether high residuals line up with real defects.
- **Day 4.** Set test length and threshold per defect class at an agreed false-reject rate. Build the magnet-margin derating table for the real duty cycles at line temperatures.
- **Day 5.** Hand over the one-page recipe, the script running on station output, and a short list of which defects the current test can and cannot see, with a proposal for the ones it misses (longer dwell or a hot soak).
