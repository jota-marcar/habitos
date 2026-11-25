// Versioned configurations: habits and weekly goals keep each version of their configuration
// with the date it is effective from (ADR-0006).

import type { LocalDate } from "./dates";

/**
 * The version in force on `date`: the one with the latest `effectiveFrom` that is not after
 * `date`, or null if there was no configuration yet. `versions` belong to a single habit or
 * weekly goal.
 */
export function versionOn<V extends { readonly effectiveFrom: LocalDate }>(
  versions: readonly V[],
  date: LocalDate,
): V | null {
  let current: V | null = null;
  for (const version of versions) {
    if (version.effectiveFrom > date) continue;
    if (current === null || version.effectiveFrom > current.effectiveFrom) {
      current = version;
    }
  }
  return current;
}
