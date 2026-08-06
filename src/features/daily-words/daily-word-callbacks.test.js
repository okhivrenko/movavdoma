import test from "node:test";
import assert from "node:assert/strict";

import { handleDailyWordCallback } from "./daily-word-callbacks.js";
import { captureTelegramCalls, telegramCall } from "../../../test-support/worker-test-helpers.js";

const callback = { id: "callback-1" };
const context = { chatId: 123, messageId: 7, userId: 123 };
const dependencies = {
    claimDailyWordAddition: async () => true,
    getDailyAdditionLimit: async () => 10,
    sendReadyNextDailyWord: async () => ({ status: "missing" }),
};

test("daily callback handler leaves other callback namespaces untouched", async () => {
    const handled = await handleDailyWordCallback({ DB: {} }, { ...callback, data: "examples:5" }, context, dependencies);
    assert.equal(handled, false);
});

test("daily callback handler rejects malformed legacy-safe actions before any D1 query", async () => {
    const { calls } = await captureTelegramCalls(async () => {
        const handled = await handleDailyWordCallback({ DB: {} }, { ...callback, data: "daily:learn:not-an-id" }, context, dependencies);
        assert.equal(handled, true);
    });
    assert.equal(telegramCall(calls, "answerCallbackQuery").text, "Невірний вибір.");
});

test("daily loading callback is always acknowledged", async () => {
    const { calls } = await captureTelegramCalls(async () => {
        assert.equal(await handleDailyWordCallback({ DB: {} }, { ...callback, data: "daily:loading" }, context, dependencies), true);
    });
    assert.equal(telegramCall(calls, "answerCallbackQuery").text, "Ще готую слово…");
});

test("saving a daily card at the addition limit offers the combined growth options", async () => {
    const options = [];
    const env = {
        TELEGRAM_BOT_TOKEN: "test-token",
        DB: {
            prepare: () => ({ bind: () => ({ first: async () => ({ id: 42 }) }) }),
        },
    };
    const { calls } = await captureTelegramCalls(async () => {
        const handled = await handleDailyWordCallback(env, { ...callback, data: "daily:learn:42" }, context, {
            ...dependencies,
            claimDailyWordAddition: async () => false,
            getDailyAdditionLimit: async () => 10,
            sendLimitReachedOptions: async (...args) => options.push(args),
        });
        assert.equal(handled, true);
    });
    assert.deepEqual(options, [[env, 123, 123, 10]]);
    assert.equal(telegramCall(calls, "answerCallbackQuery").text, "Денний ліміт вичерпано.");
});

test("a ready daily card bypasses loading and the queue", async () => {
    let queued = false;
    const { calls } = await captureTelegramCalls(async () => {
        const handled = await handleDailyWordCallback({ DB: {} }, { ...callback, data: "daily:next:42" }, context, {
            ...dependencies,
            sendReadyNextDailyWord: async () => ({ status: "shown", source: "prefetch" }),
            queueNextDailyWord: async () => { queued = true; },
        });
        assert.equal(handled, true);
    });
    assert.equal(queued, false);
    assert.equal(calls.some((call) => call.url.endsWith("/editMessageReplyMarkup")), false);
});

test("daily next callback queues only the owned pending card for replacement", async () => {
    const calls = [];
    const { calls: telegramCalls } = await captureTelegramCalls(async () => {
        const handled = await handleDailyWordCallback({ DB: {} }, { ...callback, data: "daily:next:42" }, context, {
            ...dependencies,
            queueNextDailyWord: async (...args) => {
                calls.push(args.slice(1));
                return true;
            },
        });
        assert.equal(handled, true);
    });

    assert.deepEqual(calls, [[{ chatId: 123, messageId: 7, userId: 123, pendingId: 42 }]]);
    assert.equal(telegramCall(telegramCalls, "answerCallbackQuery").text, "Шукаю наступне слово…");
    const loadingCall = telegramCall(telegramCalls, "editMessageReplyMarkup");
    assert.deepEqual(loadingCall.reply_markup, {
        inline_keyboard: [[{ text: "⏳ Завантаження…", callback_data: "daily:loading" }]],
    });
});

test("daily navigation restores a retry button after a generation failure", async () => {
    const { calls } = await captureTelegramCalls(async () => {
        const handled = await handleDailyWordCallback({ DB: {} }, { ...callback, data: "daily:next:42" }, context, {
            ...dependencies,
            queueNextDailyWord: async () => { throw new Error("Queue unavailable"); },
        });
        assert.equal(handled, true);
    });

    const replyMarkupCalls = calls.filter((call) => call.url.endsWith("/editMessageReplyMarkup"));
    assert.deepEqual(replyMarkupCalls.at(-1).payload.reply_markup, {
        inline_keyboard: [[{ text: "🔄 Спробувати ще раз", callback_data: "daily:next:42" }]],
    });
    assert.equal(telegramCall(calls, "sendMessage").text, "Не вдалося завантажити слово. Спробуй ще раз.");
});

test("daily navigation clears the loading state when its card is no longer available", async () => {
    const { calls } = await captureTelegramCalls(async () => {
        const handled = await handleDailyWordCallback({ DB: {} }, { ...callback, data: "daily:prev:42" }, context, {
            ...dependencies,
            sendPreviousDailyWord: async () => false,
        });
        assert.equal(handled, true);
    });

    const replyMarkupCalls = calls.filter((call) => call.url.endsWith("/editMessageReplyMarkup"));
    assert.deepEqual(replyMarkupCalls.at(-1).payload.reply_markup, { inline_keyboard: [] });
    assert.equal(telegramCall(calls, "sendMessage").text, "Ця картка вже недоступна. Відкрий «📚 Щоденне слово» ще раз.");
});
