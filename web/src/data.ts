// Types and loader for the static JSON the pipeline writes to public/data/.
// The page only reads these numbers; it never recomputes a reported metric.

export type Channel = "pm" | "stator_winding" | "stator_tooth" | "stator_yoke";
export const CHANNELS: Channel[] = ["pm", "stator_winding", "stator_tooth", "stator_yoke"];
export type ChannelSeries = Record<Channel, number[]>;

export interface Profile {
  profile: number;
  t_s: number[];
  i_s_A: number[];
  speed_rpm: number[];
  torque_Nm: number[];
  coolant_C: number[];
  measured: ChannelSeries;
  lptn: ChannelSeries;
  ridge: ChannelSeries;
  gbm: ChannelSeries;
}
export interface ProfilesFile {
  labels: Record<Channel, string>;
  profiles: Profile[];
}

export interface ModelRow {
  model: string;
  mse_K2: number;
  max_K: number;
  per_target?: Record<Channel, { mse_K2: number; max_K: number }>;
}

export interface Summary {
  dataset: { rows: number; profiles: number; hours: number; train_profiles: number; val_profiles: number[]; test_profiles: number[] };
  models: ModelRow[];
  benchmark_published: ModelRow[];
  ridge_alpha: number;
  lptn_fit: { train_mse_K2: number; nfev: number; resolution_s: number; params: Record<string, number> };
  validation: {
    energy_balance: { loss_J: number; stored_J: number; to_coolant_J: number; rel_residual: number };
    plateau_hand_calc: {
      profile: number; window_s: [number, number]; i_s_A: number; speed_rpm: number; coolant_C: number; R_ohm: number;
      P_cu_W: number; P_tooth_W: number; R_series_K_per_W: number; measured_rise_K: number; hand_calc_rise_K: number;
      network_steady_state_rise_K: number; hand_vs_measured_K: number;
    };
  };
  duty_cycle_max_safe_peak_A: Record<string, number>;
  ewma_spans: number[];
}

export interface DutyRun {
  duty_cycle: string;
  i_peak_A: number;
  coolant_C: number;
  peak_winding_C: number;
  peak_magnet_C: number;
  winding_margin_K: number;
  magnet_margin_K: number;
  t_winding_limit_s: number | null;
  t_magnet_limit_s: number | null;
  trace: { t_s: number[]; winding_C: number[]; magnet_C: number[] };
}
export interface DutyFile {
  limits: { winding_C: number; magnet_C: number; coolant_grid_C: number[] };
  labels: Record<string, string>;
  runs: DutyRun[];
}

export interface EolDefect { auc: number; tpr_at_1pct_fpr: number; residual_mean_K: number; roc: { fpr: number[]; tpr: number[] }; hist_bad: number[] }
export interface EolFile {
  synthetic: boolean;
  i_test_A: number;
  speed_krpm: number;
  noise_K: number;
  n_good: number;
  n_bad_per_defect: number;
  defects: Record<string, string>;
  by_length: { test_s: number; good_residual_K: { mean: number; std: number }; defects: Record<string, EolDefect>; hist_good: number[] }[];
}

export interface AllData { summary: Summary; profiles: ProfilesFile; duty: DutyFile; eol: EolFile }

async function get<T>(name: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`);
  if (!res.ok) throw new Error(`${name}.json: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function loadAll(): Promise<AllData> {
  const [summary, profiles, duty, eol] = await Promise.all([
    get<Summary>("summary"), get<ProfilesFile>("profiles"), get<DutyFile>("duty_cycles"), get<EolFile>("eol"),
  ]);
  return { summary, profiles, duty, eol };
}

export const CH_SHORT: Record<Channel, string> = {
  pm: "Magnet",
  stator_winding: "Winding",
  stator_tooth: "Tooth",
  stator_yoke: "Yoke",
};
