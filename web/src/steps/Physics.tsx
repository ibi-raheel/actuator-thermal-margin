import type { AllData } from "../data";
import { fmt } from "../ui/scale";
import { published } from "../ui/models";
import { Details } from "../ui/controls";

// zig-zag resistor between two points (horizontal or vertical), body length 44
function Res({ x1, y1, x2, y2, dashed }: { x1: number; y1: number; x2: number; y2: number; dashed?: boolean }) {
  const horiz = y1 === y2;
  const len = horiz ? x2 - x1 : y2 - y1;
  const mid = len / 2;
  const body = 44, n = 6, amp = 8;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const s = mid - body / 2 + (body * i) / n;
    const o = i === 0 || i === n ? 0 : i % 2 ? amp : -amp;
    pts.push(horiz ? `${x1 + s},${y1 + o}` : `${x1 + o},${y1 + s}`);
  }
  const a = horiz ? `M${x1},${y1} H${x1 + mid - body / 2}` : `M${x1},${y1} V${y1 + mid - body / 2}`;
  const b = horiz ? `M${x1 + mid + body / 2},${y1} H${x2}` : `M${x1},${y1 + mid + body / 2} V${y2}`;
  return <g className={dashed ? "wire faint" : "wire"}><path d={a} /><polyline points={pts.join(" ")} /><path d={b} /></g>;
}
// capacitor hanging down from (x, y) to a ground glyph
function Cap({ x, y, len = 70 }: { x: number; y: number; len?: number }) {
  const m = y + len / 2;
  return (
    <g className="wire">
      <path d={`M${x},${y} V${m - 4} M${x - 13},${m - 4} H${x + 13} M${x - 13},${m + 4} H${x + 13} M${x},${m + 4} V${y + len}`} />
      <path d={`M${x - 11},${y + len} H${x + 11} M${x - 7},${y + len + 5} H${x + 7} M${x - 3},${y + len + 10} H${x + 3}`} />
    </g>
  );
}
function Heat({ x1, y1, x2, y2, label, lx, ly }: { x1: number; y1: number; x2: number; y2: number; label: string; lx: number; ly: number }) {
  return (
    <g className="heat-in">
      <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd="url(#arrow)" />
      <text x={lx} y={ly}>{label}</text>
    </g>
  );
}

