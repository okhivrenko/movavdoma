# ADR 0002: Temporary donation access grants

## Context

Donation review cards let an admin choose access level 1, 2, or 3. The level
must last one month, while manually granted and legacy levels remain permanent.

## Decision

Keep permanent levels in `user_access_levels`. Store each donation's one-month
level in `user_temporary_access_grants`. The effective level is the maximum of
the permanent level and unexpired temporary grants.

## Consequences

An expiring donation grant automatically falls back to the user's permanent
level. A later donation cannot accidentally reduce an existing higher level.
Migration `0011` is required before deploying code that reads temporary grants.
