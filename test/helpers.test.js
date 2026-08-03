import test from "node:test";
import assert from "node:assert/strict";

import { parseVocabularyInput } from "../helpers.js";

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
