import type { QuorumClient } from "./types.js";
import { createHttpClient } from "./client.js";
import { parseMode } from "./view-model.js";
import type { InterimMode } from "./types.js";
import type { Labels } from "./labels.js";

/** Tiny DOM helper. Strings become text nodes, never HTML, so data from the server cannot inject markup. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | undefined> = {},
  ...children: (Node | string | null | false | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}

/** Page-wide defaults, so a site configures the components once. */
interface Defaults {
  client?: QuorumClient;
  interim?: InterimMode;
  labels?: Partial<Labels>;
}
let defaults: Defaults = {};

export function configureQuorum(next: Defaults): void {
  defaults = { ...defaults, ...next };
}
export const getDefaults = (): Defaults => defaults;

export function resolveClient(own: QuorumClient | undefined, apiAttr: string | null): QuorumClient {
  return own ?? defaults.client ?? createHttpClient(apiAttr ? { baseUrl: apiAttr } : {});
}

export function resolveMode(attr: string | null): InterimMode {
  return attr !== null ? parseMode(attr) : (defaults.interim ?? parseMode(null));
}

export function formatDate(ms: number, lang: string | null): string {
  try {
    return new Intl.DateTimeFormat(lang || undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
