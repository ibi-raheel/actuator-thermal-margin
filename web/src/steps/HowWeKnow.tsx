import type { AllData } from "../data";
import { fmt } from "../ui/scale";
import { Details } from "../ui/controls";
import { modelRow, published } from "../ui/models";

function Tick() {
  return <svg className="tick" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" /></svg>;
}

export function HowWeKnow({ d }: { d: AllData }) {
  const v = d.summary.validation;
  const pc = v.plateau_hand_calc;
  const eb = v.energy_balance;
  const bars = [
    { k: "Measured on the bench", v: pc.measured_rise_K, cls: "b-meas" },
    { k: "Hand calculation", v: pc.hand_calc_rise_K, cls: "b-hand" },
    { k: "Full network, steady state", v: pc.network_steady_state_rise_K, cls: "b-net" },
  ];
  const scaleMax = 100;
  const ratio = modelRow(d, "blend").max_K / published(d, "Thermal").max_K;
  const pct = ((pc.hand_calc_rise_K - pc.measured_rise_K) / pc.measured_rise_K) * 100;
  const checks = [
    { c: "Analytic step response of one RC node", crit: "closed form", r: "within 0.05 K" },
    { c: "Energy balance over the held-out runs", crit: "losses = stored + to coolant", r: `residual ${eb.rel_residual.toExponential(0).replace("e-", "e−")}` },
    { c: "Steady-state solve vs long transient", crit: "same fixed point", r: "within 0.05 K" },
    { c: "Hand calculation on a measured plateau", crit: "winding rise", r: `${fmt(pc.hand_calc_rise_K)} vs ${fmt(pc.measured_rise_K)} K (+${fmt(pct)} %)` },
    { c: "Split integrity and row alignment", crit: "no held-out run in training", r: "unit tests pass" },
  ];

  return (
    <>
      <p className="lede">
        Check the physics by hand. On a 20-minute plateau at {fmt(pc.i_s_A)} A, copper loss through the series path predicts a {fmt(pc.hand_calc_rise_K)} K winding rise; the bench measured {fmt(pc.measured_rise_K)} K.
      </p>
      <div className="figure proof">
        <div className="plateau">
          <p className="sub-label">Winding rise over coolant, run {pc.profile}, {pc.window_s[0]}–{pc.window_s[1]} s</p>
          {bars.map((b) => (
            <div className="pl-row" key={b.k}>
              <span className="pl-k">{b.k}</span>
              <span className="pl-track"><span className={`pl-bar ${b.cls}`} style={{ width: `${(b.v / scaleMax) * 100}%` }} /></span>
              <span className="pl-v">{fmt(b.v)} K</span>
            </div>
          ))}
          <div className="pl-axis" aria-hidden="true"><span>0</span><span>50</span><span>100 K</span></div>
          <pre className="eq small">{`P_cu = 3/2 · R(T) · i_s²
     = 3/2 · ${pc.R_ohm} Ω · (${fmt(pc.i_s_A)} A)² = ${fmt(pc.P_cu_W, 0)} W
R_th = 1/G_SW-ST + 1/G_ST-SY + 1/G_SY-c = ${pc.R_series_K_per_W} K/W
ΔT ≈ P_cu · R_th + P_ST (1/G_ST-SY + 1/G_SY-c) = ${fmt(pc.hand_calc_rise_K)} K`}</pre>
        </div>
        <table className="cal">
          <caption>Checks run by the pipeline</caption>
          <thead><tr><th scope="col">Check</th><th scope="col">Against</th><th scope="col">Result</th></tr></thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.c}><td>{c.c}</td><td className="muted">{c.crit}</td><td className="res"><Tick />{c.r}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="verdict">The series path ignores the parallel route through the rotor, so the hand estimate runs {fmt(pc.hand_vs_measured_K)} K high. One unit test caught a real bug: rows were not grouped by run, which misaligned predictions until the loader was fixed.</p>
      <Details summary="Assumptions and limits">
        <ul>
          <li>The bench motor is a ~50 kW automotive-class machine, not a joint actuator. The method transfers; the fitted parameters do not.</li>
          <li>The plateau comes from training run {pc.profile}: no window in the held-out runs held a constant high current long enough. Coolant {fmt(pc.coolant_C)} °C, {fmt(pc.speed_rpm, 0)} rpm.</li>
          <li>Phase resistance is pinned at an assumed value, so absolute watts depend on it; temperatures do not.</li>
          <li>The magnet temperature is measured at one point on the rotor, not at the hot spot.</li>
          <li>The end-of-line units are simulated and the duty cycles constructed. Temperature limits depend on insulation class and magnet grade.</li>
          <li>Each single model is weaker than its published counterpart, and the blend’s worst-case error is {fmt(ratio)}× the best published model’s.</li>
        </ul>
      </Details>
    </>
  );
}
