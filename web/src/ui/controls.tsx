import type { ReactNode } from "react";

export function Details({ summary = "Show details", children }: { summary?: string; children: ReactNode }) {
  return (
    <details className="details">
      <summary>
        <svg className="details-caret" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.5 8 6l-4 3.5" /></svg>
        {summary}
      </summary>
      <div className="details-body">{children}</div>
    </details>
  );
}

export function Segmented<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      <span className="ctl-label">{label}</span>
      <div className="seg-opts">
        {options.map((o) => (
          <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value}
            className="seg-btn" onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

/** Range slider that snaps to a fixed list of stops, with labelled ticks. */
export function Stops({ label, stops, index, onChange, format }: {
  label: string; stops: number[]; index: number; onChange: (i: number) => void; format: (v: number) => string;
}) {
  return (
    <div className="stops">
      <label className="ctl-label" htmlFor={`stops-${label}`}>{label}</label>
      <div className="stops-track">
        <input id={`stops-${label}`} type="range" min={0} max={stops.length - 1} step={1} value={index}
          aria-valuetext={format(stops[index])} onChange={(e) => onChange(+e.target.value)} />
        <div className="stops-ticks" aria-hidden="true">
          {stops.map((s, i) => (
            <button key={s} type="button" tabIndex={-1} className={i === index ? "on" : ""} onClick={() => onChange(i)}
              style={{ left: `${(i / (stops.length - 1)) * 100}%` }}>{format(s)}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
