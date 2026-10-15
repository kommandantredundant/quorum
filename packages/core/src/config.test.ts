import { describe, expect, it } from "vitest";
import { ConfigError, defaultConfig, defineConfig, validateConfig } from "./config.js";

describe("defineConfig", () => {
  it("returns valid defaults without overrides", () => {
    expect(defineConfig()).toEqual(defaultConfig);
    expect(() => validateConfig(defaultConfig)).not.toThrow();
  });

  it("deep-merges partial overrides", () => {
    const c = defineConfig({ voting: { minVoters: 9 }, weight: { cap: 20 } });
    expect(c.voting.minVoters).toBe(9);
    expect(c.voting.windowHours).toBe(defaultConfig.voting.windowHours);
    expect(c.weight.cap).toBe(20);
    expect(c.weight.growth).toBe(defaultConfig.weight.growth);
  });

  it("does not mutate the defaults", () => {
    const before = structuredClone(defaultConfig);
    defineConfig({ voting: { minVoters: 99 } });
    expect(defaultConfig).toEqual(before);
  });

  it("rejects invalid values", () => {
    expect(() => defineConfig({ voting: { minVoters: 0 } })).toThrow(ConfigError);
    expect(() => defineConfig({ reputation: { penalty: 1 } })).toThrow(ConfigError);
    expect(() => defineConfig({ weight: { cap: 0.5 } })).toThrow(ConfigError);
  });

  it("rejects bands that leave gaps or overlap", () => {
    expect(() => defineConfig({ bands: { greyZone: [0.4, 0.6] } })).toThrow(ConfigError);
  });
});
