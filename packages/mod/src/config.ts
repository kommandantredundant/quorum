import type { DeepPartial } from "quorum-core";

/**
 * Conflict-of-interest rules, scaled by the number of moderators so a small team is
 * not blocked: with few moderators everyone must be able to take every case.
 */
export interface ModConfig {
  conflicts: {
    /** From this many moderators on, nobody gets cases they authored. */
    excludeAuthoredFrom: number;
    /** From this many moderators on, nobody gets cases they voted on either. */
    excludeVotedFrom: number;
  };
}

export const defaultModConfig: ModConfig = {
  conflicts: { excludeAuthoredFrom: 3, excludeVotedFrom: 10 },
};

export function defineModConfig(overrides: DeepPartial<ModConfig> = {}): ModConfig {
  const c: ModConfig = { conflicts: { ...defaultModConfig.conflicts, ...overrides.conflicts } };
  const { excludeAuthoredFrom: a, excludeVotedFrom: v } = c.conflicts;
  if (!Number.isInteger(a) || a < 1) throw new RangeError(`conflicts.excludeAuthoredFrom must be an integer >= 1 (got ${a})`);
  if (!Number.isInteger(v) || v < a) throw new RangeError(`conflicts.excludeVotedFrom must be an integer >= excludeAuthoredFrom (got ${v})`);
  return c;
}
