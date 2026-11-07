import type { AllData } from "../data";
import { fmt } from "../ui/scale";
import { Details } from "../ui/controls";
import { MODEL_META, modelRow, published } from "../ui/models";

type Row = { name: string; mine: boolean; mse: number; max: number; color?: string; key?: string };

export function Blend({ d }: { d: AllData }) {
  const rows: Row[] = [
    { name: "Blend of the three", mine: true, mse: modelRow(d, "blend").mse_K2, max: modelRow(d, "blend").max_K, color: MODEL_META.blend.color, key: "blend" },
    { name: "Thermal neural network", mine: false, mse: published(d, "Thermal").mse_K2, max: published(d, "Thermal").max_K },
    { name: "Expert thermal network", mine: false, mse: published(d, "LPTN").mse_K2, max: published(d, "LPTN").max_K },
    { name: "1D-CNN", mine: false, mse: published(d, "1D-CNN").mse_K2, max: published(d, "1D-CNN").max_K },
    { name: "Linear (OLS)", mine: false, mse: published(d, "OLS").mse_K2, max: published(d, "OLS").max_K },
    { name: "MLP", mine: false, mse: published(d, "MLP").mse_K2, max: published(d, "MLP").max_K },
    { name: "Ridge", mine: true, mse: modelRow(d, "ridge").mse_K2, max: modelRow(d, "ridge").max_K, color: "var(--ink-2)" },
    { name: "ML: boosted trees", mine: true, mse: modelRow(d, "gbm").mse_K2, max: modelRow(d, "gbm").max_K, color: MODEL_META.gbm.color },
    { name: "Physics: 4-node network", mine: true, mse: modelRow(d, "lptn").mse_K2, max: modelRow(d, "lptn").max_K, color: MODEL_META.lptn.color },
  ].sort((a, b) => a.mse - b.mse);
  const mseMax = Math.max(...rows.map((r) => r.mse));
  const maxMax = Math.max(...rows.map((r) => r.max));
  const bl = rows.find((r) => r.key === "blend")!;
  const tnn = published(d, "Thermal");

  return (
    <>
      <p className="lede">
        Physics and learned errors are largely uncorrelated, so a plain average of the three lands at {fmt(bl.mse, 2)} K², beside the best published model at {fmt(tnn.mse_K2, 2)} K².
        Its worst miss is still {fmt(bl.max)} K against {fmt(tnn.max_K)} K.
      </p>
      <div className="figure rank" role="table" aria-label="Held-out error by estimator">
        <div className="rank-head" role="row">
          <span role="columnheader">Estimator</span>
          <span role="columnheader">Average error, MSE (K²)</span>
          <span role="columnheader">Worst-case error (K)</span>
        </div>
        {rows.map((r) => (
          <div key={r.name} className={`rank-row${r.key === "blend" ? " hi" : ""}${r.mine ? "" : " pub"}`} role="row">
            <span className="rank-name" role="rowheader">
              {r.name}<small>{r.mine ? "this project" : "published"}</small>
            </span>
            <span className="rank-cell" role="cell">
              <span className="track"><span className="bar" style={{ width: `${(r.mse / mseMax) * 100}%`, background: r.mine ? r.color : undefined }} /></span>
              <span className="bar-v">{fmt(r.mse, 2)}</span>
            </span>
            <span className="rank-cell" role="cell">
              <span className="track"><span className="bar" style={{ width: `${(r.max / maxMax) * 100}%`, background: r.mine ? r.color : undefined }} /></span>
              <span className="bar-v">{fmt(r.max)}</span>
            </span>
          </div>
        ))}
        <p className="rank-key"><span className="key-fill" /> this project <span className="key-hollow" /> published, same held-out runs</p>
      </div>
      <p className="verdict">
        For a derating or end-of-line call the worst case matters most, so the published thermal neural network remains the safer estimator.
        Each single model here is also weaker than its published counterpart.
      </p>
      <Details>
        <ul>
          <li>Both metrics are averaged over the four targets (magnet, winding, tooth, yoke) on held-out runs {d.summary.dataset.test_profiles.join(", ")}. The blend’s worst miss is on the magnet.</li>
          <li>The blend weights are fixed at one third each in advance, not fitted to the test runs.</li>
          <li>Published values: “Thermal neural networks: lumped-parameter thermal modelling with state-space machine learning”, <i>Engineering Applications of Artificial Intelligence</i> 117 (2023) 105537, Table III, on the dataset’s same held-out set.</li>
        </ul>
      </Details>
    </>
  );
}
