import {
  advance, applyDecision, authorStartWeight, decideByWeight, defineConfig, openSubmission, reviewRequest, settleDeltas, voteWeight,
  type DeepPartial, type QuorumConfig, type ReputationDelta, type Verdict, type VoteChoice,
} from "quorum-core";
import { auditCase, defineModConfig } from "quorum-mod";
import { createRng } from "./rng.js";

/**
 * Who is in the community and how they behave.
 * - honest:   votes correctly with their own accuracy
 * - follower: looks at the public interim weights and joins the leading side
 * - attacker: collusion ring; approves its own members' (bad) points, otherwise votes honestly (sleeper)
 * - sybil:    fake accounts of the attacker; approve attacker points; optionally farm reputation by following the herd
 */
export type Group = "honest" | "follower" | "attacker" | "sybil";

export interface Scenario {
  name: string;
  honest: number;
  accuracy: [number, number];
  followers?: number;
  attackers?: number;
  /** Reputation attackers start with (a long honest history). */
  attackerRep?: number;
  sybils?: number;
  sybilFarm?: boolean;
  /** Share of all points authored by attackers (they are bad with 95 % probability). */
  attackerAuthorShare?: number;
  points: number;
}

export interface RunOptions {
  scenario: Scenario;
  config?: DeepPartial<QuorumConfig>;
  /** true: a moderator (accuracy `moderatorAccuracy`) answers reviews and checks sampled cases. */
  mod: boolean;
  moderatorAccuracy?: number;
  /** true: the interim result is not public, so followers cannot copy the leading side. */
  hideInterim?: boolean;
  seed: number;
}

interface User { id: string; group: Group; accuracy: number; activity: number; rep: number }
interface Pool { sum: number; n: number }

export interface Counters {
  runs: number;
  points: number; correct: number;
  bad: number; badApproved: number; good: number; goodRejected: number;
  attackerBad: number; attackerBadApproved: number;
  review: number; sampled: number; overridden: number;
  rep: Record<Group, Pool>;
  attackerWeightShare: number; top5WeightShare: number; maxWeight: number;
  /** mean reputation gain per vote by group and arrival position (1..5+) */
  gain: Record<string, Pool>;
}

export const emptyCounters = (): Counters => ({
  runs: 0, points: 0, correct: 0, bad: 0, badApproved: 0, good: 0, goodRejected: 0, attackerBad: 0, attackerBadApproved: 0,
  review: 0, sampled: 0, overridden: 0,
  rep: { honest: { sum: 0, n: 0 }, follower: { sum: 0, n: 0 }, attacker: { sum: 0, n: 0 }, sybil: { sum: 0, n: 0 } },
  attackerWeightShare: 0, top5WeightShare: 0, maxWeight: 0, gain: {},
});

