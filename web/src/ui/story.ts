import type { AllData } from "../data";
import { modelRow, published } from "./models";

/** Headline numbers for the hero and the closing step, all read from the shipped JSON. */
export function storyNumbers(d: AllData) {
  const auc = (L: number, defect: string) => d.eol.by_length.find((r) => r.test_s === L)!.defects[defect].auc;
  const runs = d.duty.runs;
  const crossed = runs.filter((r) => r.t_magnet_limit_s !== null || r.t_winding_limit_s !== null);
  const magnetFirst = crossed.filter((r) => r.t_magnet_limit_s !== null
    && (r.t_winding_limit_s === null || r.t_magnet_limit_s < r.t_winding_limit_s));
  const windingNever = magnetFirst.filter((r) => r.t_winding_limit_s === null);
  const gait = runs.find((r) => r.duty_cycle === "walking_gait" && r.coolant_C === 90 && r.i_peak_A === 100)!;
  return {
    blendMse: modelRow(d, "blend").mse_K2,
    blendMax: modelRow(d, "blend").max_K,
    pubMse: published(d, "Thermal").mse_K2,
    aucR30: auc(30, "winding_resistance_+8pct"),
    aucVoid30: auc(30, "yoke_interface_-30pct"),
    aucVoid600: auc(600, "yoke_interface_-30pct"),
    crossed: crossed.length,
    magnetFirst: magnetFirst.length,
    windingOnlyPasses: windingNever.length,
    gaitMagnetMargin: gait.magnet_margin_K,
    gaitWindingMargin: gait.winding_margin_K,
  };
}
