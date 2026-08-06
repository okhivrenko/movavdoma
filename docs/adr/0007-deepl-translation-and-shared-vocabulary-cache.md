# ADR 0007: DeepL translations and shared vocabulary cache

## Context

Users reported incorrect English ↔ Ukrainian translations. The former design
asked one low-cost OpenAI model to choose senses, translate, and create example
sentences for every user independently. That coupled semantic generation with
translation quality and repeatedly paid for identical results.

## Decision

Use DeepL for all English ↔ Ukrainian translations: the text-translation menu,
vocabulary-word translation, daily-word cards, and the Ukrainian translations of English
examples. Send the selected English word sense as DeepL context and request
`prefer_quality_optimized`.

Use OpenAI only for semantic tasks DeepL does not provide: choosing English
senses and generating English examples. The word-generation default moves from
`gpt-5.4-nano` to `gpt-5.4-mini` with low reasoning. The model is overridable
through `OPENAI_WORD_MODEL` so it can be evaluated without a code change.

Persist provider-neutral shared results in D1:

- `shared_word_senses`: normalized English word → sense choices;
- `shared_vocabulary_cards`: normalized English word + chosen meaning → DeepL
  translation and exactly two examples.

Per-user `words` and `examples` remain the source of each learner's private
catalog. Shared tables contain no Telegram IDs; explicit context provided by a
user is never placed in the shared card cache.

## Consequences

Later users receive the same cached card for the same word and meaning, which
reduces latency and provider cost. Daily-card ownership, delivery date, and
learning status remain in per-user `daily_word_cards`; only reusable content is
shared. A cache miss needs one OpenAI call plus one batched DeepL call. Cached output reflects the quality at creation time; a
future explicit cache-version or moderation workflow is needed to regenerate
an incorrect shared card deliberately.