export function runOnce(opts: RunOptions, into: Counters): void {
  const sc = opts.scenario;
  const rng = createRng(opts.seed);
  const cfg = defineConfig(opts.config);
  const modCfg = defineModConfig({ sampling: { seed: `sim-${opts.seed}` } });
  const modAcc = opts.moderatorAccuracy ?? 0.95;

  const users: User[] = [];
  const add = (n: number, group: Group, accuracy: () => number, rep = 0) => {
    for (let i = 0; i < n; i++) users.push({ id: `${group}${i}`, group, accuracy: accuracy(), activity: 0.5 + rng.next(), rep });
  };
  add(sc.honest, "honest", () => sc.accuracy[0] + rng.next() * (sc.accuracy[1] - sc.accuracy[0]));
  add(sc.followers ?? 0, "follower", () => 0.6);
  add(sc.attackers ?? 0, "attacker", () => 0.8, sc.attackerRep ?? 0);
  add(sc.sybils ?? 0, "sybil", () => 0.6);
  const byId = new Map(users.map((u) => [u.id, u]));
  const attackers = users.filter((u) => u.group === "attacker");
  const sybils = users.filter((u) => u.group === "sybil");
  const naturalPool = users.filter((u) => u.group !== "sybil");
  const honestAuthors = users.filter((u) => u.group === "honest" || u.group === "follower");

  for (let i = 0; i < sc.points; i++) {
    const byAttacker = attackers.length > 0 && rng.chance(sc.attackerAuthorShare ?? 0);
    const author = byAttacker ? rng.pick(attackers) : rng.pick(honestAuthors);
    const truthGood = byAttacker ? rng.chance(0.05) : rng.chance(0.8);
    const truth: VoteChoice = truthGood ? "approve" : "reject";
    const truthVerdict: Verdict = truthGood ? "approved" : "rejected";
    const oracle = (): Verdict => (rng.chance(modAcc) ? truthVerdict : truthGood ? "rejected" : "approved");

    const authorWeight = authorStartWeight(author.rep, cfg);
    const sub = openSubmission({ id: `p${i}`, authorId: author.id, subjectId: `poi${i}` }, 0, cfg);
    const votes: { voterId: string; choice: VoteChoice; weight: number }[] = [];
    const arrivals: { user: User; pos: number }[] = [];
    let approveW = authorWeight;
    let rejectW = 0;

    const honestVote = (acc: number): VoteChoice => (rng.chance(acc) ? truth : truth === "approve" ? "reject" : "approve");
    const followVote = (): VoteChoice => (votes.length === 0 || opts.hideInterim ? honestVote(0.6) : approveW >= rejectW ? "approve" : "reject");
    const choose = (u: User): VoteChoice | null => {
      switch (u.group) {
        case "honest": return honestVote(u.accuracy);
        case "follower": return followVote();
        case "attacker": return byAttacker ? "approve" : honestVote(u.accuracy);
        case "sybil": return byAttacker ? "approve" : sc.sybilFarm ? followVote() : null;
      }
    };
    const cast = (u: User, pos: number) => {
      const choice = choose(u);
      if (!choice) return;
      const weight = voteWeight(u.rep, cfg);
      votes.push({ voterId: u.id, choice, weight });
      if (choice === "approve") approveW += weight; else rejectW += weight;
      arrivals.push({ user: u, pos });
    };

    const k = rng.chance(0.85) ? rng.int(2, 5) : rng.int(10, 15);
    rng.sample(naturalPool.filter((u) => u.id !== author.id), k).forEach((u, idx) => cast(u, idx + 1));
    sybils.forEach((u, idx) => cast(u, k + idx + 1)); // fake accounts arrive last and can watch the interim

    let now = sub.windowEndsAt;
    let t = advance(sub, votes, authorWeight, now, cfg);
    while (t.kind === "extended") {
      now = t.submission.windowEndsAt;
      t = advance(t.submission, votes, authorWeight, now, cfg);
    }

    let verdict: Verdict;
    let deltas: ReputationDelta[];
    if (t.kind === "resolved") {
      verdict = t.submission.outcome.verdict;
      deltas = settleDeltas({ authorId: author.id, votes }, verdict, cfg);
      if (opts.mod) {
        const c = auditCase(t, votes, now, cfg, modCfg);
        if (c) {
          into.sampled++;
          const r = applyDecision({ submission: t.submission, votes, authorWeight, decision: { verdict: oracle() }, now }, cfg);
          deltas = [...deltas, ...r.deltas];
          verdict = r.submission.outcome.verdict;
          if (r.change === "overridden") into.overridden++;
        }
      }
    } else if (t.kind === "review") {
      into.review++;
      const decision = opts.mod ? { verdict: oracle() } : (decideByWeight(reviewRequest(t, now)) as { verdict: Verdict });
      const r = applyDecision({ submission: t.submission, votes, authorWeight, decision, now }, cfg);
      verdict = r.submission.outcome.verdict;
      deltas = r.deltas;
    } else {
      throw new Error(`unexpected transition ${t.kind}`);
    }

    const gainOf = new Map<string, number>();
    for (const d of deltas) {
      const u = byId.get(d.userId);
      if (u) u.rep += d.delta;
      gainOf.set(d.userId, d.delta);
    }
    for (const a of arrivals) {
      if (a.user.group !== "honest" && a.user.group !== "follower") continue;
      const key = `${a.user.group}:${Math.min(a.pos, 5)}`;
      const g = (into.gain[key] ??= { sum: 0, n: 0 });
      g.sum += gainOf.get(a.user.id) ?? 0;
      g.n += 1;
    }

    into.points++;
    if ((verdict === "approved") === truthGood) into.correct++;
    if (truthGood) { into.good++; if (verdict === "rejected") into.goodRejected++; }
    else { into.bad++; if (verdict === "approved") into.badApproved++; }
    if (byAttacker && !truthGood) { into.attackerBad++; if (verdict === "approved") into.attackerBadApproved++; }
  }

  const weights = users.map((u) => voteWeight(u.rep, cfg));
  const total = weights.reduce((s, w) => s + w, 0);
  const evil = users.reduce((s, u, i) => s + (u.group === "attacker" || u.group === "sybil" ? (weights[i] as number) : 0), 0);
  const top5 = [...weights].sort((a, b) => b - a).slice(0, 5).reduce((s, w) => s + w, 0);
  into.runs++;
  into.attackerWeightShare += evil / total;
  into.top5WeightShare += top5 / total;
  into.maxWeight = Math.max(into.maxWeight, ...weights);
  for (const u of users) { into.rep[u.group].sum += u.rep; into.rep[u.group].n++; }
}
