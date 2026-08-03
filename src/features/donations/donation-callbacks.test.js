import test from "node:test";
import assert from "node:assert/strict";

import { handleDonationCallback } from "./donation-callbacks.js";
import { captureTelegramCalls, telegramCall } from "../../../test-support/worker-test-helpers.js";

test("donation callbacks reject non-admins before grant operations", async () => {
    let grants = 0;
    const { calls } = await captureTelegramCalls(() => handleDonationCallback(
        { TELEGRAM_BOT_TOKEN: "test-token" },
        { id: "callback", data: "bonus:level:2:5" },
        { chatId: 456, messageId: 7, userId: 123 },
        {
            isAdmin: () => false,
            grantDonationBonus: async () => { grants += 1; },
            rejectDonationBonus: async () => { grants += 1; },
            grantTemporaryAccessLevel: async () => {},
        }
    ));
    assert.equal(grants, 0);
    assert.equal(telegramCall(calls, "answerCallbackQuery").text, "Ця дія доступна лише адміну.");
});
