# UI components

Two framework-free web components in `quorum-ui`, no runtime dependencies (about 14 KB minified).
They live in Shadow DOM, follow the page's light or dark mode, and are styled with CSS variables.

![Vote box after voting](screenshots/02-vote-after.png)

## Using them

As a single file (no build step on your side):

```html
<script type="module" src="/quorum-ui.min.js"></script>
```

Build it with `npm run bundle`; it registers both elements on load. As a package:

```js
import { register } from "quorum-ui";
register();                                  // or register({ vote: "my-vote", moderation: "my-mod" })
```

By default the components call the routes of [`quorum-http`](integration.md#routes) at
`/api/quorum` with your session cookie. Change that per element with `api="/other/base"`, or for the
page with `configureQuorum`:

```js
import { configureQuorum, createHttpClient } from "quorum-ui";
configureQuorum({
  client: createHttpClient({ baseUrl: "/api/quorum", headers: () => ({ "x-csrf": token() }) }),
  interim: "after-vote",                     // default interim visibility
  labels: { title: "Is this place correct?" },
});
```

You can also hand any object with `getSubmission`, `vote`, `getQueue`, `decide` to an element as its
`client` property, for example to use your own API.

## `<quorum-vote>`

![Final states and theming](screenshots/03-states-and-theming.png)

| Attribute | Meaning |
| --- | --- |
| `submission-id` | Which submission. Required. |
| `show-interim` | `after-vote` (default), `always` or `after-close`. A display setting only, see [integration.md](integration.md#showing-the-interim-result). |
| `lang` | `de` or anything else for English. Falls back to the nearest `lang` on the page. |
| `api` | Base URL of the routes for this element. |

Shows the weighted result as percentages only, the vote buttons while voting is possible, and the
final state (decided, under review, waiting for the result).

- **Events:** `quorum-loaded` (`detail.view`), `quorum-voted` (`detail.choice`), `quorum-error` (`detail.error`).
- **Methods:** `refresh()` reloads from the server.

## `<quorum-moderation>`

![Moderation queue](screenshots/04-moderation-queue.png)

Attributes `lang` and `api` as above. Lists the cases the current moderator may take, cases that
need a decision first. Set `subjectRenderer` to show what a case is about; the module cannot know,
because your payload is yours:

```js
el.subjectRenderer = (c) => `Submission ${c.id}`;      // plain strings are shown as text
// or return a DOM node for richer content
```

Events: `quorum-loaded` (`detail.cases`), `quorum-decided` (`detail.id`, `detail.verdict`), `quorum-error`.

## Theming

Set variables on the element or any ancestor:

```css
quorum-vote { --quorum-yes: #0b7285; --quorum-no: #c2255c; --quorum-radius: 18px; }
```

| Variable | Default | For |
| --- | --- | --- |
| `--quorum-yes`, `--quorum-no` | green, red (lighter in dark mode) | Bar, percentages, button outlines |
| `--quorum-fg`, `--quorum-bg` | page text colour, transparent | Text and box background |
| `--quorum-border`, `--quorum-track` | a faint mix of the text colour | Box border, empty bar |
| `--quorum-radius`, `--quorum-button-radius`, `--quorum-padding` | 10px, 8px, 14px | Shapes and spacing |
| `--quorum-font`, `--quorum-title-size` | system font, 1rem | Typography |
| `--quorum-bar-height` | 10px | Bar |
| `--quorum-focus` | `Highlight` | Keyboard focus ring |

For deeper changes use `::part(root | title | bar | bar-yes | bar-no | legend | status | button | button-approve | button-reject | error | case)`.

## Texts and languages

German and English are built in. Override single texts with `configureQuorum({ labels })` or the
element's `labels` property. Texts from the server are always shown as text, never as HTML.

## Accessibility

The bar has a text alternative, buttons are at least 44 px high and have a visible focus ring, status
changes are announced politely, and reduced-motion settings are respected.
