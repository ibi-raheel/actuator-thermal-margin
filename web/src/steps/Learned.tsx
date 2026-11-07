import { useMemo, useState, type PointerEvent } from "react";
import { CH_SHORT, CHANNELS, type AllData, type Channel } from "../data";
import { useWidth } from "../ui/hooks";
import { extent, fmt, linear, mmss, path, ticks } from "../ui/scale";
import { Details, Segmented } from "../ui/controls";
import { MODEL_META, modelRow, type ModelKey } from "../ui/models";

const KEYS: ModelKey[] = ["lptn", "gbm", "blend"];

export function Learned({ d }: { d: AllData }) {
  const runs = d.profiles.profiles.map((p) => p.profile);
  const [run, setRun] = useState(runs[0]);
  const [ch, setCh] = useState<Channel>("pm");
  const [on, setOn] = useState<Record<ModelKey, boolean>>({ lptn: true, gbm: true, blend: false });
  const p = d.profiles.profiles.find((x) => x.profile === run)!;
  const n = p.t_s.length;
  const [cur, setCur] = useState(Math.round(n * 0.62));
  const k = Math.min(cur, n - 1);
  const [wrap, w] = useWidth<HTMLDivElement>();

  const series = useMemo(() => {
    const blend = p.lptn[ch].map((v, i) => (v + p.ridge[ch][i] + p.gbm[ch][i]) / 3);
    return { lptn: p.lptn[ch], gbm: p.gbm[ch], blend } as Record<ModelKey, number[]>;
  }, [p, ch]);
  const meas = p.measured[ch];
  const tmin = p.t_s.map((t) => t / 60);
  const active = KEYS.filter((m) => on[m]);

  const narrow = w < 560;
  const ml = narrow ? 34 : 42, mr = 8;
  const H = narrow ? 220 : 250, EH = narrow ? 80 : 90, gap = 26;
  const x = linear([0, tmin[n - 1]], [ml, w - mr]);
  const [lo, hi] = extent([meas, ...active.map((m) => series[m])]);
  const pad = (hi - lo) * 0.06;
  const y = linear([lo - pad, hi + pad], [H, 10]);
  const errs = active.map((m) => series[m].map((v, i) => v - meas[i]));
  const eMax = Math.max(5, ...errs.flat().map(Math.abs));
  const ey = linear([-eMax, eMax], [H + gap + EH, H + gap]);
  const totalH = H + gap + EH + 36;

  const pick = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * tmin[n - 1];
    let i = Math.round((t / tmin[n - 1]) * (n - 1));
    i = Math.max(0, Math.min(n - 1, i));
    setCur(i);
  };

  const pt = (m: ModelKey | "ridge") => modelRow(d, m).per_target![ch];
  const phys = pt("lptn"), ml_ = pt("gbm"), bl = pt("blend");

  return (
    <>
      <p className="lede">
        Gradient-boosted trees learn the same temperatures from 108 causal moving-average features of current, voltage and speed.
        Pick a held-out run and drag across the trace.
      </p>
      <div className="figure viewer">
        <div className="ctl-row">
          <Segmented label="Run" value={run} onChange={(v) => { setRun(v); }} options={runs.map((r) => ({ value: r, label: String(r) }))} />
          <Segmented label="Channel" value={ch} onChange={setCh} options={CHANNELS.map((c) => ({ value: c, label: CH_SHORT[c] }))} />
          <div className="seg" role="group" aria-label="Models shown">
            <span className="ctl-label">Model</span>
            <div className="seg-opts">
              {KEYS.map((m) => (
                <button key={m} type="button" className="pen-btn" aria-pressed={on[m]}
                  onClick={() => setOn((o) => ({ ...o, [m]: !o[m] }))}>
                  <span className="pen" style={{ background: MODEL_META[m].color }} />{MODEL_META[m].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="readout" aria-live="polite">
          <div className="ro-cell"><span className="ro-k">Time</span><span className="ro-v">{mmss(p.t_s[k])}</span></div>
          <div className="ro-cell"><span className="ro-k">Current</span><span className="ro-v">{fmt(p.i_s_A[k], 0)} A</span></div>
          <div className="ro-cell"><span className="ro-k"><span className="pen ink" />Measured</span><span className="ro-v">{fmt(meas[k])} °C</span></div>
          {active.map((m) => {
            const e = series[m][k] - meas[k];
            return (
              <div className="ro-cell" key={m}>
                <span className="ro-k"><span className="pen" style={{ background: MODEL_META[m].color }} />{MODEL_META[m].label}</span>
                <span className="ro-v">{fmt(series[m][k])} °C <small>{e >= 0 ? "+" : "−"}{fmt(Math.abs(e))}</small></span>
              </div>
            );
          })}
        </div>

        <div ref={wrap} className="viewer-plot">
          <svg width={w} height={totalH} role="img" aria-label={`${CH_SHORT[ch]} temperature on run ${run}: measured against ${active.map((m) => MODEL_META[m].label).join(", ") || "no model"}, with prediction error below.`}>
            <g className="grid">
              {ticks(lo - pad, hi + pad, 5).map((t) => (
                <g key={t}><line x1={ml} x2={w - mr} y1={y(t)} y2={y(t)} /><text x={ml - 6} y={y(t) + 4} textAnchor="end">{t}</text></g>
              ))}
              <text x={ml - 6} y={8} textAnchor="end" className="unit">°C</text>
            </g>
            <path d={path(tmin, meas, x, y)} className="line-meas" />
            {active.map((m) => <path key={m} d={path(tmin, series[m], x, y)} className="line-model" style={{ stroke: MODEL_META[m].color }} />)}

            <g className="grid">
              <line x1={ml} x2={w - mr} y1={ey(0)} y2={ey(0)} className="zero" />
              {[-eMax, eMax].map((t) => <text key={t} x={ml - 6} y={ey(t) + 4} textAnchor="end">{t > 0 ? "+" : "−"}{fmt(Math.abs(t), 0)}</text>)}
              <text x={ml} y={H + gap - 8} className="sub-label">Error, prediction − measured (K)</text>
            </g>
            {active.map((m, j) => <path key={m} d={path(tmin, errs[j], x, ey)} className="line-err" style={{ stroke: MODEL_META[m].color }} />)}

            <g className="axis" transform={`translate(0 ${H + gap + EH})`}>
              {ticks(0, tmin[n - 1], narrow ? 4 : 8).map((t) => (
                <g key={t} transform={`translate(${x(t)} 0)`}><line y2={4} /><text y={17} textAnchor="middle">{t}</text></g>
              ))}
              <text x={w - mr} y={31} textAnchor="end" className="unit">time, min</text>
            </g>

            <g className="cursor" transform={`translate(${x(tmin[k])} 0)`}>
              <line y1={4} y2={H + gap + EH} />
              <circle cy={y(meas[k])} r={4} className="dot-meas" />
              {active.map((m) => <circle key={m} cy={y(series[m][k])} r={4} style={{ fill: MODEL_META[m].color }} className="dot-model" />)}
            </g>
            <rect x={ml} y={0} width={Math.max(0, w - ml - mr)} height={H + gap + EH} className="hit"
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pick(e); }}
              onPointerMove={(e) => { if (e.buttons || e.pointerType === "mouse") pick(e); }} />
          </svg>
        </div>
        <label className="scrub">
          <span className="ctl-label">Scrub time</span>
          <input type="range" min={0} max={n - 1} value={k} onChange={(e) => setCur(+e.target.value)} aria-valuetext={`${mmss(p.t_s[k])}`} />
        </label>

        <p className="verdict">
          On the {CH_SHORT[ch].toLowerCase()}, over all three held-out runs, the trees cut the average error from {fmt(phys.mse_K2, 2)} to {fmt(ml_.mse_K2, 2)} K²
          {ml_.max_K > phys.max_K
            ? <>, but their worst miss grows from {fmt(phys.max_K)} to {fmt(ml_.max_K)} K.</>
            : <> and their worst miss shrinks from {fmt(phys.max_K)} to {fmt(ml_.max_K)} K.</>}
          {on.blend && <> The blend: {fmt(bl.mse_K2, 2)} K², worst {fmt(bl.max_K)} K.</>}
        </p>
      </div>
      <Details>
        <table className="data">
          <caption>Held-out error by channel (runs {d.summary.dataset.test_profiles.join(", ")})</caption>
          <thead>
            <tr><th scope="col">Estimator</th>{CHANNELS.map((c) => <th key={c} scope="col" className="num">{CH_SHORT[c]}<br /><small>MSE K² / max K</small></th>)}</tr>
          </thead>
          <tbody>
            {(["lptn", "ridge", "gbm", "blend"] as const).map((m) => {
              const row = modelRow(d, m);
              return (
                <tr key={m}>
                  <th scope="row">{m === "ridge" ? "Ridge regression" : MODEL_META[m].long}</th>
                  {CHANNELS.map((c) => <td key={c} className="num">{fmt(row.per_target![c].mse_K2, 2)} / {fmt(row.per_target![c].max_K)}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
        <ul>
          <li>Features: exponentially weighted moving averages and standard deviations of the 12 inputs and derived signals (current and voltage amplitude, electrical power, interaction terms), spans {d.summary.ewma_spans.join(", ")} samples. All causal, so they could run online in a drive.</li>
          <li>LightGBM: one model per target, 400 trees, learning rate 0.05, 31 leaves, trained on every 4th row. Hyper-parameters fixed in advance, not tuned on the test runs.</li>
          <li>Ridge regression on the same features, penalty α = {d.summary.ridge_alpha} chosen on the validation runs. It is part of the blend but not drawn here, to keep the trace readable.</li>
          <li>The blend is an unweighted mean of physics, ridge and trees, computed point by point for this trace.</li>
        </ul>
      </Details>
    </>
  );
}
