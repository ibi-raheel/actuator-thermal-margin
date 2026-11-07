import { useState } from "react";
import type { AllData } from "../data";
import { useWidth } from "../ui/hooks";
import { fmt, linear, ticks } from "../ui/scale";
import { Details, Stops } from "../ui/controls";

const CYCLE = "walking_gait";
const CYCLES = ["walking_gait", "continuous_carry", "lift_and_hold"];

export function Margin({ d }: { d: AllData }) {
  const grid = d.duty.limits.coolant_grid_C;
  const [ci, setCi] = useState(grid.length - 1);
  const [hover, setHover] = useState<number | null>(null);
  const coolant = grid[ci];
  const runs = d.duty.runs.filter((r) => r.duty_cycle === CYCLE && r.coolant_C === coolant).sort((a, b) => a.i_peak_A - b.i_peak_A);
  const safe = d.summary.duty_cycle_max_safe_peak_A[`${CYCLE}@${coolant}C`];
  const next = runs.find((r) => r.i_peak_A > safe);
  const { winding_C: WL, magnet_C: ML } = d.duty.limits;
  const safeAt = (c: number) => d.summary.duty_cycle_max_safe_peak_A[`${CYCLE}@${c}C`];

  let first: { which: string; t: number } | null = null;
  if (next) {
    const tw = next.t_winding_limit_s ?? Infinity, tm = next.t_magnet_limit_s ?? Infinity;
    first = tm <= tw ? { which: "magnet", t: tm } : { which: "winding", t: tw };
  }

  const [wrap, w] = useWidth<HTMLDivElement>();
  const narrow = w < 560;
  const ml = narrow ? 34 : 44, mr = narrow ? 10 : 16, H = narrow ? 250 : 320, mb = 34;
  const iMax = Math.max(...d.duty.runs.map((r) => r.i_peak_A));
  const iMin = Math.min(...d.duty.runs.map((r) => r.i_peak_A));
  const x = linear([iMin, iMax], [ml, w - mr]);
  const y = linear([20, 180], [H, 8]);
  const line = (k: "peak_winding_C" | "peak_magnet_C") => runs.map((r, i) => `${i ? "L" : "M"}${x(r.i_peak_A).toFixed(1)},${y(r[k]).toFixed(1)}`).join("");
  const step = runs.length > 1 ? x(runs[1].i_peak_A) - x(runs[0].i_peak_A) : 20;
  const h = hover != null ? runs[hover] : null;
  const hot = grid[grid.length - 1];
  const example = d.duty.runs.find((r) => r.duty_cycle === CYCLE && r.coolant_C === hot && r.i_peak_A === 200);

  return (
    <>
      <p className="lede">
        Run the fitted network through an hour of a walking gait. At {grid[1]} °C coolant the full {fmt(safeAt(grid[1]), 0)} A stays inside both limits; at {grid[grid.length - 1]} °C only {fmt(safeAt(grid[grid.length - 1]), 0)} A does.
      </p>
      <div className="figure margin">
        <div className="margin-top">
          <Stops label="Coolant temperature" stops={grid} index={ci} onChange={setCi} format={(v) => `${v} °C`} />
          <div className="gauge" aria-live="polite">
            <span className="gauge-k">Peak safe current</span>
            <span className="gauge-v">{fmt(safe, 0)}<small> A</small></span>
            <span className="gauge-note">
              {first
                ? <>At {fmt(next!.i_peak_A, 0)} A the {first.which} crosses its limit first, {fmt(first.t / 60)} min in.</>
                : <>Both limits hold up to {fmt(iMax, 0)} A, the edge of the bench envelope.</>}
            </span>
          </div>
        </div>
        <div ref={wrap} className="margin-plot">
          <svg width={w} height={H + mb} role="img"
            aria-label={`Peak winding and magnet temperature against peak current at ${coolant} °C coolant. Safe up to ${safe} A.`}
            onPointerLeave={() => setHover(null)}>
            <defs>
              <pattern id="over" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="7" className="hatch-over" />
              </pattern>
            </defs>
            <g className="grid">
              {ticks(20, 180, 6).map((t) => (
                <g key={t}><line x1={ml} x2={w - mr} y1={y(t)} y2={y(t)} /><text x={ml - 6} y={y(t) + 4} textAnchor="end">{t}</text></g>
              ))}
              <text x={ml - 6} y={y(180) + 12} textAnchor="end" className="unit">°C</text>
            </g>
            {safe < iMax && <rect x={x(safe) + step / 2} y={8} width={Math.max(0, w - mr - x(safe) - step / 2)} height={H - 8} fill="url(#over)" className="over-zone" />}
            {safe < iMax && <text x={w - mr - 6} y={H - 10} textAnchor="end" className="over-label">over a limit</text>}

            <line x1={ml} x2={w - mr} y1={y(WL)} y2={y(WL)} className="limit limit-w" />
            <line x1={ml} x2={w - mr} y1={y(ML)} y2={y(ML)} className="limit limit-m" />
            <text x={ml + 6} y={y(WL) - 6} className="limit-label">Winding limit {WL} °C</text>
            <text x={ml + 6} y={y(ML) - 6} className="limit-label">Magnet limit {ML} °C</text>

            <path d={line("peak_winding_C")} className="m-line" style={{ stroke: "var(--wind)" }} />
            <path d={line("peak_magnet_C")} className="m-line" style={{ stroke: "var(--mag)" }} />
            {runs.map((r) => (
              <g key={r.i_peak_A}>
                <circle cx={x(r.i_peak_A)} cy={y(r.peak_winding_C)} r={4.5} className="m-dot" style={{ fill: "var(--wind)" }} />
                <rect x={x(r.i_peak_A) - 4.5} y={y(r.peak_magnet_C) - 4.5} width={9} height={9} className="m-dot" style={{ fill: "var(--mag)" }} />
              </g>
            ))}
            {!narrow && runs.length > 0 && (
              <>
                <text x={x(runs[runs.length - 1].i_peak_A) - 10} y={y(runs[runs.length - 1].peak_winding_C) - 10} textAnchor="end" className="direct">Winding peak</text>
                <text x={x(runs[runs.length - 1].i_peak_A) - 10} y={y(runs[runs.length - 1].peak_magnet_C) + 24} textAnchor="end" className="direct">Magnet peak</text>
              </>
            )}

            <g className="safe-mark" transform={`translate(${x(safe)} 0)`}>
              <line y1={8} y2={H} />
              <text y={H - 8} x={-6} textAnchor="end">{fmt(safe, 0)} A</text>
            </g>

            <g className="axis" transform={`translate(0 ${H})`}>
              {runs.filter((_, i) => !narrow || i % 2 === 0).map((r) => (
                <g key={r.i_peak_A} transform={`translate(${x(r.i_peak_A)} 0)`}><line y2={4} /><text y={17} textAnchor="middle">{r.i_peak_A}</text></g>
              ))}
              <text x={w - mr} y={31} textAnchor="end" className="unit">peak current, A</text>
            </g>

            {h && (
              <g className="tip" transform={`translate(${Math.min(Math.max(x(h.i_peak_A), ml + 80), w - mr - 80)} ${Math.max(y(h.peak_winding_C) - 64, 12)})`}>
                <rect x={-78} y={0} width={156} height={50} rx={2} />
                <text x={-68} y={18}>{h.i_peak_A} A · winding {fmt(h.peak_winding_C)} °C</text>
                <text x={-68} y={36}>magnet {fmt(h.peak_magnet_C)} °C</text>
              </g>
            )}
            {runs.map((r, i) => (
              <rect key={r.i_peak_A} x={x(r.i_peak_A) - step / 2} y={0} width={step} height={H} className="hit"
                onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
            ))}
          </svg>
          <p className="legend-row" aria-hidden="true">
            <span><i className="lg-dot" style={{ background: "var(--wind)" }} />Winding peak</span>
            <span><i className="lg-sq" style={{ background: "var(--mag)" }} />Magnet peak</span>
            <span><i className="lg-hatch" />Over a limit</span>
          </p>
        </div>
      </div>
      <p className="verdict">
        The magnet often limits before the winding, and late.
        {example && example.t_magnet_limit_s != null && <> At {hot} °C the walking gait at 200 A peaks at {fmt(example.peak_winding_C)} °C in the winding, inside its limit, but the magnet crosses {ML} °C after {fmt(example.t_magnet_limit_s / 60)} min.</>}
        {" "}A test that watches only the winding, or runs only a few minutes, misses this.
      </p>
      <Details>
        <table className="data">
          <caption>Highest peak current inside both limits (A), one hour per run</caption>
          <thead><tr><th scope="col">Duty cycle (constructed)</th>{grid.map((g) => <th key={g} scope="col" className="num">{g} °C</th>)}</tr></thead>
          <tbody>
            {CYCLES.map((c) => (
              <tr key={c}><th scope="row">{d.duty.labels[c]}</th>{grid.map((g) => <td key={g} className="num">{d.summary.duty_cycle_max_safe_peak_A[`${c}@${g}C`]}</td>)}</tr>
            ))}
          </tbody>
        </table>
        <ul>
          <li>Current levels step by 25 A inside the bench envelope (≤ {fmt(iMax, 0)} A), each run one hour long, from the coolant temperature.</li>
          <li>Limits are assumptions: winding {WL} °C as a class B insulation proxy, magnet {ML} °C as a demagnetisation-safe value that depends on the grade.</li>
          <li>The walking gait is a 1 Hz torque cycle represented by its RMS current at 1 s resolution. The duty cycles are constructed, not logged.</li>
          <li>The bench motor is a ~50 kW automotive-class machine, not a joint actuator: the method transfers, the fitted parameters do not.</li>
        </ul>
      </Details>
    </>
  );
}
