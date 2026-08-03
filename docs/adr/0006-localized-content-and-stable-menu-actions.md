# ADR 0006: Localized content and stable menu actions

## Status

Accepted.

## Decision

Keep the current Ukrainian interface, but move new localizable content into
`src/content/uk/`. Resolve content through the dependency-free
`src/content/index.js` catalog, with `uk` as the current default locale.

Reply-keyboard labels are presentation, not internal routing identifiers.
`src/features/navigation/navigation.js` maps received legacy Ukrainian labels
to stable `MENU_ACTION` values before a future locale is introduced.

Do not add an i18n package or persist a user locale yet. Enabling an English UI
requires a separate user-preference migration, an `en` catalog matching the
same content shape, a locale selection UI, and a compatibility period for
existing Ukrainian keyboards.
