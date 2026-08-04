import test from "node:test";
import assert from "node:assert/strict";

import { adminKeyboard, lastActivityLabel, sendAdminUserList } from "./admin-panel.js";
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
                        last_seen_at: "2026-08-04 08:00:00",
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
    const text = telegramCall(calls, "sendMessage").text;
    assert.match(text, /ID 123 · @olena · Олена/);
    assert.match(text, /був:/);
});

test("last activity uses compact relative labels and handles users without a recorded interaction", () => {
    const now = Date.parse("2026-08-04T10:00:00Z");
    assert.equal(lastActivityLabel(null, now), "—");
    assert.equal(lastActivityLabel("2026-08-04 09:59:30", now), "щойно");
    assert.equal(lastActivityLabel("2026-08-04 09:45:00", now), "15хв");
    assert.equal(lastActivityLabel("2026-08-04 06:00:00", now), "4г");
    assert.equal(lastActivityLabel("2026-08-01 10:00:00", now), "3д");
});
