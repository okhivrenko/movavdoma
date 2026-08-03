import test from "node:test";
import assert from "node:assert/strict";

import { getOpenDonationRequest, sendDonationInstructions } from "../donation-requests.js";
import { captureTelegramCalls, telegramCall } from "./worker-test-helpers.js";

function donationDb(request) {
    const calls = [];
    return {
        calls,
        prepare(query) {
            return { bind: (...parameters) => ({
                first: async () => {
                    calls.push({ query, parameters });
                    return request;
                },
            }) };
        },
    };
}

test("open donation requests are scoped to their owner and reused for instructions", async () => {
    const request = { id: 41, support_code: "MOV-ABCD", status: "awaiting_payment" };
    const db = donationDb(request);
    const env = { DB: db, TELEGRAM_BOT_TOKEN: "test-token" };

    assert.equal((await getOpenDonationRequest(env, 123)).id, 41);
    const { calls } = await captureTelegramCalls(() => sendDonationInstructions(env, 123, 123));
    const message = telegramCall(calls, "sendMessage");
    assert.match(message.text, /MOV-ABCD/);
    assert.equal(message.reply_markup.inline_keyboard[0][0].url, "https://send.monobank.ua/jar/9vp8W5V9nQ");
    assert.ok(db.calls.every((call) => call.query.includes("user_id = ?") && call.parameters[0] === 123));
});
