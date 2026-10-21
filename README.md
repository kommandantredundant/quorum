# quorum

Embeddable, service-free building block for reputation-weighted community voting
(e.g. rating points of interest). Runs inside the host website's own backend and
database. No central service.

## Packages

| Package | Purpose | Required |
| --- | --- | --- |
| `quorum-core` | Weights, evaluation, reputation updates, lifecycle. Pure logic, no I/O. | yes |
| `quorum-mod` | Moderation queue and decisions. | optional |

Dependency direction: `quorum-mod -> quorum-core`. The core never depends on `mod`,
so the core runs fully without it.

## Is it a good fit for your community?

Short version: it fits **cooperative communities with verifiable content and real accounts**,
and fits badly anonymous, commercially driven or opinion-based ones. This describes the
current default values; they are still being tuned (see `npm run sim`). Simulation figures
come from a model with stated assumptions, so trust the direction more than the exact numbers.

### Good fit

- **Niche and interest communities** with a shared goal, e.g. maps of hiking trails, climbing
  spots, accessibility, bike repair shops or local tips.
- **Content whose truth can be checked:** a place exists or not, a detail is right or wrong.
  Voters are then mostly right, and moderators can settle disputed cases.
- **Accounts that cost something:** verified e-mail, invitation or membership. Without such a
  hurdle, a handful of fake accounts is enough to push almost anything through (in the
  simulation, 10 fresh fake accounts got practically every attacker point approved).
- **Little incentive to cheat:** no money, advertising or rankings at stake.
- **At least 3 moderators**, preferably more. The conflict-of-interest rules only start at 3
  and 10 moderators, and without moderation the simulation approves about 25 % of the bad
  points (about 10 % with moderation).
- **A pace of days:** the voting window is 72 hours plus up to three extensions.
- **Sites with their own backend and database**, so the server-side checks can do their job.

### Poor fit

- **Open platforms with free anonymous sign-up and a business interest**, such as company
  listings or bought reviews. This is exactly where fake accounts and reputation farming work.
- **Matters of taste and opinion** ("best restaurant"). Reputation here comes from agreeing
  with the majority, not from being right. That rewards conformity and punishes minority views.
- **Politically or ideologically split communities.** The larger side would keep confirming
  itself.
- **Safety-critical content** such as hazards, medical or legal information. These need a
  verified source, not a herd decision with spot checks.
- **Content where a wrong approval does real harm**, e.g. statements about people. Those need
  review before publication.
- **Instant publication:** a submission is only decided once its window has ended.
- **Very small groups under roughly 10 to 15 active users.** Many submissions never reach the
  minimum number of voters and end up in moderation, and two people decide almost everything.

### Two caveats

- Large communities are no technical problem, since no parameter depends on the number of
  users. But the larger and more anonymous a community, the more profitable reputation farming
  becomes. Then the host needs strong account checks, which are not part of this module.
- Moderation is meant as occasional oversight. With heavy traffic the number of cases grows
  and the sampling rates need to be adjusted.

### Rule of thumb

It fits if all five hold: accounts cost something, answers are verifiable, there is little
incentive to cheat, at least 3 moderators are available, and days instead of seconds are fine.

## Development

```sh
npm install
npm run build   # tsc -b across all packages
npm test        # vitest, resolves workspace packages from source
```

All tunable parameters live in `packages/core/src/config.ts`. Defaults are
provisional and meant to be tuned via simulation.
