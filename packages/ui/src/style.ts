/**
 * Styles inside the shadow DOM. Everything a site would want to change is a CSS variable,
 * set on the element or any ancestor, e.g.  quorum-vote { --quorum-yes: teal; --quorum-radius: 0; }
 * Deeper changes are possible through ::part(root|title|bar|bar-yes|bar-no|legend|status|button|button-approve|button-reject|error|case).
 */
export const css = `
:host {
  display: block;
  color-scheme: light dark;
  font-family: var(--quorum-font, system-ui, -apple-system, "Segoe UI", sans-serif);
  color: var(--quorum-fg, CanvasText);
  --_yes: var(--quorum-yes, #1a7f4b);
  --_no: var(--quorum-no, #b3261e);
}
@media (prefers-color-scheme: dark) {
  :host { --_yes: var(--quorum-yes, #5fd39a); --_no: var(--quorum-no, #ff8a80); }
}
.root {
  box-sizing: border-box;
  background: var(--quorum-bg, transparent);
  border: 1px solid var(--quorum-border, color-mix(in srgb, currentColor 22%, transparent));
  border-radius: var(--quorum-radius, 10px);
  padding: var(--quorum-padding, 14px);
}
.title { margin: 0 0 10px; font-size: var(--quorum-title-size, 1rem); font-weight: 600; }
.bar {
  display: flex; overflow: hidden; margin: 6px 0;
  height: var(--quorum-bar-height, 10px);
  border-radius: 999px;
  background: var(--quorum-track, color-mix(in srgb, currentColor 14%, transparent));
}
.bar-yes { background: var(--_yes); }
.bar-no { background: var(--_no); }
.bar-yes, .bar-no { transition: flex-basis .25s ease; }
@media (prefers-reduced-motion: reduce) { .bar-yes, .bar-no { transition: none; } }
.legend { display: flex; justify-content: space-between; gap: 12px; font-size: .875rem; }
.legend .yes { color: var(--_yes); font-weight: 600; }
.legend .no { color: var(--_no); font-weight: 600; }
.status, .hint, .meta { margin: 8px 0 0; font-size: .875rem; opacity: .85; }
.actions { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
button {
  flex: 1 1 8rem; min-height: 44px; padding: 8px 14px; cursor: pointer;
  font: inherit; font-weight: 600; color: inherit; background: transparent;
  border: 2px solid var(--_c, currentColor); border-radius: var(--quorum-button-radius, 8px);
}
button.approve { --_c: var(--_yes); }
button.reject { --_c: var(--_no); }
button:hover:not(:disabled) { background: color-mix(in srgb, var(--_c, currentColor) 14%, transparent); }
button:focus-visible { outline: 3px solid var(--quorum-focus, Highlight); outline-offset: 2px; }
button:disabled { opacity: .5; cursor: not-allowed; }
.error { margin: 10px 0 0; color: var(--_no); font-size: .875rem; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
li.case { border: 1px solid var(--quorum-border, color-mix(in srgb, currentColor 22%, transparent)); border-radius: var(--quorum-radius, 10px); padding: var(--quorum-padding, 14px); }
.case-title { margin: 0; font-weight: 600; }
.subject { margin: 8px 0 0; }
`;
