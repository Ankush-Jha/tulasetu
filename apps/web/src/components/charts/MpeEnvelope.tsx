/**
 * The permissible-error envelope.
 *
 * Plots the corrected error of every recorded row against the ± mpe corridor it had to sit
 * inside. It exists to make one thing visible that a table of numbers cannot: **the corridor is
 * a step function**. On a multi-interval instrument the limit widens part-way up the range — on
 * R 76-1 §3.3's own worked example it goes ±0.5 g, ±1 g, ±2 g, ±3 g, ±10 g — with no change in
 * what the display shows. That step is the error a spreadsheet makes, and here it is a visible
 * shoulder in the corridor.
 *
 * Two things follow from that and are not negotiable:
 *
 *  - **The corridor is stepped, never interpolated.** Smoothing between two band values would
 *    draw a limit the standard never sets. On a compliance document that is not a liberty.
 *  - **The step is drawn where the standard puts it**, not where a test load happened to be
 *    recorded. The caller passes the partial-range boundaries, so a corridor that changes at
 *    2 kg is drawn changing at 2 kg even if the nearest observations are at 500 g and 4 kg.
 *    Stepping at the sample would move a legal limit to wherever the officer chose to weigh.
 *
 * Other decisions: one y-axis, never two. One data series, so no legend box is needed for it —
 * but the corridor and the breach marks are different *kinds* of thing, so a key names all
 * three. Breaches carry a ring and a direct label, so identity never rests on colour alone.
 * The observation table above is this chart's table view.
 */

import { useId, useMemo, useState } from "react";
import { cn } from "../../lib/cn";
import { fmtNumber } from "../../lib/format";

export interface EnvelopePoint {
  load: number;
  correctedError: number;
  mpe: number;
  /** e of the partial range this load fell in. */
  e: number;
  rangeIndex: number;
  verdict: string;
  label?: string;
}

/** Where a partial range ends, so the corridor steps at the standard's boundary. */
export interface RangeBoundary {
  /** The load at which this partial range ends. */
  at: number;
  /** e below the boundary, and above it. */
  fromE: number;
  toE: number;
}

export interface MpeEnvelopeProps {
  points: EnvelopePoint[];
  boundaries?: RangeBoundary[];
  unit: string;
  className?: string;
}

