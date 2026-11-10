import { defineConfig, type DeepPartial, type QuorumConfig } from "./config.js";
import { applyDecision } from "./decision.js";
import { tally } from "./evaluate.js";
import { decideByWeight, type ReviewHandler } from "./handler.js";
import { advance, canVote, openSubmission, type Transition } from "./lifecycle.js";
import { settleDeltas, type ReputationDelta } from "./reputation.js";
import { reviewRequest, type ReviewRequest } from "./review.js";
import type { CoreStorage } from "./storage.js";
import type { Submission, SubmissionId, SubmissionStatus, SubjectId, Timestamp, UserId, Verdict, Vote, VoteChoice } from "./types.js";
import { authorStartWeight, voteWeight } from "./weight.js";

/**
 * Orchestration: wires the pure core to a storage and the host's identity.
 *
 * TRUST BOUNDARY (what the host must and must not do)
 * - Identity comes only from `hooks.currentUser(ctx)`, resolved from the host's own
 *   authenticated session. No method accepts a user ID from the client.
 * - Everything that matters is computed here, on the server: vote weight (from stored
 *   reputation), window checks, one vote per voter, author cannot vote.
 * - The browser never sees head counts or voters, only total weights (`getInterimResult`).
 * - Rate limiting and abuse protection (fake accounts) are the host's job.
 */

export type QuorumErrorCode = "unauthenticated" | "not_found" | "forbidden" | "closed" | "conflict" | "invalid";

/** Map `code` to an HTTP status in the host (401, 404, 403, 409, 409, 400). */
export class QuorumError extends Error {
  constructor(
    public readonly code: QuorumErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "QuorumError";
  }
}

export interface QuorumHooks<Ctx> {
  /** The authenticated user for this request, or null if nobody is logged in. */
  currentUser(ctx: Ctx): UserId | null | Promise<UserId | null>;
}

export interface QuorumOptions<S extends CoreStorage, Ctx> {
  storage: S;
  hooks: QuorumHooks<Ctx>;
  config?: DeepPartial<QuorumConfig>;
  /** Who answers review cases. Default: `decideByWeight` (no moderation needed). */
  reviewHandler?: ReviewHandler;
  /** Called inside the same transaction when the handler deferred a case (e.g. to enqueue it in quorum-mod). */
  onDeferred?: (request: ReviewRequest, tx: S) => Promise<void>;
  /** Called inside the same transaction after a submission was resolved by weight (e.g. spot-check sampling). */
  onResolved?: (t: Extract<Transition, { kind: "resolved" }>, votes: readonly Vote[], tx: S) => Promise<void>;
  now?: () => Timestamp;
  newId?: () => string;
}

export type ProcessResult = "none" | "pending" | "extended" | "deferred" | "resolved" | "skipped";

/** Weights only: no head counts, no voters, no individual choices. */
export interface InterimResult {
  submissionId: SubmissionId;
  status: SubmissionStatus;
  windowEndsAt: Timestamp;
  approveWeight: number;
  rejectWeight: number;
  /** Only once resolved. */
  verdict?: Verdict;
}

/** What a page needs to render one submission for the current visitor. Weights only, never head counts or voters. */
export interface SubmissionView extends InterimResult {
  /** The visitor's own vote, if any. */
  myVote: VoteChoice | null;
  /** Logged in, not the author, window open, not voted yet. The server still re-checks on `vote`. */
  canVote: boolean;
}

/** One entry of a member's own history. Only ever shown to that member. */
export interface ProfileActivity {
  submissionId: SubmissionId;
  subjectId: SubjectId;
  /** Host content of the submission, so the page can show a name. */
  payload?: unknown;
  role: "voter" | "author";
  /** The member's vote (role "voter" only). */
  choice?: VoteChoice;
  status: SubmissionStatus;
  /** Final verdict, once resolved. */
  verdict?: Verdict;
  /** true / false once resolved: did the final verdict match the vote (or approve the submission)? null while open. */
  matched: boolean | null;
  /** When the member voted or submitted. */
  at: Timestamp;
}

/** What `<quorum-profile>` shows: the visitor's own trust and history. Never anyone else's. */
export interface ProfileView {
  userId: UserId;
  /** Raw reputation. Shown as a level, not as a number, in the default UI. */
  reputation: number;
  /** Current vote weight, derived from reputation. */
  weight: number;
  /** Highest possible weight (`weight.cap`), or null if uncapped. */
  maxWeight: number | null;
  /** Weight of a new member (`weight.base`). */
  baseWeight: number;
  /** Newest first. Null if the storage does not support history. */
  recent: ProfileActivity[] | null;
}

