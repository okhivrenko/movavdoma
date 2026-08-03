# MovaYakVDoma

[Privacy Policy](./PRIVACY_POLICY.md)

Cloudflare Worker bot for learning English vocabulary in Ukrainian.

## Common commands

```bash
npm run check              # syntax, migrations, and Wrangler bundle
npm run build              # bundle locally into dist/ without deploying
npm run check:migrations   # validate every SQL migration on fresh SQLite
npm run deploy             # production deploy (only when intended)
```

Read `AGENTS.md` before changing code, `PROJECT_CONTEXT.md` for product
behavior, and `RELEASING.md` before a production release.

For the module map and multilingual boundary, read
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md). To transfer the agent setup
to a new Telegram bot, use [`docs/AGENT_HANDOFF.md`](./docs/AGENT_HANDOFF.md)
and [`workflows/cloudflare-telegram-feature.md`](./workflows/cloudflare-telegram-feature.md).

For day-to-day manual development and safe scaling, start with
[`docs/DEVELOPER_GUIDE_UA.md`](./docs/DEVELOPER_GUIDE_UA.md).