const W = 800;
const H = 320;
const M = { top: 28, right: 24, bottom: 46, left: 64 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

/** Round a span up to a readable tick step — 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

export function MpeEnvelope({ points, boundaries = [], unit, className }: MpeEnvelopeProps) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const data = useMemo(
    () => [...points].filter((p) => Number.isFinite(p.load)).sort((a, b) => a.load - b.load),
    [points],
  );

  const geometry = useMemo(() => {
    if (data.length < 2) return null;

    const xMin = Math.min(...data.map((p) => p.load));
    const xMax = Math.max(...data.map((p) => p.load));

    // The corridor sets the vertical extent, not the observations: scaling to the errors alone
    // would hide how much headroom a well-behaved instrument has.
    const extent = Math.max(...data.map((p) => Math.max(p.mpe, Math.abs(p.correctedError))));
    const step = niceStep((extent * 1.2) / 2);
    const yMax = step * 2;

    const x = (v: number) => (xMax === xMin ? PLOT_W / 2 : ((v - xMin) / (xMax - xMin)) * PLOT_W);
    const y = (v: number) => PLOT_H / 2 - (v / yMax) * (PLOT_H / 2);

    /**
     * The corridor as a sequence of horizontal runs.
     *
     * Each run is a stretch of load over which one limit applies. A run ends at a declared
     * partial-range boundary, so the vertical shoulder lands on the standard's own value.
     */
    const cuts = boundaries
      .map((b) => b.at)
      .filter((at) => at > xMin && at < xMax)
      .sort((a, b) => a - b);

    const edges = [xMin, ...cuts, xMax];
    const runs: { from: number; to: number; mpe: number }[] = [];
    for (let i = 0; i < edges.length - 1; i++) {
      const from = edges[i]!;
      const to = edges[i + 1]!;
      // The limit for a run is the one the engine resolved for observations inside it.
      //
      // The lower bound is exclusive for every run after the first, because R 76-1 §3.3.1 puts
      // Max_i *in* range i: a load of exactly 5 kg on the worked example is still in partial
      // range 2 at ±3 g, and only above it does the corridor open to ±10 g. Including the
      // boundary point would give the whole upper run the narrower limit.
      const inside = data.filter((p) => (i === 0 ? p.load >= from : p.load > from) && p.load <= to);
      const source =
        inside[0] ??
        [...data].sort((a, b) => Math.abs(a.load - (from + to) / 2) - Math.abs(b.load - (from + to) / 2))[0]!;
      runs.push({ from, to, mpe: source.mpe });
    }

    const topPath = runs
      .map((r, i) => `${i === 0 ? `M ${x(r.from)} ${y(r.mpe)}` : `L ${x(r.from)} ${y(r.mpe)}`} L ${x(r.to)} ${y(r.mpe)}`)
      .join(" ");
    const bottomPath = runs
      .map((r, i) => `${i === 0 ? `M ${x(r.from)} ${y(-r.mpe)}` : `L ${x(r.from)} ${y(-r.mpe)}`} L ${x(r.to)} ${y(-r.mpe)}`)
      .join(" ");

    // Band: down the top runs, across the right edge, back along the bottom runs, close.
    const bandPath =
      runs.map((r, i) => `${i === 0 ? "M" : "L"} ${x(r.from)} ${y(r.mpe)} L ${x(r.to)} ${y(r.mpe)}`).join(" ") +
      " " +
      [...runs]
        .reverse()
        .map((r) => `L ${x(r.to)} ${y(-r.mpe)} L ${x(r.from)} ${y(-r.mpe)}`)
        .join(" ") +
      " Z";

    const linePath = data
      .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.load)} ${y(p.correctedError)}`)
      .join(" ");

    const ticks = [yMax, step, 0, -step, -yMax];

    // x labels: the ends, the boundaries and every breach — then anything that would collide
    // with a label already placed is dropped. A dense axis is unreadable, not thorough.
    const candidates = [
      { v: xMin, priority: 1 },
      { v: xMax, priority: 1 },
      ...cuts.map((c) => ({ v: c, priority: 0 })),
      ...data.filter((p) => p.verdict === "FAILED").map((p) => ({ v: p.load, priority: 0 })),
    ].sort((a, b) => a.priority - b.priority || a.v - b.v);

    const placed: number[] = [];
    for (const c of candidates) {
      if (placed.every((p) => Math.abs(x(p) - x(c.v)) > 46)) placed.push(c.v);
    }

    return { x, y, yMax, ticks, runs, cuts, topPath, bottomPath, bandPath, linePath, xLabels: placed.sort((a, b) => a - b) };
  }, [data, boundaries]);

  if (!geometry || data.length < 2) return null;
  const { x, y, ticks, cuts, topPath, bottomPath, bandPath, linePath, xLabels } = geometry;

  const breaches = data.filter((p) => p.verdict === "FAILED");
  const active = hover === null ? null : data[hover];

  return (
    <figure className={cn("m-0", className)}>
      <figcaption className="mb-3">
        <h3 className="text-headline-sm text-on-surface">Permissible-error envelope</h3>
        <p className="text-body-sm text-on-surface-variant mt-0.5">
          Corrected error against the ± mpe corridor. The corridor steps where the partial range
          changes — that shoulder is the limit moving without the display changing.
        </p>
      </figcaption>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-body-sm text-on-surface-variant">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-sm" style={{ background: "var(--color-chart-band)" }} />
          ± mpe corridor
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded-full" style={{ background: "var(--color-chart-line)" }} />
          corrected error, Ec
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full ring-2 ring-white"
            style={{ background: "var(--color-chart-breach)" }}
          />
          breach ({breaches.length})
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={
            `Corrected error against the permissible-error corridor for ${data.length} loads. ` +
            `${breaches.length} of them breach the corridor.`
          }
          className="w-full min-w-[640px]"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-band)" stopOpacity="0.5" />
              <stop offset="50%" stopColor="var(--color-chart-band)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-chart-band)" stopOpacity="0.5" />
            </linearGradient>
          </defs>

          <g transform={`translate(${M.left},${M.top})`}>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={0} x2={PLOT_W} y1={y(t)} y2={y(t)}
                  stroke="var(--color-outline-variant)"
                  strokeOpacity={t === 0 ? 0.75 : 0.3}
                  strokeDasharray={t === 0 ? undefined : "3 3"}
                />
                <text
                  x={-10} y={y(t)} dy="0.32em" textAnchor="end"
                  className="fill-on-surface-variant" style={{ fontSize: 11 }}
                >
                  {t > 0 ? "+" : ""}{fmtNumber(t, 3)}
                </text>
              </g>
            ))}
            <text
              transform={`translate(${-M.left + 14},${PLOT_H / 2}) rotate(-90)`}
              textAnchor="middle" className="fill-on-surface-variant" style={{ fontSize: 11 }}
            >
              Error ({unit})
            </text>

            <path d={bandPath} fill={`url(#${gradientId})`} />
            <path d={topPath} fill="none" stroke="var(--color-chart-line)" strokeOpacity={0.4} strokeWidth={1.5} strokeDasharray="5 3" />
            <path d={bottomPath} fill="none" stroke="var(--color-chart-line)" strokeOpacity={0.4} strokeWidth={1.5} strokeDasharray="5 3" />

            {/* Shoulders, at the standard's boundary rather than at a sampled load. */}
            {cuts.map((c) => {
              const b = boundaries.find((bb) => bb.at === c);
              return (
                <g key={c}>
                  <line
                    x1={x(c)} x2={x(c)} y1={-6} y2={PLOT_H}
                    stroke="var(--color-on-surface-variant)" strokeOpacity={0.5} strokeDasharray="2 4"
                  />
                  {b && (
                    <text
                      x={x(c)} y={-12} textAnchor="middle"
                      className="fill-on-surface-variant" style={{ fontSize: 10, fontWeight: 600 }}
                    >
                      e {fmtNumber(b.fromE)} → {fmtNumber(b.toE)} {unit}
                    </text>
                  )}
                </g>
              );
            })}

            <path
              d={linePath} fill="none" stroke="var(--color-chart-line)"
              strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
            />

            {data.map((p, i) => {
              const failed = p.verdict === "FAILED";
              return (
                <circle
                  key={i}
                  cx={x(p.load)} cy={y(p.correctedError)}
                  r={failed ? 6 : hover === i ? 5.5 : 4}
                  fill={failed ? "var(--color-chart-breach)" : "var(--color-chart-line)"}
                  stroke="var(--color-surface-container-lowest)" strokeWidth={2}
                />
              );
            })}

            {/* Breaches are directly labelled; placed on whichever side has room. */}
            {breaches.map((p) => {
              const above = p.correctedError >= 0;
              return (
                <text
                  key={`b-${p.load}`}
                  x={x(p.load)} y={y(p.correctedError) + (above ? -13 : 19)} textAnchor="middle"
                  style={{ fontSize: 11, fontWeight: 700 }} fill="var(--color-chart-breach)"
                >
                  {p.correctedError > 0 ? "+" : ""}{fmtNumber(p.correctedError)} {unit}
                </text>
              );
            })}

            {active && (
              <line
                x1={x(active.load)} x2={x(active.load)} y1={0} y2={PLOT_H}
                stroke="var(--color-on-surface)" strokeOpacity={0.25}
              />
            )}
            {data.map((p, i) => (
              <rect
                key={`hit-${i}`}
                x={x(p.load) - 16} y={0} width={32} height={PLOT_H}
                fill="transparent" onMouseEnter={() => setHover(i)}
              />
            ))}

            <line x1={0} x2={PLOT_W} y1={PLOT_H} y2={PLOT_H} stroke="var(--color-outline-variant)" strokeOpacity={0.6} />
            {xLabels.map((v) => (
              <text
                key={`x-${v}`} x={x(v)} y={PLOT_H + 17} textAnchor="middle"
                className="fill-on-surface-variant" style={{ fontSize: 10 }}
              >
                {fmtNumber(v)}
              </text>
            ))}
            <text
              x={PLOT_W / 2} y={PLOT_H + 36} textAnchor="middle"
              className="fill-on-surface-variant" style={{ fontSize: 11 }}
            >
              Load ({unit})
            </text>
          </g>
        </svg>
      </div>

      {active && (
        <div className="mt-2 inline-flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-outline-variant/50 bg-surface-container-lowest px-3.5 py-2 text-body-sm glass-shadow">
          <span className="text-on-surface font-semibold tabular-nums">
            {fmtNumber(active.load)} {unit}
          </span>
          <span className="text-on-surface-variant">
            Ec{" "}
            <span className="tabular-nums text-on-surface">
              {active.correctedError > 0 ? "+" : ""}{fmtNumber(active.correctedError)} {unit}
            </span>
          </span>
          <span className="text-on-surface-variant">
            limit <span className="tabular-nums text-on-surface">± {fmtNumber(active.mpe)} {unit}</span>
          </span>
          <span className="text-on-surface-variant">
            range {active.rangeIndex} · e = {fmtNumber(active.e)} {unit}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-label-sm font-semibold",
              active.verdict === "FAILED"
                ? "bg-error-container text-on-error-container"
                : "bg-success-container text-on-success",
            )}
          >
            {active.verdict}
          </span>
        </div>
      )}
    </figure>
  );
}