export function createQuorum<S extends CoreStorage, Ctx = unknown>(options: QuorumOptions<S, Ctx>) {
  const { storage, hooks } = options;
  const cfg = defineConfig(options.config);
  const reviewHandler = options.reviewHandler ?? decideByWeight;
  const clock = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());

  async function requireUser(ctx: Ctx): Promise<UserId> {
    const user = await hooks.currentUser(ctx);
    if (!user) throw new QuorumError("unauthenticated", "Login required");
    return user;
  }

  async function weightOfUser(db: CoreStorage, userId: UserId): Promise<number> {
    const rep = await db.getReputation(userId);
    return voteWeight(rep?.value ?? cfg.reputation.startValue, cfg);
  }

  async function book(tx: CoreStorage, deltas: readonly ReputationDelta[], now: Timestamp): Promise<void> {
    for (const d of deltas) await tx.addReputation(d.userId, d.delta, cfg.reputation.startValue, now);
  }

  const canVoteNow = (s: Submission): boolean => canVote(s, clock());

  async function submit(ctx: Ctx, input: { subjectId: SubjectId; payload?: unknown }): Promise<Submission> {
    const author = await requireUser(ctx);
    if (typeof input.subjectId !== "string" || input.subjectId === "") throw new QuorumError("invalid", "subjectId is required");
    const now = clock();
    const submission = openSubmission(
      { id: newId(), authorId: author, subjectId: input.subjectId, ...(input.payload !== undefined && { payload: input.payload }) },
      now,
      cfg,
    );
    const authorRep = await storage.getReputation(author);
    const authorWeight = authorStartWeight(authorRep?.value ?? cfg.reputation.startValue, cfg);
    await storage.insertSubmission({ submission, authorWeight });
    return submission;
  }

  async function vote(ctx: Ctx, submissionId: SubmissionId, choice: VoteChoice): Promise<void> {
    const voter = await requireUser(ctx);
    if (choice !== "approve" && choice !== "reject") throw new QuorumError("invalid", "choice must be approve or reject");
    const stored = await storage.getSubmission(submissionId);
    if (!stored) throw new QuorumError("not_found", `Submission ${submissionId} not found`);
    const { submission } = stored;
    if (submission.authorId === voter) throw new QuorumError("forbidden", "Authors cannot vote on their own submission");
    const now = clock();
    if (!canVote(submission, now)) throw new QuorumError("closed", "Voting is closed for this submission");
    const weight = await weightOfUser(storage, voter);
    const inserted = await storage.insertVote({ submissionId, voterId: voter, choice, weight, castAt: now });
    if (!inserted) throw new QuorumError("conflict", "You already voted on this submission");
  }

  /** Advance one submission if its window has ended. Safe to call from several servers at once. */
  async function processSubmission(id: SubmissionId): Promise<ProcessResult> {
    const stored = await storage.getSubmission(id);
    if (!stored) throw new QuorumError("not_found", `Submission ${id} not found`);
    if (stored.submission.status !== "open") return "none";
    const now = clock();
    if (now < stored.submission.windowEndsAt) return "pending";

    return storage.transaction(async (tx): Promise<ProcessResult> => {
      const fresh = await tx.getSubmission(id);
      if (!fresh || fresh.submission.status !== "open") return "skipped";
      const votes = await tx.listVotes(id);
      const t = advance(fresh.submission, votes, fresh.authorWeight, now, cfg);

      switch (t.kind) {
        case "none":
        case "pending":
          return t.kind;
        case "extended":
          return (await tx.updateSubmission(fresh.submission, t.submission)) ? "extended" : "skipped";
        case "resolved": {
          if (!(await tx.updateSubmission(fresh.submission, t.submission))) return "skipped";
          await book(tx, settleDeltas({ authorId: t.submission.authorId, votes }, t.submission.outcome.verdict, cfg), now);
          await options.onResolved?.(t, votes, tx);
          return "resolved";
        }
        case "review": {
          const request = reviewRequest(t, now);
          const resolution = await reviewHandler(request);
          if (resolution === "defer") {
            if (!(await tx.updateSubmission(fresh.submission, t.submission))) return "skipped";
            await options.onDeferred?.(request, tx);
            return "deferred";
          }
          const result = applyDecision(
            { submission: t.submission, votes, authorWeight: fresh.authorWeight, decision: resolution, now },
            cfg,
          );
          if (!(await tx.updateSubmission(fresh.submission, result.submission))) return "skipped";
          await book(tx, result.deltas, now);
          return "resolved";
        }
      }
    });
  }

  /** For a cron job (or any periodic trigger): process every submission whose window has ended. */
  async function processDue(limit = 100): Promise<{ processed: number; failed: { id: SubmissionId; error: unknown }[] }> {
    const due = await storage.listDueSubmissions(clock(), limit);
    let processed = 0;
    const failed: { id: SubmissionId; error: unknown }[] = [];
    for (const d of due) {
      try {
        const r = await processSubmission(d.submission.id);
        if (r !== "skipped" && r !== "none" && r !== "pending") processed += 1;
      } catch (error) {
        failed.push({ id: d.submission.id, error });
      }
    }
    return { processed, failed };
  }

  /** Public interim result: total weight yes/no only. Also advances the submission lazily if its window ended. */
  async function getInterimResult(id: SubmissionId): Promise<InterimResult> {
    await processSubmission(id);
    const stored = await storage.getSubmission(id);
    if (!stored) throw new QuorumError("not_found", `Submission ${id} not found`);
    const t = tally({ votes: await storage.listVotes(id), authorWeight: stored.authorWeight });
    const s = stored.submission;
    return {
      submissionId: id,
      status: s.status,
      windowEndsAt: s.windowEndsAt,
      approveWeight: t.approveWeight,
      rejectWeight: t.rejectWeight,
      ...(s.status === "resolved" && { verdict: s.outcome.verdict }),
    };
  }

  /** Interim result plus the visitor's own state. Anonymous visitors are fine (no vote, cannot vote). */
  async function getView(ctx: Ctx, id: SubmissionId): Promise<SubmissionView> {
    const interim = await getInterimResult(id);
    const stored = await storage.getSubmission(id);
    if (!stored) throw new QuorumError("not_found", `Submission ${id} not found`);
    const user = await hooks.currentUser(ctx);
    const myVote = user ? ((await storage.listVotes(id)).find((v) => v.voterId === user)?.choice ?? null) : null;
    const s = stored.submission;
    const canVote = !!user && s.authorId !== user && myVote === null && canVoteNow(s);
    return { ...interim, myVote, canVote };
  }

  function activityOf(s: Submission, role: "voter" | "author", at: Timestamp, choice?: VoteChoice): ProfileActivity {
    const verdict = s.status === "resolved" ? s.outcome.verdict : undefined;
    const wanted: Verdict = role === "author" || choice === "approve" ? "approved" : "rejected";
    return {
      submissionId: s.id,
      subjectId: s.subjectId,
      ...(s.payload !== undefined && { payload: s.payload }),
      role,
      ...(choice && { choice }),
      status: s.status,
      ...(verdict && { verdict }),
      matched: verdict ? verdict === wanted : null,
      at,
    };
  }

  /** The logged-in member's own trust level and recent history. Requires login. */
  async function getProfile(ctx: Ctx, options: { limit?: number } = {}): Promise<ProfileView> {
    const user = await requireUser(ctx);
    const limit = Math.max(1, Math.min(50, Math.floor(options.limit ?? 10)));
    const reputation = (await storage.getReputation(user))?.value ?? cfg.reputation.startValue;

    let recent: ProfileActivity[] | null = null;
    if (storage.listVotesByVoter && storage.listSubmissionsByAuthor) {
      const [votes, authored] = await Promise.all([storage.listVotesByVoter(user, limit), storage.listSubmissionsByAuthor(user, limit)]);
      const items: ProfileActivity[] = authored.map(({ submission: s }) => activityOf(s, "author", s.createdAt));
      for (const v of votes) {
        const stored = await storage.getSubmission(v.submissionId);
        if (stored) items.push(activityOf(stored.submission, "voter", v.castAt, v.choice));
      }
      recent = items.sort((a, b) => b.at - a.at || a.submissionId.localeCompare(b.submissionId)).slice(0, limit);
    }

    return {
      userId: user,
      reputation,
      weight: voteWeight(reputation, cfg),
      maxWeight: Number.isFinite(cfg.weight.cap) ? cfg.weight.cap : null,
      baseWeight: cfg.weight.base,
      recent,
    };
  }

  return { submit, vote, processSubmission, processDue, getInterimResult, getView, getProfile, config: cfg };
}
