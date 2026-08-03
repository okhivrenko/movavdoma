import test from "node:test";
import assert from "node:assert/strict";

import { handleAdminCallback } from "../src/features/admin/admin-callbacks.js";
import { captureTelegramCalls, telegramCall } from "./worker-test-helpers.js";

test("admin callbacks reject a non-admin before any admin action", async () => {
    const env = { TELEGRAM_BOT_TOKEN: "test-token" };
    const { calls } = await captureTelegramCalls(() => handleAdminCallback(
        env,
        { id: "callback", data: "admin:users" },
        { chatId: 456, messageId: 7, userId: 123 },
        { isAdmin: () => false, dailyAddLimit: 10, getBotLink: async () => "https://t.me/example" }
    ));

    assert.equal(telegramCall(calls, "answerCallbackQuery").text, "Ця дія доступна лише адміну.");
});
