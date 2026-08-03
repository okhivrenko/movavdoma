import test from "node:test";
import assert from "node:assert/strict";

import { dailyCardFromPending, dailyWordKeyboard, dailyWordText } from "../daily-words.js";

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
