export type Scale = ((v: number) => number) & { domain: [number, number]; range: [number, number] };

export function linear(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = ((v: number) => r0 + (v - d0) * k) as Scale;
  f.domain = domain;
  f.range = range;
  return f;
}

/** Round tick values covering [a, b]. */
export function ticks(a: number, b: number, count = 5): number[] {
  const span = b - a;
  if (span <= 0) return [a];
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

export function path(xs: number[], ys: number[], x: (v: number) => number, y: (v: number) => number, stride = 1): string {
  let d = "";
  for (let i = 0; i < xs.length; i += stride) {
    d += (i === 0 ? "M" : "L") + x(xs[i]).toFixed(1) + "," + y(ys[i]).toFixed(1);
  }
  return d;
}

export const extent = (arrs: number[][]): [number, number] => {
  let lo = Infinity, hi = -Infinity;
  for (const a of arrs) for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return [lo, hi];
};

export const mmss = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

export const fmt = (v: number, d = 1) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
