# ADR 0009: Bounded first-touch acquisition attribution

## Status

Accepted.

## Context

The bot needs to compare a small number of owned promotion links, such as an
Instagram bio, a Telegram post, and Telegram Ads. Telegram deep links deliver
their payload in the `/start` command, but the prior router recognized only
the exact `/start` command and stored no acquisition data.

## Decision

Store one nullable `users.acquisition_source` value only when a user is first
inserted. Accept only this allowlist from a valid Telegram start command:
`ig_bio`, `ig_story`, `tg_ads`, `tg_post`, and `website`. Unknown payloads
still receive the normal welcome but are not stored. Existing users and later
links never overwrite the first-touch value.

The admin-only `📈 Джерела стартів` action and `/sources` show grouped totals
without user identifiers. The privacy policy discloses this limited purpose.

## Alternatives considered

- Store every payload and every click: rejected because it would be easier to
  pollute, create unnecessary behavioral history, and provide no immediate
  product value.
- Use arbitrary campaign labels: rejected because unbounded public input would
  make reports unreliable and persist needless data.
- Rely only on web analytics: rejected because direct Telegram links bypass the
  public website and cannot identify a bot start.

## Consequences

Attribution is intentionally simple and does not represent a complete marketing
analytics system. New source labels require a reviewed code release and a
migration constraint update. The column is additive; rollback only requires
deploying the prior Worker, while the unused nullable data remains harmless.
