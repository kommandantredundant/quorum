export interface Labels {
  title: string;
  approve: string;
  reject: string;
  yes: string;
  no: string;
  loading: string;
  retry: string;
  errorGeneric: string;
  interimHidden: string;
  votedApprove: string;
  votedReject: string;
  closesAt: (date: string) => string;
  awaiting: string;
  inReview: string;
  resolvedApproved: string;
  resolvedRejected: string;
  barLabel: (yes: number, no: number) => string;
  queueTitle: string;
  queueEmpty: string;
  decideApprove: string;
  decideReject: string;
  decided: string;
  modeDecision: string;
  modeAudit: string;
  herdApproved: string;
  herdRejected: string;
  requestedAt: (date: string) => string;
  approvalRatio: (pct: number) => string;
  reasons: Record<"grey_zone" | "weight_conflict" | "sample" | "extension_limit", string>;
}

export const en: Labels = {
  title: "Community vote",
  approve: "Approve",
  reject: "Reject",
  yes: "Approve",
  no: "Reject",
  loading: "Loading…",
  retry: "Try again",
  errorGeneric: "Something went wrong.",
  interimHidden: "The interim result is shown after you have voted.",
  votedApprove: "You approved this.",
  votedReject: "You rejected this.",
  closesAt: (d) => `Voting ends ${d}`,
  awaiting: "Voting has ended, the result is being determined.",
  inReview: "Under review by a moderator.",
  resolvedApproved: "Approved by the community.",
  resolvedRejected: "Rejected by the community.",
  barLabel: (y, n) => `Approval ${y} %, rejection ${n} %`,
  queueTitle: "Moderation queue",
  queueEmpty: "No open cases.",
  decideApprove: "Approve",
  decideReject: "Reject",
  decided: "Decided.",
  modeDecision: "Needs a decision",
  modeAudit: "Spot check",
  herdApproved: "Community verdict: approved",
  herdRejected: "Community verdict: rejected",
  requestedAt: (d) => `Since ${d}`,
  approvalRatio: (p) => `${p} % weighted approval`,
  reasons: {
    grey_zone: "Too close to call",
    weight_conflict: "Few heavy votes against many light ones",
    sample: "Randomly selected for checking",
    extension_limit: "Too few votes after all extensions",
  },
};

export const de: Labels = {
  title: "Abstimmung der Community",
  approve: "Zustimmen",
  reject: "Ablehnen",
  yes: "Zustimmung",
  no: "Ablehnung",
  loading: "Lädt …",
  retry: "Erneut versuchen",
  errorGeneric: "Etwas ist schiefgelaufen.",
  interimHidden: "Der Zwischenstand wird nach deiner Stimme angezeigt.",
  votedApprove: "Du hast zugestimmt.",
  votedReject: "Du hast abgelehnt.",
  closesAt: (d) => `Abstimmung endet ${d}`,
  awaiting: "Die Abstimmung ist beendet, das Ergebnis wird ermittelt.",
  inReview: "Wird von einem Moderator geprüft.",
  resolvedApproved: "Von der Community genehmigt.",
  resolvedRejected: "Von der Community abgelehnt.",
  barLabel: (y, n) => `Zustimmung ${y} %, Ablehnung ${n} %`,
  queueTitle: "Moderationswarteschlange",
  queueEmpty: "Keine offenen Fälle.",
  decideApprove: "Genehmigen",
  decideReject: "Ablehnen",
  decided: "Entschieden.",
  modeDecision: "Braucht eine Entscheidung",
  modeAudit: "Stichprobe",
  herdApproved: "Urteil der Community: genehmigt",
  herdRejected: "Urteil der Community: abgelehnt",
  requestedAt: (d) => `Seit ${d}`,
  approvalRatio: (p) => `${p} % gewichtete Zustimmung`,
  reasons: {
    grey_zone: "Zu knapp für eine Entscheidung",
    weight_conflict: "Wenige schwere Stimmen gegen viele leichte",
    sample: "Zufällig zur Kontrolle ausgewählt",
    extension_limit: "Zu wenige Stimmen nach allen Verlängerungen",
  },
};

/** Built-in languages: German for `de*`, English otherwise. Individual labels can be overridden. */
export function labelsFor(lang: string | null | undefined, overrides: Partial<Labels> = {}): Labels {
  const base = lang && lang.toLowerCase().startsWith("de") ? de : en;
  return { ...base, ...overrides };
}
