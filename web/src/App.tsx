import { useEffect, useState, type ReactNode } from "react";
import { loadAll, type AllData } from "./data";
import { useReducedMotion } from "./ui/hooks";
import { fmt } from "./ui/scale";
import { HeatUp } from "./steps/HeatUp";
import { NoSensor } from "./steps/NoSensor";
import { Physics } from "./steps/Physics";
import { Learned } from "./steps/Learned";
import { Blend } from "./steps/Blend";
import { Margin } from "./steps/Margin";
import { EndOfLine } from "./steps/EndOfLine";
import { HowWeKnow } from "./steps/HowWeKnow";

type StepDef = { id: string; title: string; render: (d: AllData) => ReactNode };

const STEPS: StepDef[] = [
  { id: "heat", title: "The actuator heats up", render: (d) => <HeatUp d={d} /> },
  { id: "sensor", title: "No sensor fits on the magnet", render: (d) => <NoSensor d={d} /> },
  { id: "physics", title: "A physics model", render: (d) => <Physics d={d} /> },
  { id: "learned", title: "A learned model", render: (d) => <Learned d={d} /> },
  { id: "blend", title: "Blend them", render: (d) => <Blend d={d} /> },
  { id: "margin", title: "Safe current for a walking gait", render: (d) => <Margin d={d} /> },
  { id: "eol", title: "An end-of-line screen", render: (d) => <EndOfLine d={d} /> },
  { id: "proof", title: "How we know", render: (d) => <HowWeKnow d={d} /> },
];

export function App() {
  const [data, setData] = useState<AllData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => { loadAll().then(setData).catch((e) => setErr(String(e.message ?? e))); }, []);

  useEffect(() => {
    if (!data) return;
    const els = STEPS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(STEPS.findIndex((s) => s.id === e.target.id));
    }, { rootMargin: "-40% 0px -55% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [data]);

  const go = (i: number) => {
    document.getElementById(STEPS[i].id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  return (
    <>
      <header className="bezel">
        <div className="bezel-inner">
          <h1>Actuator Thermal Margin</h1>
          <p className="bezel-sub">A virtual temperature sensor for permanent-magnet actuators, built on real motor test-bench data.</p>
          {data && (
            <dl className="bezel-log" aria-label="Bench log">
              <div><dt>Samples</dt><dd>{data.summary.dataset.rows.toLocaleString("en-US")}</dd></div>
              <div><dt>Runs</dt><dd>{data.summary.dataset.profiles}</dd></div>
              <div><dt>Logged</dt><dd>{fmt(data.summary.dataset.hours)} h</dd></div>
              <div><dt>Held-out runs</dt><dd>{data.summary.dataset.test_profiles.join(", ")}</dd></div>
            </dl>
          )}
        </div>
      </header>

      <div className="progress" aria-hidden="true">
        <div className="progress-bar" style={{ transform: `scaleX(${(active + 1) / STEPS.length})` }} />
        <span className="progress-label"><b>{active + 1}/{STEPS.length}</b> {STEPS[active].title}</span>
      </div>

      <div className="layout">
        <nav className="rail" aria-label="Steps">
          <ol>
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} aria-current={i === active ? "step" : undefined}
                  className={i < active ? "done" : ""}
                  onClick={(e) => { e.preventDefault(); go(i); }}>
                  <span className="tag">{i + 1}</span>
                  <span className="rail-title">{s.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <main className="steps">
          {err && <p className="state-msg">The precomputed results could not be loaded ({err}). Run the pipeline to regenerate <code>public/data/</code>.</p>}
          {!data && !err && <p className="state-msg">Loading bench data…</p>}
          {data && STEPS.map((s, i) => (
            <section key={s.id} id={s.id} className="step" aria-labelledby={`${s.id}-h`}>
              <h2 id={`${s.id}-h`} className="step-h"><span className="tag">{i + 1}</span>{s.title}</h2>
              {s.render(data)}
            </section>
          ))}
          {data && <Footer />}
        </main>
      </div>
    </>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <p>
        Data: <a href="https://www.kaggle.com/datasets/wkirgsn/electric-motor-temperature" rel="noopener">Electric Motor Temperature</a>,
        {" "}LEA department, Paderborn University, licensed <a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener">CC BY-SA 4.0</a>.
        The derived data on this page is shared under the same licence. Published reference results: “Thermal neural networks”,
        {" "}<i>Engineering Applications of Artificial Intelligence</i> 117 (2023) 105537.
      </p>
      <p>Duty cycles are constructed and the end-of-line units are simulated on top of the fitted model; both are labelled where they appear.</p>
      <p className="foot-more">More work at <a href="https://ibiraheel.com">ibiraheel.com</a></p>
    </footer>
  );
}
