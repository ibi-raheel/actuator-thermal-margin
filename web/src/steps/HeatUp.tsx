import type { AllData } from "../data";
import { useReducedMotion, useSeen, useWidth } from "../ui/hooks";
import { extent, fmt, linear, path, ticks } from "../ui/scale";
import { Details } from "../ui/controls";

const RUN = 60;

export function HeatUp({ d }: { d: AllData }) {
  const p = d.profiles.profiles.find((x) => x.profile === RUN)!;
  const [wrap, w] = useWidth<HTMLDivElement>();
  const [seenRef, seen] = useSeen<HTMLDivElement>();
  const reduce = useReducedMotion();

  const rows = [
    { key: "cur", name: "Current", unit: "A", v: p.i_s_A, ch: "CH0" },
    { key: "pm", name: "Magnet", unit: "°C", v: p.measured.pm, ch: "CH1" },
    { key: "sw", name: "Winding", unit: "°C", v: p.measured.stator_winding, ch: "CH2" },
    { key: "st", name: "Stator tooth", unit: "°C", v: p.measured.stator_tooth, ch: "CH3" },
    { key: "sy", name: "Stator yoke", unit: "°C", v: p.measured.stator_yoke, ch: "CH4" },
    { key: "c", name: "Coolant", unit: "°C", v: p.coolant_C, ch: "CH5" },
  ];
  const H = 58, G = 6, top = 4, axis = 26;
  const height = top + rows.length * (H + G) + axis;
  const tmin = p.t_s.map((t) => t / 60);
  const x = linear([0, tmin[tmin.length - 1]], [0, w]);
  const wPeak = Math.max(...p.measured.stator_winding);
  const mPeak = Math.max(...p.measured.pm);
  const show = seen || reduce;

  return (
    <>
      <p className="lede">
        Under load, copper and iron losses heat the motor. On this bench run the winding climbs to {fmt(wPeak)} °C and the magnet to {fmt(mPeak)} °C over two hours.
      </p>
      <div className="figure paper-strip" ref={seenRef}>
        <div className="strip-head" aria-hidden="true">
          <span>Run {RUN}</span><span>held out</span><span>2 Hz, shown at 10 s</span>
        </div>
        <div ref={wrap} className="strip-plot">
          <svg width={w} height={height} role="img" aria-label={`Thermocouple log of run ${RUN}: current, magnet, winding, stator tooth, stator yoke and coolant over ${Math.round(tmin[tmin.length - 1])} minutes.`}>
            <g className={`pen-reveal${show ? " in" : ""}${reduce ? " instant" : ""}`}>
              {rows.map((r, i) => {
                const y0 = top + i * (H + G);
                // each channel autoscales, as on a multichannel recorder
                const ext = extent([r.v]);
                const y = linear(ext, [y0 + H - 4, y0 + 17]);
                return (
                  <g key={r.key}>
                    <rect className="strip-bg" x={0} y={y0} width={w} height={H} />
                    <path d={path(tmin, r.v, x, y)} className={r.key === "cur" ? "trace trace-cur" : "trace"} />
                    <text className="strip-ch" x={6} y={y0 + 11}>{r.ch}</text>
                    <text className="strip-name" x={36} y={y0 + 11}>{r.name}</text>
                    <text className="strip-val" x={w - 6} y={y0 + 11} textAnchor="end">{fmt(ext[0], r.key === "cur" ? 0 : 1)} → {fmt(ext[1], r.key === "cur" ? 0 : 1)} {r.unit}</text>
                  </g>
                );
              })}
            </g>
            <g className="axis" transform={`translate(0 ${top + rows.length * (H + G)})`}>
              {ticks(0, tmin[tmin.length - 1], w < 500 ? 4 : 8).map((t) => (
                <g key={t} transform={`translate(${x(t)} 0)`}>
                  <line y1={-4} y2={0} />
                  <text y={14} textAnchor={t === 0 ? "start" : "middle"}>{t}{t === 0 ? " min" : ""}</text>
                </g>
              ))}
            </g>
          </svg>
        </div>
      </div>
      <Details>
        <p>
          The dataset logs a ~50 kW automotive-class permanent-magnet synchronous motor on a test bench, water-cooled through the housing:
          {" "}{d.summary.dataset.rows.toLocaleString("en-US")} rows at 2 Hz across {d.summary.dataset.profiles} runs ({fmt(d.summary.dataset.hours)} h).
          Inputs are the d/q voltages and currents, speed, coolant and ambient temperature. Targets are thermocouples on the winding, stator tooth and stator yoke,
          and a telemetry reading of the magnet.
        </p>
        <p>
          Runs {d.summary.dataset.test_profiles.join(", ")} are the dataset’s standard held-out set. No model on this page was trained on them;
          runs {d.summary.dataset.val_profiles.join(" and ")} chose the ridge penalty and the other {d.summary.dataset.train_profiles} trained the models.
          The split is by whole run, never by row.
        </p>
        <p>Each strip autoscales between its own minimum and maximum, printed at its right edge, the way a multichannel recorder is usually set up.</p>
      </Details>
    </>
  );
}
