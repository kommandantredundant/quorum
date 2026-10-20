import type { ModCase } from "./types.js";

/**
 * What quorum-mod needs from a database, on top of quorum-core's `CoreStorage`
 * (one object implements both so a decision and its reputation changes share a transaction).
 *
 * - `insertCase` returns false if a case for that submission already exists.
 * - `updateCase` is a conditional write: it only succeeds if the stored case is still at the
 *   revision of `expected` (see `caseRevision`).
 */
export interface ModStorage {
  insertCase(c: ModCase): Promise<boolean>;
  getCase(id: string): Promise<ModCase | null>;
  updateCase(expected: ModCase, next: ModCase): Promise<boolean>;
  listCases(filter?: { status?: ModCase["status"] }): Promise<ModCase[]>;
}

/** 0 while pending, then 1 + number of earlier decisions. Used for optimistic concurrency. */
export function caseRevision(c: ModCase): number {
  return c.status === "pending" ? 0 : 1 + (c.previous?.length ?? 0);
}
