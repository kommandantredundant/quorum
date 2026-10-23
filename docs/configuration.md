# Configuration

All parameters have defaults. Pass only what you want to change, as a partial object:

```js
const config = { voting: { minVoters: 4 }, weight: { cap: 30 } };

const mod = createModeration({ storage, hooks, config, mod: { conflicts: { excludeAuthoredFrom: 5 } } });
const quorum = createQuorum({ storage, hooks, config, reviewHandler: mod.reviewHandler, … });
```

Pass the **same** `config` to `createQuorum` and `createModeration`. Invalid values throw a `ConfigError`
when the module is created. The defaults are starting points, tuned with the simulation in
`packages/sim` (`npm run sim`, `npm run sweep`); they are not universal truths.

## Core (`config`)

| Parameter | Default | Meaning |
| --- | --- | --- |
| `voting.windowHours` | 72 | Length of the first voting window. |
| `voting.minVoters` | 3 | Minimum number of distinct voters for a result. Most items get 2 to 5 voters, so raising it sends many items to review. |
| `voting.maxExtensions` | 3 | How often the window is extended when too few people voted. After that: review. |
| `voting.extensionHours` | 24 | Length of each extension. |
| `bands.greyZone` | `[0.45, 0.55]` | Weighted approval ratio that is too close to call: review. |
| `bands.sampleHigh` | `[0.55, 0.65]` | Approved, but a candidate for a spot check. Must start where the grey zone ends. |
| `bands.sampleLow` | `[0.35, 0.45]` | Rejected, but a candidate for a spot check. Must end where the grey zone starts. |
| `bands.sampleRate` | 0.2 | Share of narrow results that is actually checked. |
| `weightConflict.maxDecisiveVoters` | 2 | The side that wins by weight has at most this many voters ... |
| `weightConflict.minOpposingVoters` | 5 | ... while the other side has at least this many: review. |
| `reputation.reward` | 1 | For voting with the result, and for an approved submission (author). |
| `reputation.penalty` | −1.5 | For voting against the result, and for a rejected submission (author). |
| `reputation.startValue` | 0 | Reputation of a new member. |
| `reputation.overridePenaltyFactor` | 2 | Multiplier on the penalty for voters whose community verdict a moderator overturned. Never applies to authors. |
| `weight.base` | 1 | Weight at reputation 0. |
| `weight.growth` | 1.1 | Weight growth per reputation point. |
| `weight.cap` | 20 | Upper limit for one voter's weight. `Infinity` switches it off. |
| `weight.authorCap` | `Infinity` | Upper limit for the start weight an author brings into their own submission, for example `1` to count an author at most like one new voter. |

Notes:

- **Scale.** Only ratios between weights matter for decisions, so `base` mostly changes the scale of
  `cap` and `authorCap`.
- **The cap.** Without it, weight grows exponentially and a few long-standing members end up
  deciding everything once a community is old. In the simulation, accuracy dropped by about
  6 percentage points after roughly a thousand items without a cap. Cap 20 means a top voter can
  still only be overruled by 20 new voters.
- **`authorCap`.** Leave it unlimited if you want trusted authors to get a head start. Limit it if
  you have few moderators or a reason for members to cheat: an author with high reputation can
  otherwise approve their own bad submissions against the two to five people who typically vote.
- **JSON.** JSON cannot hold `Infinity`. If you load the configuration from a file, leave the field
  out instead of writing it.

## Moderation (`mod`)

| Parameter | Default | Meaning |
| --- | --- | --- |
| `conflicts.excludeAuthoredFrom` | 3 | From this many moderators on, nobody gets their own submissions. |
| `conflicts.excludeVotedFrom` | 10 | From this many moderators on, nobody gets submissions they voted on either. |
| `sampling.seed` | `""` | Mixed into spot-check selection. **Set a private value per site**, otherwise it is predictable which submissions get checked. |
| `sampling.divergenceThreshold` | 0.4 | Weight ratio and head ratio differ by at least this much (or point to opposite sides): "divergence". |
| `sampling.divergenceRate` | 0.5 | Share of divergent results that is checked. |
| `sampling.dominantShare` | 0.6 | One voter holds at least this share of the weight, or exactly `minVoters` took part: "edge case". |
| `sampling.edgeRate` | 0.1 | Share of edge cases that is checked. |

If several rules apply to a result, the highest rate wins.

## Reading the simulation

`npm run sim` runs honest communities and several attacks (collusion ring, fake accounts with and
without reputation farming, a long-standing member who turns bad, followers who copy the leader).
`npm run sweep` compares variants of the open design decisions. Both use fixed random seeds, so
results are reproducible. The numbers come from a model with stated assumptions: trust the
direction more than the exact percentages.
