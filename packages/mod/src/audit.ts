import type { Timestamp, UserId } from "quorum-core";
import type { CaseResolution, ModCase } from "./types.js";

/** One line of the audit log: who decided what on which case, and when. */
export interface AuditEntry extends CaseResolution {
  caseId: string;
  mode: "decision" | "audit";
}

export interface AuditFilter {
  caseId?: string;
  moderatorId?: UserId;
  since?: Timestamp;
}

/**
 * Read model over cases: every decision ever made (earlier ones from `previous`, plus the
 * latest), oldest first. Nothing extra to store; the cases already carry the history.
 */
export function auditEntries(cases: readonly ModCase[], filter: AuditFilter = {}): AuditEntry[] {
  const out: AuditEntry[] = [];
  for (const c of cases) {
    if (c.status !== "decided") continue;
    for (const r of [...(c.previous ?? []), c.resolution]) out.push({ ...r, caseId: c.id, mode: c.request.mode });
  }
  return out
    .filter((e) => (filter.caseId === undefined || e.caseId === filter.caseId)
      && (filter.moderatorId === undefined || e.moderatorId === filter.moderatorId)
      && (filter.since === undefined || e.decidedAt >= filter.since))
    .sort((a, b) => a.decidedAt - b.decidedAt || a.caseId.localeCompare(b.caseId));
}
