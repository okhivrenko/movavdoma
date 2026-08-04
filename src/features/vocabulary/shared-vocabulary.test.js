import test from "node:test";
import assert from "node:assert/strict";

import { getOrCreateSharedCard, getOrCreateSharedSenses, sharedVocabularyKey } from "./shared-vocabulary.js";

function cacheDb({ senses, card } = {}) {
    const calls = [];
    return {
        calls,
        prepare(query) {
            return { bind: (...parameters) => ({
                first: async () => {
                    calls.push({ method: "first", query, parameters });
                    if (query.includes("shared_word_senses")) return senses ? { senses_json: JSON.stringify(senses) } : null;
                    return card ? { translation_uk: card.translation_uk, examples_json: JSON.stringify(card.examples) } : null;
                },
                run: async () => {
                    calls.push({ method: "run", query, parameters });
                    return { meta: { changes: 1 } };
                },
            }) };
        },
    };
}

test("shared vocabulary keys are case- and whitespace-insensitive", () => {
    assert.deepEqual(sharedVocabularyKey("  Charge ", " payment   for a service "), {
        word: "charge", context: "payment for a service",
    });
});

test("shared word senses return a prior result without generating again", async () => {
    const senses = [{ label_uk: "заряд", context_en: "an amount of electricity" }];
    const db = cacheDb({ senses });
    const actual = await getOrCreateSharedSenses({ DB: db }, "CHARGE", async () => assert.fail("must use cache"));
    assert.deepEqual(actual, senses);
    assert.equal(db.calls.filter((call) => call.method === "run").length, 0);
});

test("shared vocabulary cards persist exactly two generated examples", async () => {
    const db = cacheDb();
    const card = {
        translation_uk: "стійкий",
        examples: [{ source: "The team stayed resilient during the crisis.", uk: "Команда залишалася стійкою під час кризи." }, { source: "She is resilient after difficult setbacks.", uk: "Вона стійка після складних невдач." }],
    };
    assert.deepEqual(await getOrCreateSharedCard({ DB: db }, "resilient", "able to recover", async () => card), card);
    const write = db.calls.find((call) => call.method === "run");
    assert.match(write.query, /INSERT INTO shared_vocabulary_cards/);
    assert.deepEqual(write.parameters.slice(0, 2), ["resilient", "able to recover"]);
});
