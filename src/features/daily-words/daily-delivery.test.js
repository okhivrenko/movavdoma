import test from "node:test";
import assert from "node:assert/strict";

import { sendTodayDailyWord } from "./daily-delivery.js";

const pending = {
    id: 42,
    source_text: "reliable",
    translation_uk: "надійний",
    context_note: "able to be trusted",
    examples_json: JSON.stringify([
        { source: "The reliable bus arrived exactly on time.", uk: "Надійний автобус прибув точно вчасно." },
        { source: "She is reliable when the team needs help.", uk: "На неї можна покластися, коли команді потрібна допомога." },
    ]),
};

test("opening the daily-word menu again replaces the already displayed pending card", async () => {
    const requests = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
        requests.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ ok: true, result: true }), { headers: { "content-type": "application/json" } });
    };
    try {
        const env = {
            TELEGRAM_BOT_TOKEN: "test-token",
            DB: {
                prepare(query) {
                    return { bind: (...parameters) => ({
                        first: async () => query.includes("FROM users")
                            ? { timezone: "Europe/Warsaw", daily_level: "B1", should_refresh_daily_word: 1 }
                            : query.includes("id >") || query.includes("id <") ? null : pending,
                        run: async () => ({ meta: { changes: 1, last_row_id: 43 } }),
                    }) };
                },
            },
        };
        const replacement = {
            word: "curious", translation_uk: "допитливий", context_en: "eager to know",
            examples: [
                { source: "The curious child asked another question.", uk: "Допитлива дитина поставила ще одне запитання." },
                { source: "I was curious about the new project.", uk: "Мені було цікаво щодо нового проєкту." },
            ],
        };
        await sendTodayDailyWord(env, 123, 123, {
            claimDailyWordCard: async () => true,
            access: {},
            dailyWordCardLimitForLevel: () => 5,
            getUserAccessLevel: async () => 0,
            generateNewDailyWord: async () => replacement,
            generateDailyWordCard: async () => replacement,
            maxAttempts: 3,
        });
        assert.match(requests[0].text, /curious — допитливий/);
        assert.equal(requests[0].reply_markup.inline_keyboard[1][0].callback_data, "daily:next:43");
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("opening the menu again within twelve hours preserves the pending card and resets the cooldown", async () => {
    const requests = [];
    const dbCalls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
        requests.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ ok: true, result: true }), { headers: { "content-type": "application/json" } });
    };
    try {
        const env = {
            TELEGRAM_BOT_TOKEN: "test-token",
            DB: {
                prepare(query) {
                    return { bind: (...parameters) => ({
                        first: async () => query.includes("FROM users")
                            ? { timezone: "Europe/Warsaw", daily_level: "B1", should_refresh_daily_word: 0 }
                            : pending,
                        run: async () => {
                            dbCalls.push({ query, parameters });
                            return { meta: { changes: 1 } };
                        },
                    }) };
                },
            },
        };
        await sendTodayDailyWord(env, 123, 123, {
            claimDailyWordCard: async () => assert.fail("a cooldown display must not claim another card"),
            generateNewDailyWord: async () => assert.fail("a cooldown display must not generate another card"),
        });
        assert.match(requests[0].text, /reliable — надійний/);
        assert.ok(dbCalls.some((call) => call.query.includes("last_daily_word_menu_opened_at") && call.parameters.includes(123)));
    } finally {
        globalThis.fetch = originalFetch;
    }
});
