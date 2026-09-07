/**
 * The permissible-error staircase.
 *
 * Shows every band an instrument has, laid end to end across its weighing range, *before* any
 * observation is recorded. The point is that the officer sees the shoulders coming rather than
 * discovering them a row at a time — and that the shape of the thing is obviously a staircase,
 * not a line.
 *
 * Drawn as a step, never interpolated. The limit does not ramp between bands; it jumps. A
 * smoothed curve would draw a permissible error the standard never sets, which on a compliance
 * tool is a misstatement rather than a stylistic choice.
 *
 * Only one series, so no legend box — the caption names it. The band table beneath is the
 * chart's table view, so nothing here is reachable only by reading a picture.
 */

import { useId, useState } from "react";
import { cn } from "../../lib/cn";
import { fmtNumber } from "../../lib/format";

export interface StaircaseBand {
  fromLoad: number;
  toLoad: number;
  mpe: number;
  factor: number;
  e: number;
  rangeIndex: number;
  startsNewRange: boolean;
}

/**
 * Which limits get a printed label.
 *
 * Walks the distinct values from the top down and keeps a label only where it clears the last
 * one by at least a line's height. A crowded axis is worse than a sparse one: the reader takes
 * nothing from four overlapping numbers, and the band table below is the complete record.
 */
function labelledLevels(
  bands: StaircaseBand[],
  y: (v: number) => number,
): { value: number; showLabel: boolean }[] {
  const values = [...new Set(bands.map((b) => b.mpe))].sort((a, b) => b - a);
  const MIN_GAP = 13; // px, comfortably over the 10px label
  let lastLabelled: number | null = null;

  return values.map((value) => {
    const py = y(value);
    const clear = lastLabelled === null || Math.abs(py - lastLabelled) >= MIN_GAP;
    // The smallest limit is always worth naming: it is the tightest the instrument is held to.
    const isSmallest = value === values[values.length - 1];
    const showLabel = clear || isSmallest;
    if (showLabel) lastLabelled = py;
    return { value, showLabel };
  });
}

