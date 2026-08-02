# Releases

This project uses semantic versioning and annotated Git tags.

- `vMAJOR.0.0` — breaking changes to the bot's user-facing behavior or data.
- `vMINOR.0` — new user-facing functionality.
- `vPATCH` — fixes and internal changes without new functionality.

## Release checklist

1. Update the `version` in `package.json`.
2. Run `npm run build` and relevant syntax checks.
3. Apply any pending D1 migrations to production.
4. Deploy the Worker.
5. Commit the release and create an annotated tag, for example:

   ```bash
   git tag -a v1.1.0 -m "v1.1.0"
   git push origin main --follow-tags
   ```

Tags make it possible to find the exact source code for every deployed release
and roll back deliberately if needed.
