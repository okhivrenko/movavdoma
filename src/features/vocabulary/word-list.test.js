import test from "node:test";
import assert from "node:assert/strict";

import { sendActiveWordList, sendLearnedWordList, sendWordExamples } from "./word-list.js";

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

test("active-word list separates example and learned controls", async () => {
    const payload = await captureTelegramMessage(() => sendActiveWordList(
        envWithWords([{ id: 10, source_text: "resilient", translation_uk: "стійкий" }]),
        1,
        2
    ));

    assert.match(payload.text, /Показати приклад/);
    assert.match(payload.text, /Вже вивчив/);
    assert.equal(payload.reply_markup.inline_keyboard[0][0].text, "📘 1");
    assert.equal(payload.reply_markup.inline_keyboard[0][0].callback_data, "examples:10");
    assert.equal(payload.reply_markup.inline_keyboard[1][0].text, "✅ 1");
    assert.equal(payload.reply_markup.inline_keyboard[1][0].callback_data, "delete:10:0");
});

test("active-word list groups both actions and adds pagination", async () => {
    const words = Array.from({ length: 10 }, (_, index) => ({
        id: index + 1,
        source_text: `word-${index + 1}`,
        translation_uk: `переклад-${index + 1}`,
    }));
    const payload = await captureTelegramMessage(() => sendActiveWordList(envWithWords(words, 11), 1, 2));

    assert.equal(payload.reply_markup.inline_keyboard.length, 5);
    assert.equal(payload.reply_markup.inline_keyboard[0][0].text, "📘 1");
    assert.equal(payload.reply_markup.inline_keyboard[0][0].callback_data, "examples:1");
    assert.equal(payload.reply_markup.inline_keyboard[1][4].text, "📘 10");
    assert.equal(payload.reply_markup.inline_keyboard[1][4].callback_data, "examples:10");
    assert.equal(payload.reply_markup.inline_keyboard[2][0].text, "✅ 1");
    assert.equal(payload.reply_markup.inline_keyboard[2][0].callback_data, "delete:1:0");
    assert.equal(payload.reply_markup.inline_keyboard[3][4].text, "✅ 10");
    assert.equal(payload.reply_markup.inline_keyboard[3][4].callback_data, "delete:10:0");
    assert.equal(payload.reply_markup.inline_keyboard[4][0].callback_data, "active-page:1");
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

test("vocabulary list numbering continues from eleven on the second page", async () => {
    const words = Array.from({ length: 10 }, (_, index) => ({ id: index + 11, source_text: `word-${index + 11}`, translation_uk: `переклад-${index + 11}` }));
    const active = await captureTelegramMessage(() => sendActiveWordList(envWithWords(words, 20), 1, 2, 1));
    assert.match(active.text, /11\. word-11/);
    assert.equal(active.reply_markup.inline_keyboard[0][0].text, "📘 11");
    const learned = await captureTelegramMessage(() => sendLearnedWordList(envWithWords(words, 20), 1, 2, 1));
    assert.match(learned.text, /11\. word-11/);
    assert.equal(learned.reply_markup.inline_keyboard[0][0].text, "11");
});

test("opening a legacy incomplete card repairs its examples before sending them", async () => {
    const batches = [];
    const word = {
        id: 10,
        user_id: 2,
        source_text: "resilient",
        translation_uk: "стійкий",
        context_note: "able to recover quickly",
    };
    const env = {
        TELEGRAM_BOT_TOKEN: "test-token",
        OPENAI_API_KEY: "openai-test",
        DEEPL_API_KEY: "deepl-test:fx",
        DB: {
            prepare(query) {
                return { bind: (...parameters) => ({
                    query,
                    parameters,
                    first: async () => query.includes("FROM words") ? word : undefined,
                    all: async () => ({ results: [{ sentence_source: "Old incomplete example.", sentence_uk: "Старий неповний приклад." }] }),
                }) };
            },
            batch: async (batch) => { batches.push(batch); return batch.map(() => ({ meta: { changes: 1 } })); },
        },
    };
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, options) => {
        calls.push({ url: String(url), payload: JSON.parse(options.body) });
        if (String(url).includes("api.openai.com")) {
            return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ examples: [
                { source: "The team stayed resilient during the crisis." },
                { source: "She remained resilient after several setbacks." },
            ] }) } }] }));
        }
        if (String(url).includes("api-free.deepl.com")) {
            return new Response(JSON.stringify({ translations: [
                { text: "стійкий" },
                { text: "Команда залишалася стійкою під час кризи." },
                { text: "Вона залишалася стійкою після кількох невдач." },
            ] }));
        }
        return new Response(JSON.stringify({ ok: true, result: {} }));
    };
    try {
        assert.equal(await sendWordExamples(env, 1, 2, 10), true);
    } finally {
        globalThis.fetch = originalFetch;
    }
    assert.equal(batches.length, 1);
    assert.match(batches[0][0].query, /UPDATE words SET translation_uk/);
    assert.match(batches[0][1].query, /DELETE FROM examples/);
    assert.equal(batches[0].length, 4);
    const telegramMessage = calls.find((call) => call.url.includes("sendMessage"));
    assert.match(telegramMessage.payload.text, /1\. The team stayed resilient/);
    assert.match(telegramMessage.payload.text, /2\. She remained resilient/);
});
