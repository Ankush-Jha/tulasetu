/**
 * Formatting helpers.
 *
 * Mass values get the careful treatment. Trailing zeros are trimmed, but significant digits
 * never are: an error of 0.5 g must not be displayed as "1" because a rounding rule tidied it.
 * Below class I resolution (e = 0.001 g) that distinction is the whole measurement.
 */

/** A number, trimmed but not rounded away. Six decimals covers class I work with room to spare. */
export function fmtNumber(n: number | null | undefined, maxDecimals = 6): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (Number.isInteger(n)) return n.toLocaleString("en-IN");
  return Number(n.toFixed(maxDecimals)).toString();
}

/** A mass with its unit. */
export function fmtMass(n: number | null | undefined, unit = "g"): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${fmtNumber(n)} ${unit}`;
}

/** A permissible error, always signed both ways as the standard writes it. */
export function fmtMpe(n: number | null | undefined, unit = "g"): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `± ${fmtNumber(n)} ${unit}`;
}

/** A signed error, so the direction is never ambiguous. */
export function fmtSigned(n: number | null | undefined, unit = "g"): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const s = fmtNumber(Math.abs(n));
  return `${n < 0 ? "−" : n > 0 ? "+" : ""}${s} ${unit}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** Grams into whatever unit reads naturally, for display only — never for computation. */
export function fmtCapacity(grams: number | null | undefined): string {
  if (grams === null || grams === undefined || !Number.isFinite(grams)) return "—";
  if (grams >= 1_000_000) return `${fmtNumber(grams / 1_000_000)} t`;
  if (grams >= 1000) return `${fmtNumber(grams / 1000)} kg`;
  return `${fmtNumber(grams)} g`;
}

/** Turn an event type into something readable, e.g. RECOMMENDED_TO_DIRECTOR. */
export function humanizeEvent(eventType: string): string {
  const s = eventType.toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
