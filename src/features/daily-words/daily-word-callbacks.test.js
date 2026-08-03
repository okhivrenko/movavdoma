import test from "node:test";
import assert from "node:assert/strict";

import { handleDailyWordCallback } from "./daily-word-callbacks.js";
import { captureTelegramCalls, telegramCall } from "../../../test-support/worker-test-helpers.js";

const callback = { id: "callback-1" };
const context = { chatId: 123, messageId: 7, userId: 123 };
const dependencies = {
    claimDailyWordAddition: async () => true,
    getDailyAdditionLimit: async () => 10,
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
