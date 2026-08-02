# ADR 0003: Feedback flow and expiring-grant notices

## Decision

Use an explicit reply-keyboard feedback action and one pending flag per user.
The next plain-text message is forwarded to the admin, then the flag is cleared.
Store a notification timestamp on temporary donation grants and send the expiry
message once from the scheduled Worker. Admin level tests use the same grant
model with source `admin_test` and a one-day expiry.

## Consequences

Feedback is opt-in and cannot be mistaken for a word unless the user explicitly
starts the flow. Test grants exercise the real effective-level logic but never
trigger donor-expiry messages.
