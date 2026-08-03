import test from "node:test";
import assert from "node:assert/strict";

import {
    dailyCardFromPending,
    dailyWordKeyboard,
    dailyWordText,
    getPendingDailyWord,
    savePendingDailyWordToLearning,
} from "../daily-words.js";

const card = {
    word: "reliable",
    translation_uk: "надійний",
    context_en: "able to be trusted",
    examples: [
        { source: "The reliable bus arrived exactly on time.", uk: "Надійний автобус прибув точно вчасно." },
        { source: "She is reliable when the team needs help.", uk: "На неї можна покластися, коли команді потрібна допомога." },
    ],
};

test("daily-card presentation preserves both user actions and exactly two examples", () => {
    assert.deepEqual(dailyWordKeyboard(42), {
        inline_keyboard: [[
            { text: "✅ Знаю", callback_data: "daily:know:42" },
            { text: "📖 Вчити", callback_data: "daily:learn:42" },
        ]],
    });

    const text = dailyWordText(card, "B1");
    assert.match(text, /^📚 Нове слово · B1/);
    assert.match(text, /1\. The reliable bus arrived exactly on time\./);
    assert.match(text, /2\. She is reliable when the team needs help\./);
});

test("corrupt or incomplete pending daily cards cannot be shown", () => {
    const pending = {
        id: 42,
        source_text: card.word,
        translation_uk: card.translation_uk,
        context_note: card.context_en,
        examples_json: JSON.stringify(card.examples),
    };
    assert.equal(dailyCardFromPending(pending).id, 42);
    assert.equal(dailyCardFromPending({ ...pending, examples_json: "not json" }), null);
    assert.equal(dailyCardFromPending({ ...pending, examples_json: JSON.stringify([card.examples[0]]) }), null);
});

function pendingDailyWordDb(pending) {
    const calls = [];
    return {
        calls,
        prepare(query) {
            return { bind: (...parameters) => ({
                first: async () => {
                    calls.push({ method: "first", query, parameters });
                    return pending;
                },
                run: async () => {
                    calls.push({ method: "run", query, parameters });
                    return { meta: { changes: 1, last_row_id: 41 } };
                },
            }) };
        },
    };
}

test("pending daily cards are read and consumed only through user-owned queries", async () => {
    const pending = {
        id: 42,
        source_text: card.word,
        translation_uk: card.translation_uk,
        context_note: card.context_en,
        examples_json: JSON.stringify(card.examples),
    };
    const db = pendingDailyWordDb(pending);
    const env = { DB: db };

    assert.equal((await getPendingDailyWord(env, 123, "2026-08-03")).id, 42);
    assert.equal(await savePendingDailyWordToLearning(env, 123, 42), true);

    const ownerQueries = db.calls.filter((call) => call.query.includes("pending_daily_words"));
    assert.ok(ownerQueries.every((call) => call.query.includes("user_id = ?")));
    assert.ok(ownerQueries.some((call) => call.parameters.includes(123)));
    const exampleWrites = db.calls.filter((call) => call.query.includes("INSERT INTO examples"));
    assert.equal(exampleWrites.length, 2);
    assert.deepEqual(exampleWrites.map((call) => call.parameters[3]), [1, 2]);
});
