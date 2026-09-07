/**
 * Conditional className joiner.
 *
 * Small on purpose. The point of the primitive layer is that pages stop hand-rolling
 * appearance, so a heavyweight class-merging dependency would be solving a problem we are
 * deliberately not creating.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
