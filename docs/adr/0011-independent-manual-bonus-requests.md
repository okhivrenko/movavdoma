# ADR 0011: Independent manual bonus requests

## Status

Accepted.

## Context

The original bonus flow required a Monobank support request and its unique
payment-comment code. Product needs a second, independent path: a user can ask
an administrator for a bonus without making a donation. These requests must not
be described as missing payments or accidentally matched to a bank transaction.

## Decision

`donation_requests` gains `request_source`, constrained to `support` or
`manual_bonus`. Existing rows default to `support`.

The support action continues to create a `support` request and show a Monobank
link, code, and its own payment-linked bonus button. The separate bonus action
always creates (or reuses) a `manual_bonus` request directly in
`awaiting_review`. Both request types use the existing admin review card and
temporary-access grant path. Monobank matching considers `support` requests
only.

## Consequences

The administrator can make an explicit access decision for a manual request,
while payment-linked requests retain their amount and suggested level. The
source is visible in the review card and preserves a reliable audit trail.
Rolling back Worker code leaves the additive column unused; no user access is
changed by the migration.
