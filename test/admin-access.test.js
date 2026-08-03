import test from "node:test";
import assert from "node:assert/strict";

import { grantManualAccessLevel } from "../src/features/admin/admin-access.js";
import { captureTelegramCalls, telegramCall } from "./worker-test-helpers.js";

test("manual access upgrade notifies an existing user only when the level changed", async () => {
    const env = { TELEGRAM_BOT_TOKEN: "test-token", DB: { prepare: () => ({ bind: () => ({
        first: async () => ({ chat_id: 456 }),
    }) }) } };
    const { calls } = await captureTelegramCalls(() => grantManualAccessLevel(env, 123, 2, {
        grantAccessLevel: async () => ({ changed: true, accessLevel: 2 }),
        getDailyAdditionLimit: async () => 15,
        dailyAddLimit: 10,
        dailyWordCardLimitForLevel: (level) => level * 5 + 5,
        adminSettingsUpdated: (dailyAdditionLimit, dailyCardLimit) => `limits ${dailyAdditionLimit}/${dailyCardLimit}`,
    }));

    assert.equal(telegramCall(calls, "sendMessage").chat_id, 456);
    assert.match(telegramCall(calls, "sendMessage").text, /limits 15\/15/);
});
