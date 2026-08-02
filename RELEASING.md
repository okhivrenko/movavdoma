# Releases

This project uses semantic versioning and annotated Git tags.

- `vMAJOR.0.0` — breaking changes to the bot's user-facing behavior or data.
- `vMINOR.0` — new user-facing functionality.
- `vPATCH` — fixes and internal changes without new functionality.

## Release checklist

1. Update the `version` in `package.json`.
2. Run `npm run build` and relevant syntax checks.
3. Check the production D1 migration journal:

   ```bash
   npx wrangler d1 migrations list vocab-words-db --remote
   ```

4. Apply pending migrations only through Wrangler:

   ```bash
   npx wrangler d1 migrations apply vocab-words-db --remote
   ```

   Do not run a versioned file from `migrations/` through `d1 execute --file`.
   That bypasses the `d1_migrations` journal and makes later releases unsafe.

5. Repeat the migration-list command. It must report `No migrations to apply`
   before the Worker deploy.
6. Deploy the Worker.
7. Verify the public Worker returns HTTP 200 and the migration journal includes
   the new migration.
8. Commit the release and create an annotated tag, for example:

   ```bash
   git tag -a v1.1.0 -m "v1.1.0"
   git push origin main --follow-tags
   ```

Tags make it possible to find the exact source code for every deployed release
and roll back deliberately if needed.
