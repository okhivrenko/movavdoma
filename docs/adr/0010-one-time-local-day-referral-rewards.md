# ADR 0010: One-time local-day referral rewards

## Status

Accepted.

## Context

When a user has reached the 10-word learning-list limit, the bot should offer
a personal invite link. Telegram does not notify the bot when a link is merely
opened; the actionable event is a `/start` command with the deep-link payload.
The reward must not allow self-referrals, repeated starts, or a lower access
level than a user already has.

## Decision

The bot generates `?start=ref_<telegram-user-id>` only for an existing user
when their learning-list quota is exhausted. It accepts only the bounded
numeric payload on a valid `/start` command. A reward is considered only when
the receiving Telegram account did not exist before that start; existing users,
invalid referrers, and self-referrals receive the ordinary welcome without a
reward.

`referral_rewards` stores the referrer, one globally unique referred account,
and the referrer's local calendar date. The effective access-level read treats
a row for today's local date as level 1. It is therefore automatically gone on
the next local day, while permanent and other temporary levels still win when
higher. The unique referred account prevents retries and duplicate updates from
creating more than one reward.

## Alternatives considered

- Reward on a link click: rejected because Telegram sends no webhook for the
  click and it would be unauditable.
- Store an arbitrary referral payload or a mutable counter: rejected because a
  bounded user-ID payload and a unique referred-account constraint directly
  enforce the one-reward rule.
- Reuse donation grants: rejected because those are monthly, include donation
  lifecycle fields, and would blur two distinct access sources.

## Consequences

The invitation is only shown at the point of quota exhaustion. It grants level
1 (up to 10 new daily cards), not extra learning-list additions; that keeps the
existing independent quota invariant intact. The data is retained as a compact
anti-duplication record. A rollback to an older Worker leaves the additive
table unused and does not alter existing access levels.
