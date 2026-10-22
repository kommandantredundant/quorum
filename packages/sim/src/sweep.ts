import type { DeepPartial, QuorumConfig } from "quorum-core";
import { scenarios, simulate } from "./cli.js";

/** Compare the open design decisions against the baseline. Defaults are not changed by this script. */
interface Variant { name: string; config?: DeepPartial<QuorumConfig>; hideInterim?: boolean }

const variants: Variant[] = [
  { name: "Basis (Deckel 20)" },
  { name: "Unbegrenzt (früherer Standard)", config: { weight: { cap: Infinity } } },
  { name: "Zwischenstand verdeckt", hideInterim: true },
  { name: "Autorengewicht <= 1", config: { weight: { authorCap: 1 } } },
  { name: "Autorengewicht <= 2", config: { weight: { authorCap: 2 } } },
  { name: "Autorengewicht <= 3", config: { weight: { authorCap: 3 } } },
  { name: "Autorengewicht <= 5", config: { weight: { authorCap: 5 } } },
  { name: "Deckel 10", config: { weight: { cap: 10 } } },
  { name: "Steile Kurve (0.3 / 1.24)", config: { weight: { base: 0.3, growth: 1.24 } } },
  { name: "Kombi: verdeckt+Autor<=1+Deckel 15", config: { weight: { authorCap: 1, cap: 15 } }, hideInterim: true },
  { name: "Kombi + steile Kurve", config: { weight: { authorCap: 0.3, cap: 15, base: 0.3, growth: 1.24 } }, hideInterim: true },
];

const pct = (a: number, b: number) => (b === 0 ? "  -  " : `${((100 * a) / b).toFixed(0).padStart(3)}% `);
const by = (name: string) => scenarios.find((s) => s.name.startsWith(name))!;

for (const mod of [false, true]) {
  console.log(`\n== ${mod ? "MIT Moderator" : "OHNE Moderator"}: Anteil genehmigter Angreifer-Punkte und Gesamtgenauigkeit ==`);
  console.log(["Variante".padEnd(36), "Ehrl.richtig", "Ehrl.schl.gen", "Ring", "Sybil roh", "Sybil Farm", "Schläfer", "Folger/Ehrl.Gewinn", "Top5-Gew.(Ehrl.)"].join(" | "));
  for (const v of variants) {
    const run = (name: string) => simulate(by(name), mod, v.config, v.hideInterim ?? false);
    const ehr = run("Ehrlich");
    const ring = run("Spam-Ring");
    const syb = run("Sybil roh");
    const farm = run("Sybil Farm");
    const sleeper = run("Schläfer");
    const follow = run("Mitläufer");
    const g = (k: string) => { const p = follow.gain[k]; return p && p.n ? p.sum / p.n : 0; };
    const fg = [2, 3, 4, 5].reduce((s, p) => s + g(`follower:${p}`), 0) / 4;
    const hg = [2, 3, 4, 5].reduce((s, p) => s + g(`honest:${p}`), 0) / 4;
    console.log([
      v.name.padEnd(36), pct(ehr.correct, ehr.points).padStart(12), pct(ehr.badApproved, ehr.bad).padStart(13),
      pct(ring.attackerBadApproved, ring.attackerBad).padStart(4), pct(syb.attackerBadApproved, syb.attackerBad).padStart(9),
      pct(farm.attackerBadApproved, farm.attackerBad).padStart(10), pct(sleeper.attackerBadApproved, sleeper.attackerBad).padStart(8),
      `${(fg / hg).toFixed(1)}x`.padStart(18), pct(ehr.top5WeightShare, ehr.runs).padStart(16),
    ].join(" | "));
  }
}
