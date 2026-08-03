import test from "node:test";
import assert from "node:assert/strict";

import {
    getOpenDonationRequest,
    sendDonationInstructions,
    submitDonationBonusRequest,
} from "./donation-requests.js";
import { captureTelegramCalls, telegramCall } from "../../../test-support/worker-test-helpers.js";

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

test("submitting a donation request marks a payment for review and notifies admins", async () => {
    const calls = [];
    const env = {
        TELEGRAM_BOT_TOKEN: "test-token",
        DB: {
            prepare(query) {
                return { bind: (...parameters) => ({
                    first: async () => ({ id: 41, status: "awaiting_payment" }),
                    run: async () => {
                        calls.push({ query, parameters });
                        return { meta: { changes: 1 } };
                    },
                }) };
            },
        },
    };
    let notified = 0;

    const { calls: telegramCalls } = await captureTelegramCalls(() => submitDonationBonusRequest(
        env,
        123,
        123,
        async (notifiedEnv) => {
            assert.equal(notifiedEnv, env);
            notified += 1;
        }
    ));

    assert.equal(notified, 1);
    assert.ok(calls.some((call) => call.query.includes("SET status = 'awaiting_review'")));
    assert.match(telegramCall(telegramCalls, "sendMessage").text, /Заявку на бонус прийнято/);
});
