import type { DeepPartial } from "quorum-core";

export interface ModConfig {
  /**
   * Conflict-of-interest rules, scaled by the number of moderators so a small team is
   * not blocked: with few moderators everyone must be able to take every case.
   */
  conflicts: {
    /** From this many moderators on, nobody gets cases they authored. */
    excludeAuthoredFrom: number;
    /** From this many moderators on, nobody gets cases they voted on either. */
    excludeVotedFrom: number;
  };
  /**
   * Spot checks of cases already decided by weight. All values are PROVISIONAL.
   * The rate for narrow results (55-65 % / 35-45 %) is `bands.sampleRate` of quorum-core.
   */
  sampling: {
    /** Mixed into the selection so which cases get checked is not predictable from their IDs. Set a private value per site. */
    seed: string;
    /** Weight ratio and head ratio differ by at least this much (or point to opposite sides) -> divergence. */
    divergenceThreshold: number;
    /** Share of divergent cases that get checked. */
    divergenceRate: number;
    /** One voter holds at least this share of the total weight -> edge case. */
    dominantShare: number;
    /** Share of edge cases (dominant voter, or exactly the minimum number of voters) that get checked. */
    edgeRate: number;
  };
}

export const defaultModConfig: ModConfig = {
  conflicts: { excludeAuthoredFrom: 3, excludeVotedFrom: 10 },
  sampling: { seed: "", divergenceThreshold: 0.4, divergenceRate: 0.5, dominantShare: 0.6, edgeRate: 0.1 },
};

export function defineModConfig(overrides: DeepPartial<ModConfig> = {}): ModConfig {
  const c: ModConfig = {
    conflicts: { ...defaultModConfig.conflicts, ...overrides.conflicts },
    sampling: { ...defaultModConfig.sampling, ...overrides.sampling },
  };
  const { excludeAuthoredFrom: a, excludeVotedFrom: v } = c.conflicts;
  if (!Number.isInteger(a) || a < 1) throw new RangeError(`conflicts.excludeAuthoredFrom must be an integer >= 1 (got ${a})`);
  if (!Number.isInteger(v) || v < a) throw new RangeError(`conflicts.excludeVotedFrom must be an integer >= excludeAuthoredFrom (got ${v})`);
  for (const key of ["divergenceThreshold", "divergenceRate", "dominantShare", "edgeRate"] as const) {
    const x = c.sampling[key];
    if (!Number.isFinite(x) || x < 0 || x > 1) throw new RangeError(`sampling.${key} must be within 0..1 (got ${x})`);
  }
  return c;
}