export function Physics({ d }: { d: AllData }) {
  const P = d.summary.lptn_fit.params;
  const lptn = d.summary.models[0];
  const kj = (c: number) => fmt(c / 1000, 1);
  const parts = [
    { id: "R1", el: "Winding → tooth (slot insulation)", v: `${fmt(P.G_sw_st)} W/K` },
    { id: "R2", el: "Tooth → yoke (back iron)", v: `${fmt(P.G_st_sy)} W/K` },
    { id: "R3", el: "Yoke → coolant (housing)", v: `${fmt(P.G_sy_c)} W/K` },
    { id: "R4", el: "Magnet → tooth (air gap)", v: `${fmt(P.G_pm_st0, 2)} + ${fmt(P.G_pm_st1, 2)}·n W/K` },
    { id: "R5", el: "Magnet → coolant (shaft, bearings)", v: `${fmt(P.G_pm_c, 2)} + ${fmt(P.G_pm_c1, 2)}·n W/K` },
    { id: "R6", el: "Winding → coolant (end winding)", v: `${fmt(P.G_sw_c, 3)} W/K, fitted to ≈ 0` },
    { id: "C1", el: "Magnet", v: `${kj(P.C_pm)} kJ/K` },
    { id: "C2", el: "Winding", v: `${kj(P.C_sw)} kJ/K` },
    { id: "C3", el: "Stator tooth", v: `${kj(P.C_st)} kJ/K` },
    { id: "C4", el: "Stator yoke", v: `${kj(P.C_sy)} kJ/K` },
  ];

  return (
    <>
      <p className="lede">
        Four nodes, six thermal resistances and four heat capacities, driven by copper and iron losses and fitted to {d.summary.dataset.train_profiles + d.summary.dataset.val_profiles.length} bench runs.
        On the held-out runs it misses by {fmt(lptn.mse_K2, 2)} K² on average and {fmt(lptn.max_K)} K at worst.
      </p>
      <div className="figure circuit">
        <div className="circuit-scroll" tabIndex={0} aria-label="Thermal network schematic, scrolls sideways on small screens">
        <svg viewBox="0 0 580 330" className="circuit-svg" role="img"
          aria-label="Thermal network schematic: magnet, winding, stator tooth and stator yoke nodes joined by thermal resistances R1 to R6, each with a heat capacity to ground, and a coolant rail.">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="arrowhead" />
            </marker>
          </defs>
          {/* coolant rail */}
          <line x1={30} y1={300} x2={560} y2={300} className="rail-line" />
          <text x={30} y={322} className="sch-label">Coolant T<tspan dy={4} fontSize="10">c</tspan><tspan dy={-4} dx={5}>(measured boundary)</tspan></text>

          <Res x1={100} y1={180} x2={300} y2={180} />
          <Res x1={300} y1={180} x2={470} y2={180} />
          <Res x1={300} y1={70} x2={300} y2={180} />
          <Res x1={470} y1={180} x2={470} y2={300} />
          <Res x1={100} y1={180} x2={100} y2={300} />
          <g className="wire faint"><path d="M300,70 H556" /></g>
          <Res x1={556} y1={70} x2={556} y2={300} dashed />

          <g className="wire"><path d="M100,180 H50" /><path d="M300,70 H230" /><path d="M470,180 H510" /></g>
          <Cap x={50} y={180} len={62} />
          <Cap x={230} y={70} len={62} />
          <Cap x={300} y={180} len={62} />
          <Cap x={510} y={180} len={62} />

          <Heat x1={300} y1={16} x2={300} y2={60} label="P Cu" lx={308} ly={30} />
          <Heat x1={356} y1={134} x2={309} y2={172} label="P Fe" lx={352} ly={128} />
          <Heat x1={420} y1={134} x2={462} y2={172} label="P Fe" lx={392} ly={128} />
          <Heat x1={150} y1={134} x2={108} y2={172} label="P rotor" lx={140} ly={128} />

          {[["Magnet", 100, 180], ["Winding", 300, 70], ["Tooth", 300, 180], ["Yoke", 470, 180]].map(([n, x, y]) => (
            <g key={n as string}>
              <circle cx={x as number} cy={y as number} r={6} className="node" />
              <text x={(x as number) + (n === "Winding" ? 12 : n === "Yoke" ? 12 : -10)} y={(y as number) + (n === "Winding" ? -10 : -12)}
                textAnchor={n === "Winding" || n === "Yoke" ? "start" : "end"} className="node-label">{n as string}</text>
            </g>
          ))}
          {[["R4", 200, 166], ["R2", 385, 166], ["R1", 312, 129], ["R3", 458, 245], ["R5", 112, 245], ["R6", 532, 160], ["C1", 66, 216], ["C2", 246, 106], ["C3", 316, 216], ["C4", 527, 214]].map(([t, x, y]) => (
            <text key={t as string} x={x as number} y={y as number} className="designator" textAnchor={t === "R4" || t === "R2" ? "middle" : t === "R3" ? "end" : "start"}>{t as string}</text>
          ))}
        </svg>
        </div>
        <p className="circuit-hint" aria-hidden="true">Swipe to pan the schematic</p>
      </div>
      <Details summary="Fitted values and equations">
        <div className="parts-wrap in-details">
          {[["Thermal conductances G = 1/R (fitted)", parts.slice(0, 6)], ["Heat capacities (fitted)", parts.slice(6)]].map(([cap, rows]) => (
            <table className="parts" key={cap as string}>
              <caption>{cap as string}</caption>
              <tbody>
                {(rows as typeof parts).map((r) => (
                  <tr key={r.id}><td className="ref">{r.id}</td><td>{r.el}</td><td className="num">{r.v}</td></tr>
                ))}
              </tbody>
            </table>
          ))}
          <p className="parts-note">n is speed in krpm. A conductance G is the inverse of a thermal resistance.</p>
        </div>

        <p>Each node obeys an energy balance, with n the speed in krpm:</p>
        <pre className="eq">{`C_i dT_i/dt = P_i − Σ_j G_ij (T_i − T_j) − G_i,c (T_i − T_c)

P_SW = 3/2 · R0 (1 + α_Cu (T_SW − 20 °C)) · i_s²     α_Cu = 0.00393 1/K
P_ST = k1·n + k2·n² + k3·i_s²·n
P_SY = k4·n + k5·n²
P_PM = k6·n² + k7·i_s²·n`}</pre>
        <ul>
          <li>Integrated with backward Euler, which is unconditionally stable: one 4×4 linear solve per step, 10 s for fitting and 0.5 s for evaluation.</li>
          <li>Fitted by trust-region least squares over the log-parameters on all four temperatures ({d.summary.lptn_fit.nfev} function evaluations, training MSE {fmt(d.summary.lptn_fit.train_mse_K2, 2)} K²).</li>
          <li>Temperatures alone cannot fix the watt scale, so the phase resistance R0 is pinned at an assumed {fmt(P.R0 * 1000, 0)} mΩ. That sets absolute watts only; predicted temperatures are unaffected.</li>
          <li>The network is coarse. A published expert-designed network with more structure reaches {fmt(published(d, "LPTN").mse_K2, 2)} K² on the same runs.</li>
        </ul>
      </Details>
    </>
  );
}
