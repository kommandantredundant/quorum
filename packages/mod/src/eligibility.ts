import type { ModConfig } from "./config.js";
import { pendingQueue } from "./queue.js";
import type { ModCase, PendingCase } from "./types.js";
import type { ModHooks } from "./hooks.js";

/**
 * Whether a moderator may take a case, given the current number of moderators:
 * - moderators >= excludeAuthoredFrom: not their own submissions
 * - moderators >= excludeVotedFrom:    also not submissions they voted on
 * Note: if every moderator is excluded from a case, it stays open until someone
 * outside the conflict is added; that is a host staffing question, not a core one.
 */
export async function isEligible(c: ModCase, moderatorId: string, hooks: ModHooks, config: ModConfig): Promise<boolean> {
  return eligibleWith(await hooks.countModerators(), c, moderatorId, hooks, config);
}

async function eligibleWith(n: number, c: ModCase, moderatorId: string, hooks: ModHooks, config: ModConfig): Promise<boolean> {
  const { excludeAuthoredFrom, excludeVotedFrom } = config.conflicts;
  if (n >= excludeAuthoredFrom && c.request.authorId === moderatorId) return false;
  if (n >= excludeVotedFrom && (await hooks.hasVoted(moderatorId, c.id))) return false;
  return true;
}

/** The pending cases this moderator may take, in work order. */
export async function queueFor(moderatorId: string, cases: readonly ModCase[], hooks: ModHooks, config: ModConfig): Promise<PendingCase[]> {
  const n = await hooks.countModerators();
  const out: PendingCase[] = [];
  for (const c of pendingQueue(cases)) {
    if (await eligibleWith(n, c, moderatorId, hooks, config)) out.push(c);
  }
  return out;
}
