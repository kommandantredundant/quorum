import { h, errorMessage, formatDate, getDefaults, resolveClient } from "./dom.js";
import { QuorumUiError } from "./client.js";
import { labelsFor, type Labels } from "./labels.js";
import { css } from "./style.js";
import type { ProfileActivity, ProfileView } from "./types.js";
import { defaultSubjectLabel, LEVEL_COUNT, trustLevel } from "./view-model.js";

/**
 * <quorum-profile limit="10" lang="de" api="/api/quorum">
 *
 * Shows the logged-in member their own trust level (as a level, never as a raw number), a short
 * explanation and their recent votes and suggestions with whether they matched the final decision.
 * Only the member's own data: nothing about other members is ever shown.
 * Events: quorum-loaded ({profile}), quorum-error ({error}).
 */
export class QuorumProfileElement extends HTMLElement {
  static observedAttributes = ["limit", "lang", "api", "hide-recent", "hide-explanation"];

  client: import("./types.js").QuorumClient | undefined;
  labels: Partial<Labels> | undefined;
  /** Name shown for a history entry. Default: payload.name, payload.title or the subject ID. */
  subjectLabel: ((a: ProfileActivity) => string) | undefined;
  /** Optional link for a history entry, e.g. to the place on your map. */
  subjectHref: ((a: ProfileActivity) => string | null) | undefined;

  private profile: ProfileView | null = null;
  private loggedOut = false;
  private error: string | null = null;
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

  async refresh(): Promise<void> {
    const client = resolveClient(this.client, this.getAttribute("api"));
    this.loading = this.profile === null;
    this.render();
    try {
      if (!client.getProfile) throw new Error("This client has no getProfile()");
      const raw = this.getAttribute("limit");
      const limit = raw === null ? undefined : Number(raw);
      this.profile = await client.getProfile(limit !== undefined && Number.isFinite(limit) ? limit : undefined);
      this.loggedOut = false;
      this.error = null;
      this.dispatchEvent(new CustomEvent("quorum-loaded", { detail: { profile: this.profile } }));
    } catch (e) {
      if (e instanceof QuorumUiError && e.code === "unauthenticated") {
        this.profile = null;
        this.loggedOut = true;
        this.error = null;
      } else {
        this.error = errorMessage(e, this.l().errorGeneric);
        this.dispatchEvent(new CustomEvent("quorum-error", { detail: { error: e } }));
      }
    }
    this.loading = false;
    this.render();
  }

  private l(): Labels {
    return labelsFor(this.getAttribute("lang") ?? this.closest("[lang]")?.getAttribute("lang") ?? document.documentElement.lang, {
      ...getDefaults().labels,
      ...this.labels,
    });
  }

  private item(a: ProfileActivity, l: Labels, lang: string | null): HTMLLIElement {
    const name = (this.subjectLabel ?? defaultSubjectLabel)(a);
    const href = this.subjectHref?.(a) ?? null;
    const action = a.role === "author" ? l.youSubmitted : a.choice === "approve" ? l.youApproved : l.youRejected;
    const [cls, text] =
      a.matched === true ? ["matched", `✓ ${l.matched}`]
      : a.matched === false ? ["not-matched", l.notMatched]
      : a.status === "needs_review" ? ["pending", l.underReview]
      : ["pending", l.pending];
    return h("li", { part: "item" },
      h("p", { class: "item-subject" }, href ? h("a", { href }, name) : name),
      h("p", { class: "item-meta" },
        h("span", {}, `${action} · ${formatDate(a.at, lang)}`),
        h("span", { class: `outcome ${cls}`, part: `outcome outcome-${cls}` }, text)));
  }

  private render(): void {
    const root = this.shadowRoot;
    if (!root) return;
    const l = this.l();
    const lang = this.getAttribute("lang") || document.documentElement.lang || null;
    const section = h("section", { class: "root", part: "root" }, h("h3", { class: "title", part: "title" }, l.profileTitle));
    const p = this.profile;

    if (this.loggedOut) {
      section.append(h("p", { class: "status", part: "status", role: "status" }, l.profileLoggedOut));
    } else if (!p) {
      section.append(h("p", { class: "status", part: "status", role: "status" }, this.loading ? l.loading : ""));
    } else {
      const level = trustLevel(p);
      const name = l.levels[level] ?? "";
      const meter = h("div", { class: "meter", part: "meter", role: "img", "aria-label": l.levelLabel(name, level + 1, LEVEL_COUNT) });
      for (let i = 0; i < LEVEL_COUNT; i++) meter.append(h("span", i <= level ? { class: "on" } : {}));
      section.append(h("p", { class: "level", part: "level", "aria-hidden": "true" }, name), meter);
      if (!this.hasAttribute("hide-explanation")) section.append(h("p", { class: "explain", part: "explanation" }, l.profileExplain));

      if (p.recent && !this.hasAttribute("hide-recent")) {
        section.append(h("h4", { class: "recent-title", part: "recent-title" }, l.recentTitle));
        if (p.recent.length === 0) section.append(h("p", { class: "status", part: "status" }, l.recentEmpty));
        else {
          const ul = h("ul", { class: "recent", part: "recent" });
          for (const a of p.recent) ul.append(this.item(a, l, lang));
          section.append(ul);
        }
      }
    }

    if (this.error) {
      const retry = h("button", { type: "button", part: "button" }, l.retry);
      retry.addEventListener("click", () => void this.refresh());
      section.append(h("p", { class: "error", part: "error", role: "alert" }, this.error), retry);
    }
    root.replaceChildren(this.sheet, section);
  }
}
