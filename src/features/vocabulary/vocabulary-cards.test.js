import test from "node:test";
import assert from "node:assert/strict";

import { persistWordCard, senseKeyboard, senseText } from "./vocabulary-cards.js";

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

test("word cards and both examples are written as one D1 batch", async () => {
    const statements = [];
    const env = { DB: {
        prepare: (query) => ({ bind: (...parameters) => ({ query, parameters }) }),
        batch: async (batch) => {
            statements.push(...batch);
            return [{ meta: { last_row_id: 17 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }];
        },
    } };
    const id = await persistWordCard(env, 7, "resilient", "able to recover", {
        translation_uk: "стійкий",
        examples: [
            { source: "The team stayed resilient during the crisis.", uk: "Команда залишалася стійкою під час кризи." },
            { source: "She remained resilient after several setbacks.", uk: "Вона залишалася стійкою після кількох невдач." },
        ],
    });
    assert.equal(id, 17);
    assert.equal(statements.length, 3);
    assert.match(statements[0].query, /INSERT INTO words/);
    assert.match(statements[1].query, /last_insert_rowid\(\)/);
    assert.match(statements[2].query, /last_insert_rowid\(\)/);
});
