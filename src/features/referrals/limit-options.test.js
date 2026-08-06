import test from "node:test";
import assert from "node:assert/strict";

import { handleLimitOptionsCallback, sendLimitReachedOptions } from "./limit-options.js";
import { captureTelegramCalls, telegramCall } from "../../../test-support/worker-test-helpers.js";

const env = { TELEGRAM_BOT_TOKEN: "test-token" };
const invitation = {
    replyMarkup: { inline_keyboard: [[{ text: "Запросити друга", url: "https://t.me/share/url?url=ref" }]] },
};

test("a reached limit offers referral, support, and bonus actions", async () => {
    const { calls } = await captureTelegramCalls(() => sendLimitReachedOptions(env, 123, 456, 10, {
        referralInvitation: async () => invitation,
    }));
    const message = telegramCall(calls, "sendMessage");
    assert.match(message.text, /ліміт — 10/);
    assert.match(message.text, /ще розвиваємо MovaYakVDoma/);
    assert.deepEqual(message.reply_markup.inline_keyboard, [
        invitation.replyMarkup.inline_keyboard[0],
        [
            { text: "☕ Підтримати бот", callback_data: "limit:support" },
            { text: "🎁 Отримати бонус", callback_data: "limit:bonus" },
        ],
    ]);
});

test("limit support callback opens the existing donation flow for its owner", async () => {
    const opened = [];
    const { calls } = await captureTelegramCalls(() => handleLimitOptionsCallback(
        env,
        { id: "callback", data: "limit:support" },
        { chatId: 123, userId: 456 },
        {
            sendDonationInstructions: async (...args) => opened.push(args),
            submitDonationBonusRequest: async () => assert.fail("bonus flow must not run"),
            notifyPendingDonationRequests: async () => {},
        }
    ));
    assert.deepEqual(opened, [[env, 123, 456]]);
    assert.equal(telegramCall(calls, "answerCallbackQuery").text, "Готую код для підтримки…");
});

test("limit bonus callback uses the existing donation request flow", async () => {
    const submitted = [];
    const notify = async () => {};
    await captureTelegramCalls(() => handleLimitOptionsCallback(
        env,
        { id: "callback", data: "limit:bonus" },
        { chatId: 123, userId: 456 },
        {
            sendDonationInstructions: async () => assert.fail("support flow must not run"),
            submitDonationBonusRequest: async (...args) => submitted.push(args),
            notifyPendingDonationRequests: notify,
        }
    ));
    assert.deepEqual(submitted, [[env, 123, 456, notify]]);
});
