# ADR 0005: Feature-first modules and multilingual vocabulary foundation

## Status

Accepted.

## Decision

Organize Worker modules by feature (`features/`), external adapters
(`platform/`), and pure shared rules (`domain/`). Continue to use ESM functions
and explicit dependency objects; do not introduce Express, a generic framework,
or an OOP service hierarchy.

Represent language identifiers with ISO 639-1 codes and define planned
translation directions in pure domain code. Preserve the current English to
Ukrainian behavior and legacy columns (`translation_uk`, `sentence_uk`) until a
separate product slice adds language selection and a forward-only D1 migration.

## Consequences

The next multilingual slice must add neutral target-language storage, backfill
existing Ukrainian values, preserve existing cards, and add user-owned queries
that select the requested translation direction. It may then enable Ukrainian
to English, Spanish, Polish, and German. Additional directions use the same
contract without another architectural rewrite.