const W = 620;
const H = 230;
const M = { top: 18, right: 16, bottom: 34, left: 52 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

export function MpeStaircase({
  bands,
  unit,
  className,
}: {
  bands: StaircaseBand[];
  unit: string;
  className?: string;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (bands.length === 0) return null;

  const maxLoad = bands[bands.length - 1]!.toLoad;
  const maxMpe = Math.max(...bands.map((b) => b.mpe));
  if (!(maxLoad > 0) || !(maxMpe > 0)) return null;

  const x = (v: number) => (v / maxLoad) * PLOT_W;
  // Headroom above the tallest step so its label is not clipped.
  const y = (v: number) => PLOT_H - (v / (maxMpe * 1.25)) * PLOT_H;

  // Step path: run flat across the band, then jump at its end.
  const steps: string[] = [];
  bands.forEach((b, i) => {
    const yTop = y(b.mpe);
    if (i === 0) steps.push(`M ${x(b.fromLoad)} ${yTop}`);
    else steps.push(`L ${x(b.fromLoad)} ${yTop}`);
    steps.push(`L ${x(b.toLoad)} ${yTop}`);
  });
  const line = steps.join(" ");
  const area = `${line} L ${x(maxLoad)} ${PLOT_H} L ${x(bands[0]!.fromLoad)} ${PLOT_H} Z`;

  const active = hover === null ? null : bands[hover];

  return (
    <figure className={cn("m-0", className)}>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={
            `Permissible error against load, in ${bands.length} step${bands.length === 1 ? "" : "s"}, ` +
            `from ±${fmtNumber(bands[0]!.mpe)} to ±${fmtNumber(maxMpe)} ${unit}.`
          }
          className="w-full min-w-[420px]"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-line)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--color-chart-line)" stopOpacity="0.03" />
            </linearGradient>
          </defs>

          <g transform={`translate(${M.left},${M.top})`}>
            {/*
              One gridline per distinct limit — the values that actually occur, not a decimal
              ladder. On a wide-ranging instrument the small limits sit close together near the
              baseline, so a label is dropped where it would collide with the one below it. The
              gridline still shows; only the number is suppressed, and the table beneath carries
              every value in full.
            */}
            {labelledLevels(bands, y).map(({ value: v, showLabel }) => (
              <g key={v}>
                <line
                  x1={0} x2={PLOT_W} y1={y(v)} y2={y(v)}
                  stroke="var(--color-outline-variant)" strokeOpacity={0.35} strokeDasharray="3 3"
                />
                {showLabel && (
                  <text
                    x={-8} y={y(v)} dy="0.32em" textAnchor="end"
                    className="fill-on-surface-variant" style={{ fontSize: 10 }}
                  >
                    ±{fmtNumber(v)}
                  </text>
                )}
              </g>
            ))}

            <path d={area} fill={`url(#${gradientId})`} />
            <path
              d={line}
              fill="none"
              stroke="var(--color-chart-line)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* A range change is a different event from a band change, so it is marked. */}
            {bands.filter((b) => b.startsNewRange && b.fromLoad > 0).map((b) => (
              <g key={`r-${b.fromLoad}`}>
                <line
                  x1={x(b.fromLoad)} x2={x(b.fromLoad)} y1={0} y2={PLOT_H}
                  stroke="var(--color-on-surface-variant)" strokeOpacity={0.5} strokeWidth={1} strokeDasharray="2 3"
                />
                <text
                  x={x(b.fromLoad) + 3} y={9}
                  className="fill-on-surface-variant" style={{ fontSize: 9, fontWeight: 600 }}
                >
                  e = {fmtNumber(b.e)}
                </text>
              </g>
            ))}

            {/* Hit targets span each band, so hovering anywhere in a step selects it. */}
            {bands.map((b, i) => (
              <rect
                key={`hit-${i}`}
                x={x(b.fromLoad)} y={0}
                width={Math.max(x(b.toLoad) - x(b.fromLoad), 1)} height={PLOT_H}
                fill={hover === i ? "var(--color-primary)" : "transparent"}
                fillOpacity={hover === i ? 0.06 : 0}
                onMouseEnter={() => setHover(i)}
              />
            ))}

            <line x1={0} x2={PLOT_W} y1={PLOT_H} y2={PLOT_H} stroke="var(--color-outline-variant)" strokeOpacity={0.6} />
            <text x={0} y={PLOT_H + 14} className="fill-on-surface-variant" style={{ fontSize: 10 }}>0</text>
            <text
              x={PLOT_W} y={PLOT_H + 14} textAnchor="end"
              className="fill-on-surface-variant" style={{ fontSize: 10 }}
            >
              Max {fmtNumber(maxLoad)} {unit}
            </text>
            <text
              x={PLOT_W / 2} y={PLOT_H + 28} textAnchor="middle"
              className="fill-on-surface-variant" style={{ fontSize: 10 }}
            >
              Load ({unit})
            </text>
          </g>
        </svg>
      </div>

      <figcaption className="mt-2 min-h-[40px] text-body-sm text-on-surface-variant">
        {active ? (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-on-surface tabular-nums">
              {fmtNumber(active.fromLoad)} – {fmtNumber(active.toLoad)} {unit}
            </span>
            <span className="tabular-nums text-primary font-semibold">± {fmtNumber(active.mpe)} {unit}</span>
            <span>
              {active.factor} e{active.rangeIndex > 1 || active.e !== bands[0]!.e ? `${active.rangeIndex}` : ""}
              {" · "}e = {fmtNumber(active.e)} {unit}
            </span>
            {active.startsNewRange && active.fromLoad > 0 && (
              <span className="rounded-full bg-primary-fixed px-2 py-0.5 text-label-sm font-semibold text-on-primary-fixed">
                partial range {active.rangeIndex} begins
              </span>
            )}
          </span>
        ) : (
          <span>
            Permissible error against load, in {bands.length} step{bands.length === 1 ? "" : "s"}.
            {bands.length > 1 && " Hover a step to read its limit."}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
