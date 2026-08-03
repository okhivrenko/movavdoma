import test from "node:test";
import assert from "node:assert/strict";

import {
    CURRENT_VOCABULARY_DIRECTION,
    LANGUAGE,
    LANGUAGE_LABEL_UK,
    PLANNED_TRANSLATION_DIRECTIONS,
    isPlannedTranslationDirection,
    isSupportedLanguage,
} from "./languages.js";

test("language catalog preserves the current card direction and planned Ukrainian translations", () => {
    assert.deepEqual(CURRENT_VOCABULARY_DIRECTION, { source: "en", target: "uk" });
    assert.deepEqual(PLANNED_TRANSLATION_DIRECTIONS.map((direction) => direction.target), ["en", "es", "pl", "de"]);
    assert.equal(isSupportedLanguage(LANGUAGE.GERMAN), true);
    assert.equal(LANGUAGE_LABEL_UK[LANGUAGE.POLISH], "Польська");
    assert.equal(isPlannedTranslationDirection({ source: "uk", target: "de" }), true);
    assert.equal(isPlannedTranslationDirection({ source: "en", target: "uk" }), false);
});
