import {
  defineConfig,
  deferToModeration,
  QuorumError,
  type CoreStorage,
  type DeepPartial,
  type QuorumConfig,
  type ReviewRequest,
  type Timestamp,
  type Transition,
  type UserId,
  type Verdict,
  type Vote,
} from "quorum-core";
import { defineModConfig, type ModConfig } from "./config.js";
import { decideCase, reviseCase, type DecideCaseResult } from "./decide.js";
import { queueFor } from "./eligibility.js";
import type { ModHooks } from "./hooks.js";
import { openCase } from "./queue.js";
import { auditCase } from "./sampling.js";
import type { ModStorage } from "./storage.js";
import { toCaseView, type ModCaseView, type PendingCase } from "./types.js";

/** What the host provides. `hasVoted` comes from the storage, so it is not needed here. */
export interface ModServiceHooks<Ctx> extends Pick<ModHooks, "isModerator" | "countModerators"> {
  currentUser(ctx: Ctx): UserId | null | Promise<UserId | null>;
}

export interface ModerationOptions<S extends CoreStorage & ModStorage, Ctx> {
  storage: S;
  hooks: ModServiceHooks<Ctx>;
  /** Must be the same core config that is passed to `createQuorum`. */
  config?: DeepPartial<QuorumConfig>;
  mod?: DeepPartial<ModConfig>;
  now?: () => Timestamp;
}

/**
 * Wiring of quorum-mod into quorum-core's orchestration:
 *
 *   const mod = createModeration({ storage, hooks, config });
 *   const quorum = createQuorum({ storage, hooks, config,
 *     reviewHandler: mod.reviewHandler, onDeferred: mod.onDeferred, onResolved: mod.onResolved });
 *
 * Leave quorum-mod out and the core decides by weight on its own.
 */
export function createModeration<S extends CoreStorage & ModStorage, Ctx = unknown>(options: ModerationOptions<S, Ctx>) {
  const { storage } = options;
  const core = defineConfig(options.config);
  const mod = defineModConfig(options.mod);
  const clock = options.now ?? Date.now;

  const hooksFor = (db: CoreStorage): ModHooks => ({
    isModerator: (u) => options.hooks.isModerator(u),
    countModerators: () => options.hooks.countModerators(),
    hasVoted: (u, s) => db.hasVoted(u, s),
  });

  async function requireModerator(ctx: Ctx): Promise<UserId> {
    const user = await options.hooks.currentUser(ctx);
    if (!user) throw new QuorumError("unauthenticated", "Login required");
    if (!(await options.hooks.isModerator(user))) throw new QuorumError("forbidden", "Moderators only");
    return user;
  }

  /** Pending cases this moderator may take, in work order. */
  async function queue(ctx: Ctx): Promise<PendingCase[]> {
    const user = await requireModerator(ctx);
    return queueFor(user, await storage.listCases({ status: "pending" }), hooksFor(storage), mod);
  }

  /** Same as `queue`, shaped for the moderation UI. */
  async function queueView(ctx: Ctx): Promise<ModCaseView[]> {
    return (await queue(ctx)).map(toCaseView);
  }

  /** Decide a pending case, or revise an already decided one. Persists case, submission and reputation atomically. */
  async function decide(ctx: Ctx, submissionId: string, verdict: Verdict): Promise<DecideCaseResult> {
    const user = await requireModerator(ctx);
    if (verdict !== "approved" && verdict !== "rejected") throw new QuorumError("invalid", "verdict must be approved or rejected");

    return storage.transaction(async (tx) => {
      const c = await tx.getCase(submissionId);
      const stored = await tx.getSubmission(submissionId);
      if (!c || !stored) throw new QuorumError("not_found", `No moderation case for ${submissionId}`);
      const votes = await tx.listVotes(submissionId);
      const now = clock();

      const input = { case: c, moderatorId: user, verdict, submission: stored.submission, votes, authorWeight: stored.authorWeight, now };
      const deps = { hooks: hooksFor(tx), config: core, mod };
      const result = c.status === "pending" ? await decideCase(input, deps) : await reviseCase(input, deps);

      if (result.change !== "confirmed" && !(await tx.updateSubmission(stored.submission, result.submission))) {
        throw new QuorumError("conflict", "The submission changed in the meantime, please retry");
      }
      if (!(await tx.updateCase(c, result.case))) {
        throw new QuorumError("conflict", "The case changed in the meantime, please retry");
      }
      for (const d of result.deltas) await tx.addReputation(d.userId, d.delta, core.reputation.startValue, now);
      return result;
    });
  }

  return {
    reviewHandler: deferToModeration,
    onDeferred: async (request: ReviewRequest, tx: S): Promise<void> => {
      await tx.insertCase(openCase(request, clock()));
    },
    onResolved: async (t: Extract<Transition, { kind: "resolved" }>, votes: readonly Vote[], tx: S): Promise<void> => {
      const c = auditCase(t, votes, clock(), core, mod);
      if (c) await tx.insertCase(c);
    },
    queue,
    queueView,
    decide,
  };
}


