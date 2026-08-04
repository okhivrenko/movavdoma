# Multilanguage Guidelines

This document explains the minimal, repeatable steps to add or modify a translation direction (e.g., EN → UK, UK → EN) and the operational / documentation expectations.

1. Create content bundle
   - Add localized UI strings under `src/content/<locale>/` (e.g., `src/content/en/`).
   - Add plural rules if the language requires non-trivial plural forms: `src/content/<locale>/plural-rules.js`.

2. Input parsing
   - Add a direction-specific input parser under `src/features/vocabulary/input-parsers/` exporting a parser with `parseInput(input)` and `contextSeparators`.
   - Register the parser in `src/features/vocabulary/input-parsers/index.js`.

3. OpenAI / DeepL configuration
   - Prefer env overrides for models: use `OPENAI_WORD_MODEL` or `VOCAB_MAX_SENSES` when appropriate.

4. Tests
   - Add unit tests beside the changed module (`*.test.js`) covering parsing, plural rules, and end-to-end flows where possible.

5. Logging
   - Add non-sensitive operational logging for key lifecycle points (parsing inputs, generating cards, external API errors). Use `console.debug` or `console.info` and never include secrets or full API keys.

6. Documentation and ADR
   - Add a short developer-facing doc in `docs/` explaining the change (this file is an example).
   - For any data-contract changes, add an ADR in `docs/adr/` and a forward-only migration in `migrations/`.

7. Implementation status
   - After merge, update `IMPLEMENTATION_STATUS.md` with a one-line summary and verified checks (run `npm run check`).

8. Deployment
   - Run `npm run check` then `npm run deploy`. Ensure migrations are applied before code that depends on them.

