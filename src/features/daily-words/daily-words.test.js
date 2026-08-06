import test from "node:test";
import assert from "node:assert/strict";

import {
    dailyCardFromPending,
    dailyWordKeyboard,
    dailyWordText,
    generateDailyWordCard,
    generateNewDailyWord,
    getPendingDailyWord,
    hasValidDailyExamples,
    savePendingDailyWordToLearning,
} from "./daily-words.js";

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
        inline_keyboard: [
            [{ text: "📖 Вчити", callback_data: "daily:learn:42" }],
            [{ text: "Наступне слово →", callback_data: "daily:next:42" }],
        ],
    });
    assert.deepEqual(dailyWordKeyboard(42, { hasPrevious: true, canLearn: false }).inline_keyboard, [[
        { text: "← Попереднє слово", callback_data: "daily:prev:42" },
        { text: "Наступне слово →", callback_data: "daily:next:42" },
    ]]);

    const text = dailyWordText(card, "B1");
    assert.match(text, /^📚 Нове слово · B1/);
    assert.match(text, /1\. The reliable bus arrived exactly on time\./);
    assert.match(text, /2\. She is reliable when the team needs help\./);
});

test("daily word generation retries a failed card build before giving up", async () => {
    let calls = 0;
    const env = { DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) } };
    const generated = await generateNewDailyWord(env, 123, "B1", async () => {
        calls += 1;
        if (calls === 1) throw new Error("temporary provider failure");
        return card;
    }, 3);

    assert.equal(calls, 2);
    assert.equal(generated.word, card.word);
});

test("daily generation rejects a word retained in the user's durable history", async () => {
    const calls = [];
    const env = { DB: { prepare: (query) => ({ bind: (...parameters) => ({ first: async () => {
        calls.push({ query, parameters });
        return { exists: 1 };
    } }) }) } };

    await assert.rejects(
        generateNewDailyWord(env, 123, "B1", async () => card, 1),
        /Could not generate a new daily word/,
    );
    assert.match(calls[0].query, /FROM user_seen_words/);
    assert.deepEqual(calls[0].parameters, [123, "reliable", 123, "reliable", 123, "reliable", 123, "reliable"]);
});

test("daily cards reuse a shared card and skip DeepL for a matching word meaning", async () => {
    const requests = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        requests.push({ url, body: JSON.parse(init.body) });
        if (url.includes("api.openai.com")) {
            return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
                word: "reliable",
                context_en: "able to be trusted",
                examples: [
                    { source: "The reliable bus arrived exactly on time for every passenger." },
                    { source: "She is reliable whenever the team needs extra help." },
                ],
            }) } }] }), { status: 200 });
        }
        assert.fail("DeepL must not be called when a shared card exists");
    };
    const sharedCard = {
        translation_uk: "надійний",
        examples: [
            { source: "The reliable bus arrived exactly on time for every passenger.", uk: "Надійний автобус прибув точно вчасно для кожного пасажира." },
            { source: "She is reliable whenever the team needs extra help.", uk: "На неї можна покластися, коли команді потрібна додаткова допомога." },
        ],
    };
    const env = {
        OPENAI_API_KEY: "test-key",
        DEEPL_API_KEY: "test-key",
        DB: { prepare: () => ({ bind: () => ({ first: async () => ({
            translation_uk: sharedCard.translation_uk,
            examples_json: JSON.stringify(sharedCard.examples),
        }) }) }) },
    };
    try {
        const generated = await generateDailyWordCard(env, "B1");
        assert.equal(generated.translation_uk, sharedCard.translation_uk);
        assert.deepEqual(generated.examples, sharedCard.examples);
        assert.equal(requests.length, 1);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("daily cards reject placeholder, duplicate, and out-of-range example sentences", () => {
    const valid = [
        { source: "The reliable bus arrived exactly on time for every passenger." },
        { source: "She is reliable whenever the team needs extra help." },
    ];
    assert.equal(hasValidDailyExamples(valid), true);
    assert.equal(hasValidDailyExamples([{ source: "A" }, { source: "B" }]), false);
    assert.equal(hasValidDailyExamples([valid[0], valid[0]]), false);
    assert.equal(hasValidDailyExamples([{ source: "Too short." }, valid[1]]), false);
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

    const ownerQueries = db.calls.filter((call) => call.query.includes("daily_word_cards"));
    assert.ok(ownerQueries.every((call) => call.query.includes("user_id = ?")));
    assert.ok(ownerQueries.some((call) => call.parameters.includes(123)));
    assert.ok(ownerQueries.some((call) => call.query.includes("NOT EXISTS") && call.query.includes("FROM words")));
    const exampleWrites = db.calls.filter((call) => call.query.includes("INSERT INTO examples"));
    assert.equal(exampleWrites.length, 2);
    assert.deepEqual(exampleWrites.map((call) => call.parameters[3]), [1, 2]);
    assert.ok(db.calls.some((call) => call.query.includes("SET learned_at = CURRENT_TIMESTAMP") && call.parameters.includes(123)));
});
