// Semantic heat ramp (pale straw -> deep oxide red), monotonic in lightness. Always shown with its scale legend.
const STOPS = ["#f3eccd", "#f0cf7a", "#e59a3c", "#c85a22", "#93281a", "#5c1410"];
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const HEAT_DOMAIN: [number, number] = [20, 130];

export function heat(tC: number, domain = HEAT_DOMAIN): string {
  const u = Math.min(1, Math.max(0, (tC - domain[0]) / (domain[1] - domain[0])));
  const s = u * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(s));
  const f = s - i;
  const a = hex(STOPS[i]), b = hex(STOPS[i + 1]);
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(",")})`;
}

export const HEAT_CSS = `linear-gradient(90deg, ${STOPS.join(", ")})`;
/** Text colour that stays legible on a heat fill. */
export const inkOn = (tC: number, domain = HEAT_DOMAIN) => ((tC - domain[0]) / (domain[1] - domain[0]) > 0.55 ? "#fbf7ea" : "#1b2430");
