"use client";

import { useId, type CSSProperties } from "react";

type ProgressDay = {
  label: string;
  count: number;
  date: string;
};

type ProgressChartProps = {
  days: ProgressDay[];
  /** A daily limit in the same units as count. Pass rupee totals in spend mode. */
  limit: number;
  mode?: "count" | "spend";
  /** Today's calendar date (YYYY-MM-DD) in the tracker's chosen timezone. */
  today?: string;
};

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const number = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 1,
});

const chartStyles = `
  .progress-chart { margin: 0; min-width: 0; }
  .progress-chart__plot { position: relative; height: 198px; margin-inline-start: 36px; }
  .progress-chart__svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .progress-chart__tick { position: absolute; inset-inline-end: calc(100% + 12px); transform: translateY(-50%); color: var(--chart-text-secondary); font-size: 11px; font-variant-numeric: tabular-nums; letter-spacing: .02em; white-space: nowrap; }
  .progress-chart__columns { position: absolute; inset: 0; display: grid; gap: 0; }
  .progress-chart__column { position: relative; min-width: 0; }
  .progress-chart__value { position: absolute; inset-inline: 0; text-align: center; transform: translateY(-100%); color: var(--chart-text-primary); font-size: 12px; font-weight: 600; letter-spacing: .01em; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .progress-chart__days { display: grid; gap: 0; margin-inline-start: 36px; margin-block-start: 12px; }
  .progress-chart__day { min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--chart-text-secondary); font-size: 12px; line-height: 1.4; letter-spacing: .015em; }
  .progress-chart__day--today { color: var(--chart-accent); font-weight: 600; }
  .progress-chart__date { font-size: 11px; color: var(--chart-text-secondary); font-weight: 400; letter-spacing: .02em; }
  .progress-chart__footer { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; column-gap: 16px; row-gap: 12px; margin-block-start: 24px; }
  .progress-chart__legend { display: flex; flex-wrap: wrap; gap: 12px; margin: 0; color: var(--chart-text-secondary); font-size: 12px; line-height: 1.5; letter-spacing: .015em; }
  .progress-chart__legend-item { display: inline-flex; align-items: center; gap: 7px; }
  .progress-chart__swatch { display: inline-block; flex: none; width: 8px; height: 8px; border-radius: 2px; background: var(--chart-history); }
  .progress-chart__limit-key { width: 18px; height: 0; border-block-start: 2px dashed var(--chart-progress); }
  .progress-chart__details { color: var(--chart-text-secondary); font-size: 12px; line-height: 1.5; letter-spacing: .015em; }
  .progress-chart__details[open] { flex-basis: 100%; }
  .progress-chart__details summary { width: fit-content; min-height: 24px; cursor: pointer; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 4px; }
  .progress-chart__details summary:hover { color: var(--chart-text-primary); }
  .progress-chart__details summary:focus-visible { outline: 2px solid var(--chart-progress); outline-offset: 5px; border-radius: 2px; }
  .progress-chart__table { width: 100%; margin-block-start: 16px; border-collapse: collapse; font-size: 13px; line-height: 1.5; color: var(--chart-text-primary); }
  .progress-chart__table th, .progress-chart__table td { padding-block: 10px; text-align: start; border-block-end: 1px solid var(--chart-grid); }
  .progress-chart__table th { font-weight: 500; }
  .progress-chart__table td:last-child, .progress-chart__table th:last-child { text-align: end; font-variant-numeric: tabular-nums; }
  .progress-chart__empty { display: grid; align-content: center; justify-items: center; gap: 8px; min-height: 230px; padding: 24px; text-align: center; background: var(--chart-track); border-radius: 12px; }
  .progress-chart__empty strong { color: var(--chart-text-primary); font-size: 16px; font-weight: 500; }
  .progress-chart__empty p { margin: 0; color: var(--chart-text-secondary); font-size: 14px; line-height: 1.5; }
  .progress-chart__sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  @media (max-width: 420px) {
    .progress-chart__plot { height: 166px; margin-inline-start: 28px; }
    .progress-chart__days { margin-inline-start: 28px; }
    .progress-chart__tick { inset-inline-end: calc(100% + 8px); font-size: 10px; }
    .progress-chart__value { font-size: 11px; }
    .progress-chart__footer { margin-block-start: 20px; }
  }
`;

