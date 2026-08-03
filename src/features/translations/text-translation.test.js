import test from "node:test";
import assert from "node:assert/strict";

import {
    DAILY_TEXT_TRANSLATION_LIMIT,
    MAX_TRANSLATION_TEXT_LENGTH,
    claimDailyTextTranslation,
    textTranslationKeyboard,
    translationCharacterCount,
} from "./text-translation.js";

test("translation keyboard exposes only Ukrainian-English directions", () => {
    const rows = textTranslationKeyboard().inline_keyboard;
    assert.deepEqual(rows.map(([button]) => button.callback_data), ["translate:uk:en", "translate:en:uk"]);
});

test("translation length limit counts Unicode characters rather than UTF-16 code units", () => {
    assert.equal(translationCharacterCount("😀".repeat(MAX_TRANSLATION_TEXT_LENGTH)), MAX_TRANSLATION_TEXT_LENGTH);
    assert.equal(translationCharacterCount("😀".repeat(MAX_TRANSLATION_TEXT_LENGTH + 1)), MAX_TRANSLATION_TEXT_LENGTH + 1);
    assert.equal(DAILY_TEXT_TRANSLATION_LIMIT, 10);
});

test("translation quota is atomically claimed in the user's local day", async () => {
    const calls = [];
    const env = { DB: { prepare(query) {
        return { bind: (...parameters) => ({
            first: async () => ({ timezone: "Europe/Warsaw" }),
            run: async () => {
                calls.push({ query, parameters });
                return { meta: { changes: 1 } };
            },
        }) };
    } } };

    assert.equal(await claimDailyTextTranslation(env, 123), true);
    assert.equal(calls.at(-1).parameters[0], 123);
    assert.equal(calls.at(-1).parameters.at(-1), DAILY_TEXT_TRANSLATION_LIMIT);
    assert.match(calls.at(-1).query, /WHERE requests < \?/);
});
