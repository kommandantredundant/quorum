import { describe, expect, it } from "vitest";
import { defaultConfig, defineConfig } from "./config.js";
import { capReputation, voteWeight, votersToOutweigh } from "./weight.js";

const cfg = defaultConfig;

describe("voteWeight", () => {
  it("gives the base weight at reputation 0", () => {
    expect(voteWeight(0, cfg)).toBe(cfg.weight.base);
  });

  it("treats negative reputation like 0 (never below base)", () => {
    expect(voteWeight(-5, cfg)).toBe(cfg.weight.base);
    expect(voteWeight(-Infinity, cfg)).toBe(cfg.weight.base);
  });

  it("grows monotonically until the cap, then stays flat", () => {
    let prev = 0;
    for (let r = 0; r <= 60; r += 1) {
      const w = voteWeight(r, cfg);
      expect(w).toBeGreaterThanOrEqual(prev);
      expect(w).toBeLessThanOrEqual(cfg.weight.cap);
      prev = w;
    }
    expect(voteWeight(1000, cfg)).toBe(cfg.weight.cap);
    expect(voteWeight(Infinity, cfg)).toBe(cfg.weight.cap);
  });

  it("is flat when growth is 1", () => {
    const flat = defineConfig({ weight: { growth: 1 } });
    expect(voteWeight(50, flat)).toBe(flat.weight.base);
  });

  it("rejects NaN", () => {
    expect(() => voteWeight(NaN, cfg)).toThrow(RangeError);
  });
});

describe("capReputation", () => {
  it("matches voteWeight at the cap boundary", () => {
    const r = capReputation(cfg);
    expect(voteWeight(r, cfg)).toBeCloseTo(cfg.weight.cap, 9);
    expect(voteWeight(r - 1, cfg)).toBeLessThan(cfg.weight.cap);
  });

  it("handles degenerate configs", () => {
    expect(capReputation(defineConfig({ weight: { growth: 1 } }))).toBe(Infinity);
    expect(capReputation(defineConfig({ weight: { cap: 1 } }))).toBe(0);
  });
});

describe("votersToOutweigh", () => {
  it("needs strictly more than the top voter's weight", () => {
    expect(votersToOutweigh(10, 1)).toBe(11);
    expect(votersToOutweigh(2.5, 1)).toBe(3);
  });

  it("with defaults, one capped voter needs 11 base-weight voters to be overruled", () => {
    expect(votersToOutweigh(voteWeight(1000, cfg), voteWeight(0, cfg))).toBe(11);
  });
});
