# How it works

Community members submit things (for example a place on a map). Other members vote on them, and
votes count by reputation. A moderator is optional and only steps in for unclear cases.

## Life of a submission

1. **Submitted.** The author's start weight (their own vote weight, optionally limited by
   `weight.authorCap`) counts as approving weight from the start. It is not a head: it cannot satisfy
   the minimum number of voters.
2. **Voting window** (default 72 hours). Every member except the author votes at most once, and
   votes cannot be changed. The voting window always runs to its end, even for popular submissions.
3. **Window ends.** If fewer than `minVoters` (default 3) people voted, the window is extended by
   24 hours, up to 3 times. After the last extension the submission goes to review.
4. **Evaluation** by weighted approval ratio (approving weight / total weight):

| Ratio | Result |
| --- | --- |
| below 35 % | rejected |
| 35 % to below 45 % | rejected, may be picked for a spot check |
| 45 % to 55 % (grey zone) | review |
| above 55 % up to 65 % | approved, may be picked for a spot check |
| above 65 % | approved |

   On top of that, a **weight conflict** goes to review: one or two heavy votes win against five or
   more light ones (`weightConflict`), even when the ratio looks clear.
5. **Reputation is booked** (see below), and the submission is closed.

Without moderation, review cases are decided by weight at the end of the window (an exact tie, or a
case nobody voted on, is rejected).

## Weight and reputation

- Vote weight is `min(cap, base × growth^reputation)`. Defaults: base 1, growth 1.1, cap 20.
  Negative reputation counts like 0, so nobody weighs less than a new member.
- The weight is fixed when the vote is cast, so later reputation changes cannot move an open vote.
- Voting with the final result gives +1, voting against it −1.5. The author gets +1 for an approved
  and −1.5 for a rejected submission.
- Reputation is kept per site. Nothing depends on how long an account exists or how often it is used.

## Moderation (optional package)

- **Queue.** Cases that need a decision come before spot checks, the oldest first.
- **Decision.** A moderator approves or rejects. If the community had already decided and the
  moderator flips it, wrong voters lose twice the normal penalty (the author does not). Reverting
  such an override later ends exactly where a confirmed community verdict would have.
- **Spot checks.** Some already decided submissions are picked for a second look. Three kinds of
  cases are worth it, each with its own rate: narrow results (the sample bands above), a strong
  mismatch between weight and head count, and edge cases such as one voter carrying most of the weight.
  Selection is deterministic (a hash of a site-specific seed and the submission ID), so every
  server reaches the same answer.
- **Conflicts of interest.** With at least 3 moderators nobody receives their own submissions; with
  at least 10, nobody receives submissions they voted on either. Below that, everyone can take
  every case, so a small team is never blocked.
- **Later intervention and history.** A decided case can be revised. Every decision stays in the
  case, so "who decided what and when" is always answerable.

## What this is not

It does not prevent fake accounts: a handful of fresh accounts can outvote the two to five people
that typically rate an item. Account creation needs a hurdle on your side, see
[integration.md](integration.md#protecting-against-abuse). Which communities it suits is described
in the [README](../README.md#is-it-a-good-fit-for-your-community).
