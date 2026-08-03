/**
 * Stable language codes for vocabulary cards. They are intentionally separate
 * from the current English→Ukrainian storage columns until the multilingual
 * migration introduces target-language-neutral fields.
 */
export const LANGUAGE = Object.freeze({
    UKRAINIAN: "uk",
    ENGLISH: "en",
    SPANISH: "es",
    POLISH: "pl",
    GERMAN: "de",
});

export const LANGUAGE_LABEL_UK = Object.freeze({
    [LANGUAGE.UKRAINIAN]: "Українська",
    [LANGUAGE.ENGLISH]: "Англійська",
    [LANGUAGE.SPANISH]: "Іспанська",
    [LANGUAGE.POLISH]: "Польська",
    [LANGUAGE.GERMAN]: "Німецька",
});

// Phase 1: the requested Ukrainian-source translation choices. The current
// product remains English→Ukrainian until a UI and schema migration is shipped.
export const PLANNED_TRANSLATION_DIRECTIONS = Object.freeze([
    Object.freeze({ source: LANGUAGE.UKRAINIAN, target: LANGUAGE.ENGLISH }),
    Object.freeze({ source: LANGUAGE.UKRAINIAN, target: LANGUAGE.SPANISH }),
    Object.freeze({ source: LANGUAGE.UKRAINIAN, target: LANGUAGE.POLISH }),
    Object.freeze({ source: LANGUAGE.UKRAINIAN, target: LANGUAGE.GERMAN }),
]);

export const CURRENT_VOCABULARY_DIRECTION = Object.freeze({
    source: LANGUAGE.ENGLISH,
    target: LANGUAGE.UKRAINIAN,
});

export function translationDirectionKey({ source, target }) {
    return `${source}:${target}`;
}

export function isSupportedLanguage(language) {
    return Object.hasOwn(LANGUAGE_LABEL_UK, language);
}

export function isPlannedTranslationDirection(direction) {
    const key = translationDirectionKey(direction);
    return PLANNED_TRANSLATION_DIRECTIONS.some((planned) => translationDirectionKey(planned) === key);
}
