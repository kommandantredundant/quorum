/**
 * Central configuration for quorum-core.
 *
 * Every tunable parameter lives here. All defaults are PROVISIONAL starting
 * points and are meant to be tuned via simulation (see roadmap tasks 21/22).
 * Ratios are fractions of total vote weight in favour (0..1).
 */

export interface QuorumConfig {
  voting: {
    /** Length of the initial voting window. */
    windowHours: number;
    /** Minimum number of distinct voters before a result counts. */
    minVoters: number;
    /** Maximum number of window extensions before the case goes to review. */
    maxExtensions: number;
    /** Length of each extension. */
    extensionHours: number;
  };
  /** Outcome bands on the weighted approval ratio. */
  bands: {
    /** Too close to call -> review. */
    greyZone: readonly [number, number];
    /** Slightly above grey zone -> approved, but sampled for review. */
    sampleHigh: readonly [number, number];
    /** Slightly below grey zone -> rejected, but sampled for review. */
    sampleLow: readonly [number, number];
    /** Share of cases inside a sample band that gets flagged (0..1). */
    sampleRate: number;
  };
  /**
   * Weight-conflict rule: a few heavy voters decide against many light voters.
   * Such cases go to review even if the weighted ratio is clear.
   */
  weightConflict: {
    /** The side that wins by weight has at most this many voters ... */
    maxDecisiveVoters: number;
    /** ... while the opposing side has at least this many voters. */
    minOpposingVoters: number;
  };
  reputation: {
    /** Reputation change for voting with the final outcome. */
    reward: number;
    /** Reputation change (negative) for voting against the final outcome. */
    penalty: number;
    /** Reputation a new user starts with. */
    startValue: number;
  };
  weight: {
    /** Weight at reputation 0. */
    base: number;
    /** Multiplicative growth per reputation point. */
    growth: number;
    /**
     * Cap on a single voter's weight. `Infinity` (default) means no cap.
     * Set a finite number to enable it later. Note: JSON cannot represent
     * Infinity, so omit the field instead of serialising it.
     */
    cap: number;
  };
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export const defaultConfig: QuorumConfig = {
  voting: { windowHours: 72, minVoters: 3, maxExtensions: 3, extensionHours: 24 },
  bands: {
    greyZone: [0.45, 0.55],
    sampleHigh: [0.55, 0.65],
    sampleLow: [0.35, 0.45],
    sampleRate: 0.2,
  },
  weightConflict: { maxDecisiveVoters: 2, minOpposingVoters: 5 },
  reputation: { reward: 1, penalty: -1.5, startValue: 0 },
  weight: { base: 1, growth: 1.1, cap: Infinity },
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(`Invalid quorum config: ${message}`);
    this.name = "ConfigError";
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function merge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : override) as T;
  }
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    out[key] = merge((base as Record<string, unknown>)[key], value);
  }
  return out as T;
}

function requirePositive(name: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) throw new ConfigError(`${name} must be > 0 (got ${v})`);
}

function requireRatio(name: string, v: number): void {
  if (!Number.isFinite(v) || v < 0 || v > 1) throw new ConfigError(`${name} must be within 0..1 (got ${v})`);
}

function requireBand(name: string, band: readonly [number, number]): void {
  requireRatio(`${name}[0]`, band[0]);
  requireRatio(`${name}[1]`, band[1]);
  if (band[0] >= band[1]) throw new ConfigError(`${name} must be ascending (got [${band[0]}, ${band[1]}])`);
}

export function validateConfig(c: QuorumConfig): QuorumConfig {
  requirePositive("voting.windowHours", c.voting.windowHours);
  requirePositive("voting.extensionHours", c.voting.extensionHours);
  if (!Number.isInteger(c.voting.minVoters) || c.voting.minVoters < 1) {
    throw new ConfigError(`voting.minVoters must be an integer >= 1 (got ${c.voting.minVoters})`);
  }
  if (!Number.isInteger(c.voting.maxExtensions) || c.voting.maxExtensions < 0) {
    throw new ConfigError(`voting.maxExtensions must be an integer >= 0 (got ${c.voting.maxExtensions})`);
  }

  const { greyZone, sampleHigh, sampleLow, sampleRate } = c.bands;
  requireBand("bands.greyZone", greyZone);
  requireBand("bands.sampleHigh", sampleHigh);
  requireBand("bands.sampleLow", sampleLow);
  requireRatio("bands.sampleRate", sampleRate);
  if (sampleLow[1] !== greyZone[0]) throw new ConfigError("bands.sampleLow must end where bands.greyZone starts");
  if (sampleHigh[0] !== greyZone[1]) throw new ConfigError("bands.sampleHigh must start where bands.greyZone ends");

  const { maxDecisiveVoters, minOpposingVoters } = c.weightConflict;
  if (!Number.isInteger(maxDecisiveVoters) || maxDecisiveVoters < 1) {
    throw new ConfigError(`weightConflict.maxDecisiveVoters must be an integer >= 1 (got ${maxDecisiveVoters})`);
  }
  if (!Number.isInteger(minOpposingVoters) || minOpposingVoters <= maxDecisiveVoters) {
    throw new ConfigError("weightConflict.minOpposingVoters must be an integer > maxDecisiveVoters");
  }

  if (!(c.reputation.reward > 0)) throw new ConfigError("reputation.reward must be > 0");
  if (!(c.reputation.penalty < 0)) throw new ConfigError("reputation.penalty must be < 0");
  if (!Number.isFinite(c.reputation.startValue)) throw new ConfigError("reputation.startValue must be finite");

  requirePositive("weight.base", c.weight.base);
  if (!(c.weight.growth >= 1)) throw new ConfigError(`weight.growth must be >= 1 (got ${c.weight.growth})`);
  if (!(c.weight.cap >= c.weight.base)) throw new ConfigError("weight.cap must be >= weight.base");
  return c;
}

/** Merge a partial override onto the defaults and validate the result. */
export function defineConfig(overrides: DeepPartial<QuorumConfig> = {}): QuorumConfig {
  return validateConfig(merge(defaultConfig, overrides));
}
