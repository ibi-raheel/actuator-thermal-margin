import type { AllData, ModelRow } from "../data";

export type ModelKey = "lptn" | "gbm" | "blend";
export const MODEL_META: Record<ModelKey, { label: string; long: string; color: string; match: string }> = {
  lptn: { label: "Physics", long: "4-node thermal network", color: "var(--phys)", match: "LPTN" },
  gbm: { label: "ML", long: "Gradient-boosted trees", color: "var(--ml)", match: "Gradient-boosted" },
  blend: { label: "Blend", long: "Average of physics, ridge and trees", color: "var(--blend)", match: "Average" },
};

export function modelRow(d: AllData, key: ModelKey | "ridge"): ModelRow {
  const m = key === "ridge" ? "Ridge" : MODEL_META[key].match;
  return d.summary.models.find((r) => r.model.startsWith(m))!;
}
export function published(d: AllData, prefix: string): ModelRow {
  return d.summary.benchmark_published.find((r) => r.model.startsWith(prefix))!;
}
