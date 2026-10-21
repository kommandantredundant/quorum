import type { DeepPartial, QuorumConfig } from "quorum-core";
import { emptyCounters, runOnce, type Counters, type Scenario } from "./engine.js";

const POINTS = 300;
const SEEDS = 20;

const scenarios: Scenario[] = [
  { name: "Ehrlich", honest: 50, accuracy: [0.65, 0.9], points: POINTS },
  { name: "Spam-Ring (5 von 50)", honest: 45, accuracy: [0.65, 0.9], attackers: 5, attackerAuthorShare: 0.15, points: POINTS },
  { name: "Sybil roh (1+10)", honest: 49, accuracy: [0.65, 0.9], attackers: 1, sybils: 10, attackerAuthorShare: 0.1, points: POINTS },
  { name: "Sybil Farm (1+10)", honest: 49, accuracy: [0.65, 0.9], attackers: 1, sybils: 10, sybilFarm: true, attackerAuthorShare: 0.1, points: POINTS },
  { name: "Schläfer (Rep 30)", honest: 49, accuracy: [0.65, 0.9], attackers: 1, attackerRep: 30, attackerAuthorShare: 0.1, points: POINTS },
  { name: "Mitläufer (10 von 50)", honest: 40, accuracy: [0.65, 0.9], followers: 10, points: POINTS },
];

export function simulate(sc: Scenario, mod: boolean, config?: DeepPartial<QuorumConfig>): Counters {
  const c = emptyCounters();
  for (let seed = 1; seed <= SEEDS; seed++) runOnce({ scenario: sc, mod, seed, ...(config && { config }) }, c);
  return c;
}

const pct = (a: number, b: number) => (b === 0 ? "   -  " : `${((100 * a) / b).toFixed(1).padStart(5)}%`);
const mean = (p: { sum: number; n: number } | undefined) => (p && p.n > 0 ? (p.sum / p.n).toFixed(1) : "-");

function row(sc: Scenario, mod: boolean, c: Counters): string {
  return [
    sc.name.padEnd(24), mod ? "mit Mod " : "ohne Mod",
    pct(c.correct, c.points), pct(c.badApproved, c.bad), pct(c.goodRejected, c.good), pct(c.attackerBadApproved, c.attackerBad),
    pct(c.review, c.points), pct(c.overridden, c.points),
    mean(c.rep.honest).padStart(6), mean(c.rep.attacker).padStart(6), mean(c.rep.sybil).padStart(6),
    pct(c.attackerWeightShare, c.runs), pct(c.top5WeightShare, c.runs), (c.maxWeight >= 1e6 ? c.maxWeight.toExponential(1) : c.maxWeight.toFixed(1)).padStart(8),
  ].join(" | ");
}

export function main(config?: DeepPartial<QuorumConfig>, label = "Standard-Config"): void {
  console.log(`\n== ${label} (${SEEDS} Läufe x ${POINTS} Punkte) ==`);
  console.log([
    "Szenario".padEnd(24), "Modus   ", "richtig", "Schl.gen", "Gut abg", "Angr.gen", "Review ", "Overrid", "Rep ehr", "Rep Ang", "Rep Syb", "Ang.Gew.", "Top5 Gew", "Max Gew ",
  ].join(" | "));
  for (const sc of scenarios) for (const mod of [false, true]) console.log(row(sc, mod, simulate(sc, mod, config)));

  const c = simulate(scenarios[5] as Scenario, false, config);
  console.log("\nReputationsgewinn pro Stimme nach Ankunftsposition (Szenario Mitläufer, ohne Mod):");
  for (const group of ["honest", "follower"]) {
    console.log(`  ${group.padEnd(9)} ` + [1, 2, 3, 4, 5].map((p) => `Pos ${p}${p === 5 ? "+" : " "}: ${mean(c.gain[`${group}:${p}`])}`.padEnd(14)).join(""));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
