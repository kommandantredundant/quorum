import { describe, expect, it } from "vitest";
import { defaultConfig, defineConfig } from "./config.js";
import { WEIGHT_CEILING, authorStartWeight, capReputation, voteWeight, votersToOutweigh } from "./weight.js";

const uncapped = defaultConfig;
const capped = defineConfig({ weight: { cap: 10 } });

describe("voteWeight", () => {
  it("defaults to no cap", () => {
    expect(defaultConfig.weight.cap).toBe(Infinity);
    expect(voteWeight(50, uncapped)).toBeCloseTo(Math.pow(1.1, 50), 6);
  });

  it("gives the base weight at reputation 0", () => {
    expect(voteWeight(0, uncapped)).toBe(uncapped.weight.base);
  });

  it("treats negative reputation like 0 (never below base)", () => {
    expect(voteWeight(-5, uncapped)).toBe(uncapped.weight.base);
    expect(voteWeight(-Infinity, uncapped)).toBe(uncapped.weight.base);
  });

  it("grows strictly while uncapped", () => {
    expect(voteWeight(11, uncapped)).toBeGreaterThan(voteWeight(10, uncapped));
  });

  it("stays finite for extreme reputation even without a cap", () => {
    expect(voteWeight(1e6, uncapped)).toBe(WEIGHT_CEILING);
    expect(voteWeight(Infinity, uncapped)).toBe(WEIGHT_CEILING);
    expect(Number.isFinite(voteWeight(1e6, uncapped) * 1000)).toBe(true);
  });

  it("applies a configured cap: monotone, then flat", () => {
    let prev = 0;
    for (let r = 0; r <= 60; r += 1) {
      const w = voteWeight(r, capped);
      expect(w).toBeGreaterThanOrEqual(prev);
      expect(w).toBeLessThanOrEqual(10);
      prev = w;
    }
    expect(voteWeight(1000, capped)).toBe(10);
  });

  it("is flat when growth is 1", () => {
    const flat = defineConfig({ weight: { growth: 1 } });
    expect(voteWeight(50, flat)).toBe(flat.weight.base);
  });

  it("rejects NaN", () => {
    expect(() => voteWeight(NaN, uncapped)).toThrow(RangeError);
  });
});

describe("capReputation", () => {
  it("is Infinity without a cap", () => {
    expect(capReputation(uncapped)).toBe(Infinity);
  });

  it("matches voteWeight at the cap boundary", () => {
    const r = capReputation(capped);
    expect(r).toBeCloseTo(24.16, 2);
    expect(voteWeight(r, capped)).toBeCloseTo(10, 9);
    expect(voteWeight(r - 1, capped)).toBeLessThan(10);
  });

  it("handles degenerate configs", () => {
    expect(capReputation(defineConfig({ weight: { growth: 1, cap: 10 } }))).toBe(Infinity);
    expect(capReputation(defineConfig({ weight: { cap: 1 } }))).toBe(0);
  });
});

describe("votersToOutweigh", () => {
  it("needs strictly more than the top voter's weight", () => {
    expect(votersToOutweigh(10, 1)).toBe(11);
    expect(votersToOutweigh(2.5, 1)).toBe(3);
  });

  it("with a cap of 10, one capped voter needs 11 base-weight voters to be overruled", () => {
    expect(votersToOutweigh(voteWeight(1000, capped), voteWeight(0, capped))).toBe(11);
  });
});

describe("authorStartWeight", () => {
  it("equals the vote weight by default and is limited by authorCap", () => {
    expect(authorStartWeight(30, uncapped)).toBe(voteWeight(30, uncapped));
    const limited = defineConfig({ weight: { authorCap: 1 } });
    expect(authorStartWeight(30, limited)).toBe(1);
    expect(authorStartWeight(0, limited)).toBe(1);
  });
});
