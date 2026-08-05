import test from "node:test";
import assert from "node:assert/strict";

import { handleAdminCallback } from "./admin-callbacks.js";
import { captureTelegramCalls, telegramCall } from "../../../test-support/worker-test-helpers.js";

test("admin callbacks reject a non-admin before any admin action", async () => {
    const env = { TELEGRAM_BOT_TOKEN: "test-token" };
    const { calls } = await captureTelegramCalls(() => handleAdminCallback(
        env,
        { id: "callback", data: "admin:feedback:read:42:0" },
        { chatId: 456, messageId: 7, userId: 123 },
        { isAdmin: () => false, dailyAddLimit: 10, getBotLink: async () => "https://t.me/example" }
    ));

    assert.equal(telegramCall(calls, "answerCallbackQuery").text, "Ця дія доступна лише адміну.");
});

test("admin callback opens the selected feedback by its persistent record ID", async () => {
    const env = {
        TELEGRAM_BOT_TOKEN: "test-token",
        DB: {
            prepare: () => ({
                bind: () => ({ first: async () => ({
                    id: 42,
                    user_id: 123,
                    content: "Дякую за бота",
                    created_at: "2026-08-05 08:00:00",
                    telegram_username: null,
                    telegram_first_name: null,
                }) }),
            }),
        },
    };
    const { calls } = await captureTelegramCalls(() => handleAdminCallback(
        env,
        { id: "callback", data: "admin:feedback:read:42:0" },
        { chatId: 456, messageId: 7, userId: 999 },
        { isAdmin: () => true, dailyAddLimit: 10, getBotLink: async () => "https://t.me/example" }
    ));
    assert.equal(telegramCall(calls, "answerCallbackQuery").text, "Відкриваю звернення.");
    assert.match(telegramCall(calls, "editMessageText").text, /Дякую за бота/);
});

test("admin callback opens feedback history and preserves pagination callbacks", async () => {
    const env = {
        TELEGRAM_BOT_TOKEN: "test-token",
        DB: {
            prepare: (query) => ({
                bind: () => query.includes("COUNT(*) AS total FROM user_messages")
                    ? { first: async () => ({ total: 1 }) }
                    : { all: async () => ({ results: [{ user_id: 123, content: "Дякую", telegram_username: null, telegram_first_name: null }] }) },
            }),
        },
    };
    const { calls } = await captureTelegramCalls(() => handleAdminCallback(
        env,
        { id: "callback", data: "admin:feedback" },
        { chatId: 456, messageId: 7, userId: 999 },
        { isAdmin: () => true, dailyAddLimit: 10, getBotLink: async () => "https://t.me/example" }
    ));
    assert.equal(telegramCall(calls, "answerCallbackQuery").text, "Готую список звернень.");
    assert.match(telegramCall(calls, "sendMessage").text, /💬 Відгуки: 1/);
});
