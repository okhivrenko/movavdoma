import test from "node:test";
import assert from "node:assert/strict";

import { sendActiveWordList, sendLearnedWordList } from "../word-list.js";

function envWithWords(words, total = words.length) {
    return {
        TELEGRAM_BOT_TOKEN: "test-token",
        DB: {
            prepare(query) {
                return {
                    bind() {
                        return {
                            all: async () => ({ results: words }),
                            first: async () => query.includes("COUNT(*)") ? { total } : undefined,
                        };
                    },
                };
            },
        },
    };
}

async function captureTelegramMessage(action) {
    const originalFetch = globalThis.fetch;
    let payload;
    globalThis.fetch = async (_url, options) => {
        payload = JSON.parse(options.body);
        return new Response(JSON.stringify({ ok: true, result: {} }));
    };

    try {
        await action();
        return payload;
    } finally {
        globalThis.fetch = originalFetch;
    }
}

test("active-word list sends active controls", async () => {
    const payload = await captureTelegramMessage(() => sendActiveWordList(
        envWithWords([{ id: 10, source_text: "resilient", translation_uk: "стійкий" }]),
        1,
        2
    ));

    assert.match(payload.text, /Останні слова/);
    assert.equal(payload.reply_markup.inline_keyboard[0][1].callback_data, "delete:10");
});

test("learned-word list sends restore controls", async () => {
    const payload = await captureTelegramMessage(() => sendLearnedWordList(
        envWithWords([{ id: 20, source_text: "thrive", translation_uk: "процвітати" }]),
        1,
        2
    ));

    assert.match(payload.text, /Вивчені слова/);
    assert.equal(payload.reply_markup.inline_keyboard[0][0].callback_data, "restore:20:0");
});

test("learned-word list groups number controls and adds pagination", async () => {
    const words = Array.from({ length: 10 }, (_, index) => ({
        id: index + 1,
        source_text: `word-${index + 1}`,
        translation_uk: `переклад-${index + 1}`,
    }));
    const payload = await captureTelegramMessage(() => sendLearnedWordList(envWithWords(words, 11), 1, 2));

    assert.equal(payload.reply_markup.inline_keyboard.length, 3);
    assert.equal(payload.reply_markup.inline_keyboard[0][0].text, "1");
    assert.equal(payload.reply_markup.inline_keyboard[1][4].text, "10");
    assert.equal(payload.reply_markup.inline_keyboard[2][0].callback_data, "learned-page:1");
});
