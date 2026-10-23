import { h, errorMessage, formatDate, getDefaults, resolveClient, resolveMode } from "./dom.js";
import { labelsFor, type Labels } from "./labels.js";
import { css } from "./style.js";
import type { QuorumClient, SubmissionView, VoteChoice } from "./types.js";
import { interimVisible, phaseOf, shares } from "./view-model.js";

/**
 * <quorum-vote submission-id="…" show-interim="after-vote" lang="de" api="/api/quorum">
 *
 * Shows the weighted interim result (yes/no only, never head counts or voters), the vote buttons
 * and the final state. Events: quorum-loaded, quorum-voted ({choice}), quorum-error ({error}).
 */
export class QuorumVoteElement extends HTMLElement {
  static observedAttributes = ["submission-id", "show-interim", "lang", "api"];

  /** Set to use your own client instead of the HTTP one. */
  client: QuorumClient | undefined;
  /** Override individual labels. */
  labels: Partial<Labels> | undefined;

  private view: SubmissionView | null = null;
  private error: string | null = null;
  private busy = false;
  private loading = false;
  private readonly sheet = h("style");

  connectedCallback(): void {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.sheet.textContent = css;
    void this.refresh();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) void this.refresh();
  }

  get submissionId(): string | null {
    return this.getAttribute("submission-id");
  }

  /** Reload from the server. */
  async refresh(): Promise<void> {
    const id = this.submissionId;
    if (!id) return;
    this.loading = this.view === null;
    this.render();
    try {
      this.view = await resolveClient(this.client, this.getAttribute("api")).getSubmission(id);
      this.error = null;
      this.dispatchEvent(new CustomEvent("quorum-loaded", { detail: { view: this.view } }));
    } catch (e) {
      this.fail(e);
    }
    this.loading = false;
    this.render();
  }

  private fail(e: unknown): void {
    this.error = errorMessage(e, this.l().errorGeneric);
    this.dispatchEvent(new CustomEvent("quorum-error", { detail: { error: e } }));
  }

  private async vote(choice: VoteChoice): Promise<void> {
    const id = this.submissionId;
    if (!id || this.busy) return;
    this.busy = true;
    this.error = null;
    this.render();
    try {
      await resolveClient(this.client, this.getAttribute("api")).vote(id, choice);
      this.dispatchEvent(new CustomEvent("quorum-voted", { detail: { choice } }));
      this.busy = false;
      await this.refresh();
      return;
    } catch (e) {
      this.fail(e);
    }
    this.busy = false;
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
    const section = h("section", { class: "root", part: "root" }, h("h3", { class: "title", part: "title" }, l.title));
    const v = this.view;
    const now = Date.now();

    if (!v) {
      section.append(h("p", { class: "status", part: "status", role: "status" }, this.loading ? l.loading : ""));
    } else {
      const phase = phaseOf(v, now);
      const visible = interimVisible(resolveMode(this.getAttribute("show-interim")), v, now);
      const s = shares(v.approveWeight, v.rejectWeight);

      if (visible && s) {
        section.append(
          h("div", { class: "bar", part: "bar", role: "img", "aria-label": l.barLabel(s.yes, s.no) },
            h("div", { class: "bar-yes", part: "bar-yes", style: `flex-basis:${s.yes}%` }),
            h("div", { class: "bar-no", part: "bar-no", style: `flex-basis:${s.no}%` })),
          h("div", { class: "legend", part: "legend", "aria-hidden": "true" },
            h("span", { class: "yes" }, `${l.yes} ${s.yes} %`),
            h("span", { class: "no" }, `${l.no} ${s.no} %`)),
        );
      } else if (!visible && phase === "voting") {
        section.append(h("p", { class: "hint", part: "status" }, l.interimHidden));
      }

      if (v.canVote) {
        const btn = (choice: VoteChoice, text: string) => {
          const b = h("button", { type: "button", class: choice, part: `button button-${choice}` }, text);
          b.disabled = this.busy;
          b.addEventListener("click", () => void this.vote(choice));
          return b;
        };
        section.append(h("div", { class: "actions" }, btn("approve", l.approve), btn("reject", l.reject)));
      }

      const status =
        phase === "resolved" ? (v.verdict === "approved" ? l.resolvedApproved : l.resolvedRejected)
        : phase === "review" ? l.inReview
        : phase === "awaiting" ? l.awaiting
        : v.myVote ? (v.myVote === "approve" ? l.votedApprove : l.votedReject)
        : l.closesAt(formatDate(v.windowEndsAt, lang));
      section.append(h("p", { class: "status", part: "status", role: "status" }, status));
      if (phase === "voting" && v.myVote) section.append(h("p", { class: "meta" }, l.closesAt(formatDate(v.windowEndsAt, lang))));
    }

    if (this.error) {
      const retry = h("button", { type: "button", part: "button" }, l.retry);
      retry.addEventListener("click", () => void this.refresh());
      section.append(h("p", { class: "error", part: "error", role: "alert" }, this.error), retry);
    }
    root.replaceChildren(this.sheet, section);
  }
}
