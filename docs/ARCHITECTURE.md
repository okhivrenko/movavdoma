# Architecture

## Runtime boundary

Cloudflare Worker entry point: `worker.js`.

It owns only HTTP handling, Telegram webhook authentication, private-chat
validation, idempotent `processed_updates` writes, and composition of feature
dependencies. Keep database ownership checks and callback validation at this
edge or inside the corresponding feature handler.

The Worker has two entry points:

- `fetch(request, env)` — Telegram webhook and public privacy page.
- `scheduled(controller, env)` — webhook repair, daily delivery, cleanup,
  donation expiration notifications, and Monobank synchronization.

## Module map

```text
worker.js                    composition root
src/
  domain/                    pure rules and stable shared vocabulary
    helpers.js               parsing, formatting, local date, admin predicate
    messages.js              user-facing message templates
    policies.js              quota and access-level policy
    languages.js             language codes and translation direction catalog
  platform/                  external-service adapters
    telegram.js              Telegram HTTP API
    openai.js                OpenAI structured JSON API
    monobank-donations.js    Monobank statement synchronization
    worker-support.js        webhook repair and generic Worker support
  features/
    admin/                   access grants, panel, callbacks, commands
    daily-words/             settings, quota, card generation, delivery
    donations/               requests, grants, notifications, callbacks
    feedback/                one-message feedback flow
    vocabulary/              cards, lists, callbacks, learned-word cleanup
test/                        Node tests mirroring production module ownership
migrations/                  forward-only D1 schema changes
docs/adr/                    durable architecture decisions
workflows/                   repeatable agent delivery workflows
```

## Dependency direction

`worker.js → features → domain/platform`.

Features may call `platform` adapters and use `domain` rules. `domain` must
remain dependency-free: no D1, Telegram, OpenAI, `env`, network access, or
mutable global application state. Do not import `worker.js` from a module.

Prefer exported functions and explicit dependency objects over classes. Cloudflare
isolates are not durable process instances, so state belongs in D1/KV/Durable
Objects, never in singleton classes.

## Multilingual boundary

Current cards are English → Ukrainian and use legacy columns
`translation_uk` and `sentence_uk`. `src/domain/languages.js` declares the
next directions: Ukrainian → English, Spanish, Polish, and German.

Before enabling any new direction, one complete feature slice must:

1. add a new forward-only D1 migration with neutral source/target language and
   translation fields;
2. backfill legacy Ukrainian rows without changing their meaning;
3. add an owned user preference for translation direction;
4. validate the chosen direction in every callback and D1 query;
5. make OpenAI prompts and card rendering direction-aware;
6. add tests for legacy cards and each enabled direction.

Never reuse `translation_uk` or `sentence_uk` for another language.

## Framework decision

Do not add Express. This is a Cloudflare Worker, not a persistent Node HTTP
server. Use native `fetch`/`Response` plus ES modules. Consider Hono only if a
real public HTTP API grows to several independently versioned routes with
shared middleware; it is not needed for the Telegram webhook today.
