import test from "node:test";
import assert from "node:assert/strict";

import {
    dailyScheduleKeyboardLabel,
    DEFAULT_DAILY_SETTINGS,
    parseVocabularyInput,
} from "./helpers.js";

test("schedule menu label shows the current time and level", () => {
    assert.equal(
        dailyScheduleKeyboardLabel({ daily_time: "10:00", daily_enabled: 1, daily_level: "A0" }),
        "⏰ Розклад (10:00 - A0)"
    );
    assert.equal(dailyScheduleKeyboardLabel(DEFAULT_DAILY_SETTINGS), "⏰ Розклад (10:00 - A0)");
    assert.equal(
        dailyScheduleKeyboardLabel({ daily_time: "10:00", daily_enabled: 0, daily_level: "B2" }),
        "⏰ Розклад (вимкнено - B2)"
    );
});

test("vocabulary input accepts a plain word without context", () => {
    assert.deepEqual(parseVocabularyInput(" resilient "), {
        word: "resilient",
        explicitContext: "",
    });
});

test("vocabulary input uses slash as the default context separator", () => {
    assert.deepEqual(parseVocabularyInput("charge / payment for a service"), {
        word: "charge",
        explicitContext: "payment for a service",
    });
});

test("vocabulary input keeps pipe and backslash context separators", () => {
    assert.deepEqual(parseVocabularyInput("charge | payment"), {
        word: "charge",
        explicitContext: "payment",
    });
    assert.deepEqual(parseVocabularyInput("charge \\ payment"), {
        word: "charge",
        explicitContext: "payment",
    });
});
