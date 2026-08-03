# ADR 0004: Incrementally decompose the Worker by responsibility

## Status

Accepted.

## Context

`worker.js` is the runtime entry point and now contains webhook routing,
callbacks, scheduled work, D1 queries, donation processing, daily-card flows,
and presentation helpers. A one-shot rewrite would risk regressions in Telegram
callbacks and production data flows.

## Decision

Decompose only along tested, stable responsibility boundaries during feature
work. Keep `worker.js` as the thin Worker entry point and router. Extract in
this order:

1. message templates and presentation helpers;
2. daily-word settings and delivery service;
3. donation and Monobank service;
4. callback routing by feature; and
5. database repositories only where repeated queries become a maintenance
   burden.

Each extraction must preserve callback formats, parameterized D1 access,
private-chat enforcement, and focused tests. No generic repository, class
hierarchy, or framework layer is introduced without a concrete duplicated
responsibility.

## Consequences

The codebase becomes easier to review and test incrementally while production
behaviour remains stable. Temporary duplication is preferable to an unsafe
large-scale rewrite, but must be removed in the same feature that introduces a
new module boundary.
