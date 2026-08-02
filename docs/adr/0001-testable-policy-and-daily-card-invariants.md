# ADR 0001: Testable policy and one pending daily card

## Context

The Worker has two independent quotas: saving words and generating daily
cards. Donation thresholds and access levels determine the latter. These rules
were embedded in the webhook entry point, so their boundaries were difficult to
verify without emulating Telegram and D1. The original daily-card schema also
allowed multiple pending cards for the same user and local day.

## Decision

- Keep the current single Cloudflare Worker plus D1 design. It is the simplest
  operational model for the bot's current scale.
- Put pure access-level and donation rules in `policies.js` and test them with
  Node's built-in test runner. This adds no dependency or production runtime.
- Enforce one pending daily card per user and local date with a D1 unique index.
  The scheduler skips a user who still has a pending card for that date.

## Consequences

`npm run check` now includes unit tests. Migration `0010` must be applied to
production D1 before deploying code that relies on the index. The migration
keeps the newest pending card when cleaning up a historic duplicate.

## Deferred work

The webhook router remains in `worker.js`. Split it into domain modules only
when another substantial feature is added; doing so now would increase change
risk without changing behavior.
