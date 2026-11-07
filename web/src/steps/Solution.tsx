import type { AllData } from "../data";
import { fmt } from "../ui/scale";
import { storyNumbers } from "../ui/story";

export function Solution({ d }: { d: AllData }) {
  const s = storyNumbers(d);
  const decisions = [
    {
      h: "How to infer the magnet",
      body: <>Average the physics network with the learned models for monitoring. Use the physics residual for pass/fail, because the average’s worst miss is {fmt(s.blendMax)} K.</>,
      ro: [{ k: "Blend", v: fmt(s.blendMse, 2), u: "K²" }],
    },
    {
      h: "How long to test",
      body: <>Resistance or crimp defects: 30 s. Slot impregnation: 1–2 min. Housing-interface voids: about 10 min, or a hot soak. A short test cannot see them.</>,
      ro: [{ k: "Resistance", v: "30", u: "s" }, { k: "Slot", v: "1–2", u: "min" }, { k: "Housing void", v: "~10", u: "min" }],
    },
    {
      h: "How to derate",
      body: <>Rate on the magnet. At 100 A on the walking gait with 90 °C coolant, the magnet has {fmt(s.gaitMagnetMargin)} K of margin and the winding has {fmt(s.gaitWindingMargin)} K.</>,
      ro: [{ k: "Magnet", v: fmt(s.gaitMagnetMargin), u: "K" }, { k: "Winding", v: fmt(s.gaitWindingMargin), u: "K" }],
    },
  ];

  return (
    <>
      <p className="lede">Three decisions, each backed by the steps above.</p>
      <ol className="figure recipe">
        {decisions.map((r, i) => (
          <li key={r.h} className="recipe-row">
            <span className="tag">{i + 1}</span>
            <div className="recipe-text">
              <h3>{r.h}</h3>
              <p>{r.body}</p>
            </div>
            <div className="readout recipe-ro">
              {r.ro.map((c) => (
                <span className="ro-cell" key={c.k}>
                  <span className="ro-k">{c.k}</span>
                  <span className="ro-v">{c.v}<small>{c.u}</small></span>
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <div className="tool">
        <p className="ctl-label">The tool</p>
        <pre className="eq">{`python -m pipeline.thermal_check margin cycle.csv --max-safe
python -m pipeline.thermal_check screen eol_logs.csv --test-s 30`}</pre>
        <p className="tool-note">
          <b>margin</b> returns the peak temperatures, the binding limit and the safe peak current.
          {" "}<b>screen</b> returns a ranked queue with PASS or FAIL-investigate per unit.
        </p>
      </div>
      <p className="verdict">This runs on public bench data. On a real line, the first week is one actuator type’s test history in, one-page recipe out.</p>
    </>
  );
}
