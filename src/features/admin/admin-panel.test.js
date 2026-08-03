import test from "node:test";
import assert from "node:assert/strict";

import { adminKeyboard, sendAdminUserList } from "./admin-panel.js";
import { captureTelegramCalls, telegramCall } from "../../../test-support/worker-test-helpers.js";

test("admin panel keeps stable callback actions and reports an empty user list", async () => {
    assert.equal(adminKeyboard().inline_keyboard[0][0].callback_data, "admin:users");
    const env = { TELEGRAM_BOT_TOKEN: "test-token", DB: { prepare: () => ({ first: async () => ({ total: 0 }) }) } };
    const { calls } = await captureTelegramCalls(() => sendAdminUserList(
        env, 456, 0, null, { isAdmin: () => false, dailyAddLimit: 10 }
    ));
    assert.match(telegramCall(calls, "sendMessage").text, /Користувачів поки немає/);
});

test("admin user list includes the stored Telegram nickname and first name", async () => {
    const env = {
        TELEGRAM_BOT_TOKEN: "test-token",
        DB: {
            prepare: (query) => {
                if (query.trim().startsWith("SELECT COUNT(*) AS total FROM users")) return { first: async () => ({ total: 1 }) };
                return { bind: () => ({
                    all: async () => ({ results: [{
                        telegram_user_id: 123,
                        telegram_username: "olena",
                        telegram_first_name: "Олена",
                        active_word_count: 2,
                        bonus_daily_limit: null,
                        access_level: 0,
                    }] }),
                }) };
            },
        },
    };
    const { calls } = await captureTelegramCalls(() => sendAdminUserList(
        env, 456, 0, null, { isAdmin: () => false, dailyAddLimit: 10 }
    ));
    assert.match(telegramCall(calls, "sendMessage").text, /ID 123 · @olena · Олена/);
});
