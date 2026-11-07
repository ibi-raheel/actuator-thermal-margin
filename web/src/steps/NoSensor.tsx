import type { AllData } from "../data";
import { HEAT_CSS, HEAT_DOMAIN, heat } from "../ui/heat";
import { fmt, mmss } from "../ui/scale";
import { Details } from "../ui/controls";

const RUN = 60;
const C = 200;

function ring(r0: number, r1: number) {
  return `M${C + r1},${C} A${r1},${r1} 0 1 0 ${C - r1},${C} A${r1},${r1} 0 1 0 ${C + r1},${C} Z M${C + r0},${C} A${r0},${r0} 0 1 1 ${C - r0},${C} A${r0},${r0} 0 1 1 ${C + r0},${C} Z`;
}
function arc(r0: number, r1: number, a0: number, a1: number) {
  const p = (r: number, a: number) => `${(C + r * Math.cos(a)).toFixed(2)},${(C + r * Math.sin(a)).toFixed(2)}`;
  return `M${p(r1, a0)} A${r1},${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0},${r0} 0 0 0 ${p(r0, a0)} Z`;
}

export function NoSensor({ d }: { d: AllData }) {
  const p = d.profiles.profiles.find((x) => x.profile === RUN)!;
  const sw = p.measured.stator_winding;
  const k = sw.indexOf(Math.max(...sw));
  const T = {
    pm: p.measured.pm[k], sw: sw[k], st: p.measured.stator_tooth[k], sy: p.measured.stator_yoke[k], c: p.coolant_C[k],
  };
  const teeth = 12;
  const magnets = 8;

  const legend = [
    { k: "Winding", t: T.sw, note: "thermocouple" },
    { k: "Stator tooth", t: T.st, note: "thermocouple" },
    { k: "Stator yoke", t: T.sy, note: "thermocouple" },
    { k: "Coolant", t: T.c, note: "inlet sensor" },
    { k: "Magnet", t: T.pm, note: "bench telemetry only", warn: true },
  ];

  return (
    <>
      <p className="lede">
        The magnet spins on the rotor, so in a sealed actuator nothing can touch it. The bench reads it by telemetry; a production unit has to infer it from current, voltage and speed.
      </p>
      <div className="figure cutaway">
        <svg viewBox="0 0 400 400" overflow="visible" className="cutaway-svg" role="img"
          aria-label={`Cross-section of the motor at minute ${mmss(p.t_s[k])} of run ${RUN}, coloured by measured temperature. Winding ${fmt(T.sw)} °C, magnet ${fmt(T.pm)} °C.`}>
          <defs>
            <pattern id="hatch-shaft" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="5" className="hatch" />
            </pattern>
          </defs>
          {/* housing with coolant channels */}
          <path d={ring(170, 192)} fill="#c9d1c6" className="edge" fillRule="evenodd" />
          {Array.from({ length: 24 }, (_, i) => {
            const a = (i / 24) * Math.PI * 2;
            return <circle key={i} cx={C + 181 * Math.cos(a)} cy={C + 181 * Math.sin(a)} r={5.2} fill={heat(T.c)} className="edge-thin" />;
          })}
          {/* stator yoke */}
          <path d={ring(140, 170)} fill={heat(T.sy)} className="edge" fillRule="evenodd" />
          {/* winding fills the slot band, teeth drawn over it */}
          <path d={ring(101, 140)} fill={heat(T.sw)} className="edge" fillRule="evenodd" />
          {Array.from({ length: teeth }, (_, i) => {
            const a = (i / teeth) * 360;
            return (
              <g key={i} transform={`rotate(${a} ${C} ${C})`}>
                <path d={`M${C + 101},${C - 9} L${C + 141},${C - 6.5} L${C + 141},${C + 6.5} L${C + 101},${C + 9} Z`} fill={heat(T.st)} className="edge-thin" />
              </g>
            );
          })}
          {/* air gap */}
          <circle cx={C} cy={C} r={101} fill="none" className="edge" />
          {/* rotor iron and magnets */}
          <circle cx={C} cy={C} r={95} fill="#d3dace" className="edge" />
          {Array.from({ length: magnets }, (_, i) => {
            const a0 = (i / magnets) * Math.PI * 2 + 0.08;
            const a1 = ((i + 1) / magnets) * Math.PI * 2 - 0.08;
            return <path key={i} d={arc(80, 94, a0, a1)} fill={heat(T.pm)} className="edge-mag" />;
          })}
          <circle cx={C} cy={C} r={24} fill="url(#hatch-shaft)" className="edge" />
          {/* callout to the magnet */}
          <g className="callout">
            <path d={`M${C + 87 * Math.cos(-Math.PI / 8 - Math.PI / 2) + 10},${C + 87 * Math.sin(-Math.PI / 8 - Math.PI / 2) - 8} L${C + 92},${C - 168} H${C + 196}`} />
            <text x={C + 196} y={C - 174} textAnchor="end">magnet: no sensor</text>
          </g>
          {/* "no sensor" marker on one magnet */}
          <g className="nosensor">
            <circle cx={C + 87 * Math.cos(-Math.PI / 8 - Math.PI / 2)} cy={C + 87 * Math.sin(-Math.PI / 8 - Math.PI / 2)} r={13} />
            <line x1={C + 87 * Math.cos(-Math.PI / 8 - Math.PI / 2) - 9} y1={C + 87 * Math.sin(-Math.PI / 8 - Math.PI / 2) + 9}
              x2={C + 87 * Math.cos(-Math.PI / 8 - Math.PI / 2) + 9} y2={C + 87 * Math.sin(-Math.PI / 8 - Math.PI / 2) - 9} />
          </g>
        </svg>
        <div className="cutaway-side">
          <p className="cutaway-when">Run {RUN}, minute {mmss(p.t_s[k])}: the winding’s hottest moment.</p>
          <ul className="cutaway-legend">
            {legend.map((l) => (
              <li key={l.k} className={l.warn ? "warn" : ""}>
                <span className="swatch" style={{ background: heat(l.t) }} />
                <span className="cl-name">{l.k}</span>
                <span className="cl-val">{fmt(l.t)} °C</span>
                <span className="cl-note">{l.note}</span>
              </li>
            ))}
          </ul>
          <div className="heat-scale" aria-hidden="true">
            <div className="heat-bar" style={{ background: HEAT_CSS }} />
            <div className="heat-ticks"><span>{HEAT_DOMAIN[0]} °C</span><span>75</span><span>{HEAT_DOMAIN[1]} °C</span></div>
          </div>
        </div>
      </div>
      <Details>
        <p>
          The drawing is schematic: each region is filled with its measured temperature at one instant, not a field solution.
          The rotor iron and shaft carry no sensor and are left uncoloured.
        </p>
        <p>
          The magnet reading is a single point on the rotor, so it is not the hot spot. Magnets lose strength as they heat,
          and the safe limit depends on the grade; this page assumes 100 °C. The winding limit assumed is 130 °C, a class B insulation proxy.
        </p>
      </Details>
    </>
  );
}
