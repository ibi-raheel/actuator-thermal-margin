// Placeholder page: loads the precomputed pipeline results. The full viewer comes later.
type Row = { model: string; mse_K2: number; max_K: number };
type Summary = { dataset: { rows: number; profiles: number; hours: number; test_profiles: number[] };
  models: Row[]; benchmark_published: Row[] };

const app = document.getElementById("app")!;

function table(rows: Row[]): string {
  const body = rows.map((r) => `<tr><td>${r.model}</td><td>${r.mse_K2.toFixed(2)}</td><td>${r.max_K.toFixed(1)}</td></tr>`).join("");
  return `<table><thead><tr><th>Estimator</th><th>MSE (K²)</th><th>Max error (K)</th></tr></thead><tbody>${body}</tbody></table>`;
}

fetch("/data/summary.json")
  .then((r) => r.json() as Promise<Summary>)
  .then((s) => {
    app.innerHTML = `<h1>Actuator Thermal Margin</h1>
      <p>Virtual temperature sensor for permanent-magnet motors. ${s.dataset.rows.toLocaleString()} samples,
      ${s.dataset.profiles} test-bench profiles, ${s.dataset.hours} h. Held-out profiles ${s.dataset.test_profiles.join(", ")}.</p>
      <h2>Held-out error, this repo</h2>${table(s.models)}
      <h2>Published reference</h2>${table(s.benchmark_published)}
      <p>Data: Electric Motor Temperature, Paderborn University LEA, CC BY-SA 4.0.</p>`;
  })
  .catch(() => { app.textContent = "Results not found. Run the pipeline first."; });
