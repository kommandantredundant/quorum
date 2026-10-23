import { h, errorMessage, formatDate, getDefaults, resolveClient } from "./dom.js";
import { labelsFor, type Labels } from "./labels.js";
import { css } from "./style.js";
import type { ModCaseView, QuorumClient, Verdict } from "./types.js";

/**
 * <quorum-moderation lang="de" api="/api/quorum">
 *
 * The open cases a moderator may take, with approve/reject buttons. The host decides what
 * a case is about by setting `subjectRenderer` (return a Node for rich content; plain strings are shown as text).
 * Events: quorum-loaded, quorum-decided ({id, verdict}), quorum-error ({error}).
 */
export class QuorumModerationElement extends HTMLElement {
  static observedAttributes = ["lang", "api"];

  client: QuorumClient | undefined;
  labels: Partial<Labels> | undefined;
  subjectRenderer: ((c: ModCaseView) => Node | string) | undefined;

  private cases: ModCaseView[] | null = null;
  private errors = new Map<string, string>();
  private busyId: string | null = null;
  private error: string | null = null;
  private readonly sheet = h("style");

  connectedCallback(): void {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.sheet.textContent = css;
    void this.refresh();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) void this.refresh();
  }

  async refresh(): Promise<void> {
    const client = resolveClient(this.client, this.getAttribute("api"));
    try {
      if (!client.getQueue) throw new Error("This client does not support the moderation queue.");
      this.cases = await client.getQueue();
      this.error = null;
      this.dispatchEvent(new CustomEvent("quorum-loaded", { detail: { cases: this.cases } }));
    } catch (e) {
      this.error = errorMessage(e, this.l().errorGeneric);
      this.dispatchEvent(new CustomEvent("quorum-error", { detail: { error: e } }));
    }
    this.render();
  }

  private async decide(c: ModCaseView, verdict: Verdict): Promise<void> {
    if (this.busyId) return;
    const client = resolveClient(this.client, this.getAttribute("api"));
    this.busyId = c.id;
    this.errors.delete(c.id);
    this.render();
    try {
      if (!client.decide) throw new Error("This client does not support decisions.");
      await client.decide(c.id, verdict);
      this.cases = (this.cases ?? []).filter((x) => x.id !== c.id);
      this.dispatchEvent(new CustomEvent("quorum-decided", { detail: { id: c.id, verdict } }));
    } catch (e) {
      this.errors.set(c.id, errorMessage(e, this.l().errorGeneric));
      this.dispatchEvent(new CustomEvent("quorum-error", { detail: { error: e } }));
    }
    this.busyId = null;
    this.render();
  }

  private l(): Labels {
    return labelsFor(this.getAttribute("lang") ?? this.closest("[lang]")?.getAttribute("lang") ?? document.documentElement.lang, {
      ...getDefaults().labels,
      ...this.labels,
    });
  }

  private render(): void {
    const root = this.shadowRoot;
    if (!root) return;
    const l = this.l();
    const lang = this.getAttribute("lang") || document.documentElement.lang || null;
    const section = h("section", { class: "root", part: "root" }, h("h3", { class: "title", part: "title" }, l.queueTitle));

    if (this.error) {
      const retry = h("button", { type: "button", part: "button" }, l.retry);
      retry.addEventListener("click", () => void this.refresh());
      section.append(h("p", { class: "error", part: "error", role: "alert" }, this.error), retry);
    } else if (this.cases === null) {
      section.append(h("p", { class: "status", role: "status" }, l.loading));
    } else if (this.cases.length === 0) {
      section.append(h("p", { class: "status", part: "status", role: "status" }, l.queueEmpty));
    } else {
      const list = h("ul");
      for (const c of this.cases) {
        const btn = (verdict: Verdict, cls: string, text: string) => {
          const b = h("button", { type: "button", class: cls, part: `button button-${cls}` }, text);
          b.disabled = this.busyId !== null;
          b.addEventListener("click", () => void this.decide(c, verdict));
          return b;
        };
        const meta = [
          c.mode === "decision" ? l.modeDecision : l.modeAudit,
          c.herdVerdict ? (c.herdVerdict === "approved" ? l.herdApproved : l.herdRejected) : null,
          c.approvalRatio !== null ? l.approvalRatio(Math.round(c.approvalRatio * 100)) : null,
          l.requestedAt(formatDate(c.requestedAt, lang)),
        ].filter(Boolean).join(" · ");
        const subject = this.subjectRenderer?.(c);
        const err = this.errors.get(c.id);
        list.append(
          h("li", { class: "case", part: "case" },
            h("p", { class: "case-title" }, l.reasons[c.reason]),
            h("p", { class: "meta" }, meta),
            subject ? h("div", { class: "subject" }, subject) : null,
            h("div", { class: "actions" }, btn("approved", "approve", l.decideApprove), btn("rejected", "reject", l.decideReject)),
            err ? h("p", { class: "error", part: "error", role: "alert" }, err) : null),
        );
      }
      section.append(list);
    }
    root.replaceChildren(this.sheet, section);
  }
}
