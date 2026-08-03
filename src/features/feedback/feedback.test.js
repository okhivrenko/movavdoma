import test from "node:test";
import assert from "node:assert/strict";

import { startFeedback, submitFeedback } from "./feedback.js";
import { captureTelegramCalls, telegramCall } from "../../../test-support/worker-test-helpers.js";

function feedbackDb() {
    const calls = [];
    return {
        calls,
        prepare(query) {
            return { bind: (...parameters) => ({
                run: async () => {
                    calls.push({ query, parameters });
                    return { meta: { changes: 1 } };
                },
            }) };
        },
    };
}

test("feedback flow sets state, forwards one message to admin, then clears state", async () => {
    const db = feedbackDb();
    const env = { DB: db, TELEGRAM_BOT_TOKEN: "test-token" };
    const { calls } = await captureTelegramCalls(async () => {
        await startFeedback(env, 123, 123);
        await submitFeedback(env, 123, 123, "Дякую!", async () => 999);
    });

    assert.deepEqual(db.calls.map((call) => call.parameters), [[123], [123]]);
    assert.match(db.calls[0].query, /feedback_pending = 1/);
    assert.match(db.calls[1].query, /feedback_pending = 0/);
    assert.match(telegramCall(calls, "sendMessage").text, /Напиши одним повідомленням/);
    assert.ok(calls.some((call) => call.payload.chat_id === 999 && call.payload.text.includes("Користувач: 123")));
});

test("feedback is not cleared when the admin chat is unavailable", async () => {
    const db = feedbackDb();
    await assert.rejects(
        () => submitFeedback({ DB: db }, 123, 123, "Текст", async () => null),
        /admin chat is unavailable/
    );
    assert.equal(db.calls.length, 0);
});