function dateParts(date: string) {
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00Z` : date);
  if (Number.isNaN(parsed.getTime())) return { full: date, short: "" };
  return {
    full: new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(parsed),
    short: new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      timeZone: "UTC",
    }).format(parsed),
  };
}

function axisMaximum(value: number, mode: "count" | "spend") {
  if (value <= 0) return mode === "count" ? 4 : 100;
  const roughStep = (value * 1.24) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  return Math.max(mode === "count" ? 4 : 1, step * 4);
}

/** Supply the actual dated values, including today's partial day. No prices are inferred. */
export default function ProgressChart({ days, limit, mode = "count", today: suppliedToday }: ProgressChartProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const data = days.map((day) => ({
    ...day,
    count: Number.isFinite(day.count) ? Math.max(0, day.count) : 0,
    formattedDate: dateParts(day.date),
  }));
  const today = suppliedToday ?? new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const dailyLimit = Number.isFinite(limit) && limit >= 0 ? limit : null;
  const maximum = axisMaximum(Math.max(0, dailyLimit ?? 0, ...data.map((day) => day.count)), mode);
  const total = data.reduce((sum, day) => sum + day.count, 0);
  const formatValue = (value: number) => mode === "spend" ? currency.format(value) : number.format(value);
  const formatAxis = (value: number) => mode === "spend"
    ? value >= 1000 ? `₹${number.format(value / 1000)}k` : `₹${number.format(value)}`
    : number.format(value);
  // The currency-marked axis supplies the unit; keep bar labels short on phones.
  // Exact rupee amounts remain in the description and daily-values table.
  const formatBarValue = (value: number) => mode === "spend" && value >= 1000
    ? `${number.format(value / 1000)}k`
    : number.format(value);
  const title = mode === "spend" ? "Daily cigarette spending" : "Daily cigarettes logged";
  const limitLabel = mode === "spend" ? "Daily budget" : "Daily limit";
  const unit = mode === "spend" ? "spent" : `cigarette${total === 1 ? "" : "s"} logged`;
  const plotHeight = 198;
  const top = 22;
  const bottom = 190;
  const plotRange = bottom - top;
  const y = (value: number) => bottom - (value / maximum) * plotRange;
  const columnWidth = 100;
  const svgWidth = Math.max(1, data.length) * columnWidth;
  const gridTemplateColumns = `repeat(${Math.max(1, data.length)}, minmax(0, 1fr))`;
  const style = {
    "--chart-accent": "var(--rust, #a3442d)",
    "--chart-progress": "var(--good, #335948)",
    "--chart-history": "#758376",
    "--chart-track": "#f0eee7",
    "--chart-grid": "var(--line, #e7e3da)",
    "--chart-text-primary": "var(--ink, #252a26)",
    "--chart-text-secondary": "var(--ink-2, #6f6c64)",
  } as CSSProperties;

  if (data.length === 0) {
    return (
      <figure className="progress-chart" style={style} aria-label={title}>
        <style>{chartStyles}</style>
        <div className="progress-chart__empty">
          <strong>Your week starts here.</strong>
          <p>Daily totals will appear as you add your logs.</p>
        </div>
      </figure>
    );
  }

  return (
    <figure className="progress-chart" style={style}>
      <style>{chartStyles}</style>
      <div className="progress-chart__plot">
        {[0, 1, 2, 3, 4].map((tick) => (
          <span
            key={tick}
            className="progress-chart__tick"
            aria-hidden="true"
            style={{ top: `${(y((maximum / 4) * tick) / plotHeight) * 100}%` }}
          >
            {formatAxis((maximum / 4) * tick)}
          </span>
        ))}
        <svg
          viewBox={`0 0 ${svgWidth} ${plotHeight}`}
          preserveAspectRatio="none"
          className="progress-chart__svg"
          role="img"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
        >
          <title id={titleId}>{title}</title>
          <desc id={descriptionId}>
            {`${data[0].formattedDate.full} to ${data[data.length - 1].formattedDate.full}. ${formatValue(total)} ${unit} across ${data.length} days. ${dailyLimit !== null ? `${limitLabel}: ${formatValue(dailyLimit)}, shown as a dashed line. ` : ""}${data.map((day) => `${day.formattedDate.full}: ${formatValue(day.count)}`).join("; ")}. Today is a partial day.`}
          </desc>
          {[0, 1, 2, 3, 4].map((tick) => (
            <line
              key={tick}
              x1="0"
              x2={svgWidth}
              y1={y((maximum / 4) * tick)}
              y2={y((maximum / 4) * tick)}
              stroke="var(--chart-grid)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {data.map((day, index) => {
            const isToday = day.date.slice(0, 10) === today;
            const height = (day.count / maximum) * plotRange;
            return (
              <g key={`${day.date}-${index}`}>
                <rect
                  x={index * columnWidth + 27}
                  y={top}
                  width="46"
                  height={plotRange}
                  rx="7"
                  fill="var(--chart-track)"
                />
                {day.count > 0 ? (
                  <rect
                    x={index * columnWidth + 27}
                    y={y(day.count)}
                    width="46"
                    height={height}
                    rx={Math.min(7, height / 2)}
                    fill={isToday ? "var(--chart-accent)" : "var(--chart-history)"}
                  />
                ) : (
                  <line
                    x1={index * columnWidth + 36}
                    x2={index * columnWidth + 64}
                    y1={bottom}
                    y2={bottom}
                    stroke={isToday ? "var(--chart-accent)" : "var(--chart-history)"}
                    strokeWidth="3"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </g>
            );
          })}
          {dailyLimit !== null && (
            <line
              x1="0"
              x2={svgWidth}
              y1={y(dailyLimit)}
              y2={y(dailyLimit)}
              stroke="var(--chart-progress)"
              strokeWidth="1.5"
              strokeDasharray="3 5"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        <div className="progress-chart__columns" style={{ gridTemplateColumns }} aria-hidden="true">
          {data.map((day, index) => (
            <div className="progress-chart__column" key={`${day.date}-${index}`}>
              <span
                className="progress-chart__value"
                style={{ top: `${((y(day.count) - 7) / plotHeight) * 100}%` }}
              >
                {formatBarValue(day.count)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="progress-chart__days" style={{ gridTemplateColumns }} aria-hidden="true">
        {data.map((day, index) => {
          const isToday = day.date.slice(0, 10) === today;
          return (
            <div className={`progress-chart__day${isToday ? " progress-chart__day--today" : ""}`} key={`${day.date}-${index}`}>
              <span>{isToday ? "Today" : day.label}</span>
              <span className="progress-chart__date">{day.formattedDate.short}</span>
            </div>
          );
        })}
      </div>
      <figcaption className="progress-chart__footer">
        <p className="progress-chart__legend">
          <span className="progress-chart__legend-item"><span className="progress-chart__swatch" aria-hidden="true" />{mode === "spend" ? "Actual spend" : "Logged cigarettes"}</span>
          {dailyLimit !== null && <span className="progress-chart__legend-item"><span className="progress-chart__limit-key" aria-hidden="true" />{limitLabel} · {formatValue(dailyLimit)}</span>}
        </p>
        <details className="progress-chart__details">
          <summary>View daily values</summary>
          <table className="progress-chart__table">
            <caption className="progress-chart__sr">{title}. Today is a partial day.</caption>
            <thead><tr><th scope="col">Date</th><th scope="col">{mode === "spend" ? "Amount spent" : "Cigarettes"}</th></tr></thead>
            <tbody>
              {data.map((day, index) => <tr key={`${day.date}-${index}`}><th scope="row">{day.formattedDate.full}{day.date.slice(0, 10) === today ? " · today so far" : ""}</th><td>{formatValue(day.count)}</td></tr>)}
            </tbody>
          </table>
        </details>
      </figcaption>
    </figure>
  );
}
