import test from "node:test";
import assert from "node:assert/strict";

import { senseKeyboard, senseText } from "../vocabulary-cards.js";

const senses = [
    { label_uk: "значення 1", context_en: "meaning one" },
    { label_uk: "значення 2", context_en: "meaning two" },
    { label_uk: "значення 3", context_en: "meaning three" },
    { label_uk: "значення 4", context_en: "meaning four" },
];

test("sense keyboard keeps three choices per page and stable callback formats", () => {
    assert.deepEqual(senseKeyboard(senses, 0), {
        inline_keyboard: [
            [{ text: "значення 1", callback_data: "sense:0" }],
            [{ text: "значення 2", callback_data: "sense:1" }],
            [{ text: "значення 3", callback_data: "sense:2" }],
            [{ text: "Ще значення →", callback_data: "page:1" }],
        ],
    });
    assert.deepEqual(senseKeyboard(senses, 1), {
        inline_keyboard: [
            [{ text: "значення 4", callback_data: "sense:3" }],
            [{ text: "← Назад", callback_data: "page:0" }],
        ],
    });
});

test("sense prompt adds a page indicator only when there are multiple pages", () => {
    assert.equal(senseText("charge", senses, 1), "charge має кілька значень. Обери потрібне:\nСторінка 2 з 2");
    assert.equal(senseText("book", senses.slice(0, 1), 0), "book має кілька значень. Обери потрібне:");
});
