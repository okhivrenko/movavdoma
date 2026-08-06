# ADR 0008: Durable per-user word history

## Context

Learned vocabulary is removed after 30 days together with examples and review
history. That cleanup previously removed the only evidence that a learner had
seen a word, allowing the daily-word flow to present it again as new.

## Decision

Store one durable `user_seen_words` row for each normalized English word shown
to a user, whether through a daily card or a manually added vocabulary card.
The record contains only ownership, normalized word, and timestamps; it holds
no translations, examples, or provider payloads. Daily generation excludes the
word for that user regardless of catalog cleanup.

The key is `user_id + normalized_word`, not a meaning-specific key. Daily cards
are a source of new vocabulary; another meaning of the same spelling belongs in
a future explicit deepening or review flow rather than a disguised new card.

## Consequences

The user never receives the same English word as a new daily card again.
The table grows linearly with vocabulary exposure but remains compact and is
removed alongside a user's data if a future full account-deletion flow is added.
