import { QuorumModerationElement } from "./moderation-element.js";
import { QuorumVoteElement } from "./vote-element.js";
import { QuorumProfileElement } from "./profile-element.js";

export * from "./types.js";
export * from "./client.js";
export * from "./labels.js";
export * from "./view-model.js";
export { configureQuorum } from "./dom.js";
export { QuorumVoteElement, QuorumModerationElement, QuorumProfileElement };

/** Define <quorum-vote>, <quorum-moderation> and <quorum-profile> (safe to call more than once). */
export function register(names: { vote?: string; moderation?: string; profile?: string } = {}): void {
  if (typeof customElements === "undefined") return;
  const vote = names.vote ?? "quorum-vote";
  const moderation = names.moderation ?? "quorum-moderation";
  if (!customElements.get(vote)) customElements.define(vote, QuorumVoteElement);
  if (!customElements.get(moderation)) customElements.define(moderation, QuorumModerationElement);
  const profile = names.profile ?? "quorum-profile";
  if (!customElements.get(profile)) customElements.define(profile, QuorumProfileElement);
}
