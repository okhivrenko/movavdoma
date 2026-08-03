import test from "node:test";
import assert from "node:assert/strict";

import { adminKeyboard, sendAdminUserList } from "../admin-panel.js";
import { captureTelegramCalls, telegramCall } from "./worker-test-helpers.js";

test("admin panel keeps stable callback actions and reports an empty user list", async () => {
    assert.equal(adminKeyboard().inline_keyboard[0][0].callback_data, "admin:users");
    const env = { TELEGRAM_BOT_TOKEN: "test-token", DB: { prepare: () => ({ first: async () => ({ total: 0 }) }) } };
    const { calls } = await captureTelegramCalls(() => sendAdminUserList(
        env, 456, 0, null, { isAdmin: () => false, dailyAddLimit: 10 }
    ));
    assert.match(telegramCall(calls, "sendMessage").text, /Користувачів поки немає/);
});
