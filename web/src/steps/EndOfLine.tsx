import { useState } from "react";
import type { AllData } from "../data";
import { useWidth } from "../ui/hooks";
import { fmt, linear } from "../ui/scale";
import { Details, Stops } from "../ui/controls";

const ORDER = ["winding_resistance_+8pct", "slot_potting_-30pct", "yoke_interface_-30pct"];
const SHORT: Record<string, string> = {
  "winding_resistance_+8pct": "Winding resistance +8 %",
  "slot_potting_-30pct": "Incomplete slot impregnation",
  "yoke_interface_-30pct": "Void in housing interface",
};

function hist(vals: number[], lo: number, hi: number, bins: number) {
  const out = new Array(bins).fill(0);
  const w = (hi - lo) / bins;
  for (const v of vals) out[Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / w)))]++;
  return out.map((c) => c / vals.length);
}

export function EndOfLine({ d }: { d: AllData }) {
  const E = d.eol;
  const lengths = E.by_length.map((b) => b.test_s);
  const [li, setLi] = useState(1);
  const B = E.by_length[li];
  const [wrap, w] = useWidth<HTMLDivElement>();

  const all = [...B.hist_good, ...ORDER.flatMap((k) => B.defects[k].hist_bad)];
  const lo = Math.min(...all), hi = Math.max(...all);
  const span = hi - lo || 1;
  const bins = w < 500 ? 28 : 44;
  const x = linear([lo - span * 0.02, hi + span * 0.02], [0, w]);
  const RH = 64;
  const g = hist(B.hist_good, lo - span * 0.02, hi + span * 0.02, bins);
  const bw = w / bins;

  const res = E.by_length[1].defects["winding_resistance_+8pct"];
  const yokeShort = E.by_length[1].defects["yoke_interface_-30pct"];
  const yokeLong = E.by_length[E.by_length.length - 1].defects["yoke_interface_-30pct"];

  return (
    <>
      <p className="lede">
        Heat a finished unit at {fmt(E.i_test_A, 0)} A and compare its winding temperature with the model. On simulated units, extra winding resistance shows in {lengths[1]} s (AUC {fmt(res.auc, 2)});
        a void in the housing interface needs about ten minutes (AUC {fmt(yokeShort.auc, 2)} at {lengths[1]} s, {fmt(yokeLong.auc, 2)} at {lengths[lengths.length - 1]} s).
      </p>
      <div className="figure eol">
        <div className="eol-top">
          <Stops label="Test length" stops={lengths} index={li} onChange={setLi} format={(v) => (v >= 60 ? `${v / 60} min` : `${v} s`)} />
          <span className="sim-tag">Simulated units</span>
        </div>
        <div ref={wrap} className="eol-rows">
          {ORDER.map((k) => {
            const D = B.defects[k];
            const b = hist(D.hist_bad, lo - span * 0.02, hi + span * 0.02, bins);
            const ymax = Math.max(...g, ...b);
            const y = linear([0, ymax], [RH, 4]);
            const step = b.map((v, i) => `${i ? "L" : "M"}${(i * bw).toFixed(1)},${y(v).toFixed(1)} H${((i + 1) * bw).toFixed(1)}`).join("") + ` V${RH}`;
            return (
              <div className="eol-row" key={k}>
                <div className="eol-label">
                  <span className="eol-name">{SHORT[k]}</span>
                  <span className="eol-stats"><b>AUC {fmt(D.auc, 2)}</b> · {fmt(D.tpr_at_1pct_fpr * 100, 0)} % caught at 1 % false rejects</span>
                </div>
                <svg width={w} height={RH + 2} role="img" aria-label={`${SHORT[k]}: residual distribution of defective against good units at a ${B.test_s} s test. AUC ${fmt(D.auc, 2)}.`}>
                  <line x1={0} x2={w} y1={RH + 0.5} y2={RH + 0.5} className="base" />
                  {g.map((v, i) => v > 0 && <rect key={i} x={i * bw + 1} y={y(v)} width={Math.max(1, bw - 2)} height={RH - y(v)} className="h-good" />)}
                  <path d={`M0,${RH} ` + step.slice(1)} className="h-bad" />
                  <line x1={x(0)} x2={x(0)} y1={0} y2={RH} className="zero-v" />
                </svg>
              </div>
            );
          })}
          <div className="eol-axis">
            <svg width={w} height={22} aria-hidden="true">
              {[lo, 0, hi].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
                <text key={v} x={Math.min(Math.max(x(v), 18), w - 18)} y={14} textAnchor="middle">{v > 0 ? "+" : v < 0 ? "−" : ""}{fmt(Math.abs(v), 2)} K</text>
              ))}
            </svg>
            <p className="legend-row">
              <span><i className="lg-bar" />Good units ({E.n_good})</span>
              <span><i className="lg-step" />Defective units ({E.n_bad_per_defect} per defect)</span>
              <span className="muted">Residual: measured − model at end of test</span>
            </p>
          </div>
        </div>
      </div>
      <p className="verdict">
        Extra copper loss heats the winding at once. Poor slot impregnation needs one to two minutes. A housing void stays invisible until heat reaches the yoke, so it needs a long test or a different one, such as a hot-coolant soak.
      </p>
      <Details>
        <table className="data">
          <caption>AUC (share caught at 1 % false rejects) by test length, simulated units</caption>
          <thead><tr><th scope="col">Test</th>{ORDER.map((k) => <th key={k} scope="col" className="num">{SHORT[k]}</th>)}</tr></thead>
          <tbody>
            {E.by_length.map((r) => (
              <tr key={r.test_s}><th scope="row">{r.test_s} s</th>
                {ORDER.map((k) => <td key={k} className="num">{fmt(r.defects[k].auc, 2)} ({fmt(r.defects[k].tpr_at_1pct_fpr * 100, 0)} %)</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <ul>
          <li>No public dataset has per-unit actuator defects, so these units are simulated on top of the fitted network. They show how detectable each defect is in principle, not how a real line performs.</li>
          <li>Good units carry unit-to-unit spread: resistance σ 1.5 %, conductances σ 5 %, capacities σ 3 %. {E.n_good} good units and {E.n_bad_per_defect} per defect.</li>
          <li>Defects: {ORDER.map((k) => E.defects[k]).join("; ")}.</li>
          <li>Test: {fmt(E.i_test_A, 0)} A at standstill from 25 °C, winding read with {E.noise_K} K noise. Score: measured minus nominal model, averaged over the last 5 s.</li>
          <li>The resistance defect stops improving with longer tests: the normal 1.5 % spread in resistance becomes a growing share of the residual.</li>
        </ul>
      </Details>
    </>
  );
}
