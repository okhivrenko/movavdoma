import test from "node:test";
import assert from "node:assert/strict";

import { startFeedback, submitFeedback, USER_MESSAGE_TYPE } from "./feedback.js";
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

test("feedback flow records, forwards, and clears one feedback message", async () => {
    const db = feedbackDb();
    const env = { DB: db, TELEGRAM_BOT_TOKEN: "test-token" };
    const { calls } = await captureTelegramCalls(async () => {
        await startFeedback(env, 123, 123);
        await submitFeedback(env, 123, 123, "Дякую!", async () => 999);
    });

    assert.deepEqual(db.calls.map((call) => call.parameters), [["feedback", 123], [123, "feedback", "Дякую!"], [123]]);
    assert.match(db.calls[0].query, /feedback_pending = 1/);
    assert.match(db.calls[1].query, /INSERT INTO user_messages/);
    assert.match(db.calls[2].query, /feedback_pending = 0/);
    assert.match(telegramCall(calls, "sendMessage").text, /Напиши одним повідомленням/);
    assert.ok(calls.some((call) => call.payload.chat_id === 999 && call.payload.text.includes("Користувач: 123")));
});

test("contact flow retains its type in history and admin notification", async () => {
    const db = feedbackDb();
    const env = { DB: db, TELEGRAM_BOT_TOKEN: "test-token" };
    const { calls } = await captureTelegramCalls(async () => {
        await startFeedback(env, 123, 123, "Напиши повідомлення", USER_MESSAGE_TYPE.CONTACT);
        await submitFeedback(env, 123, 123, "Питання", async () => 999, USER_MESSAGE_TYPE.CONTACT);
    });

    assert.deepEqual(db.calls[0].parameters, ["contact", 123]);
    assert.deepEqual(db.calls[1].parameters, [123, "contact", "Питання"]);
    assert.match(calls.find((call) => call.payload.chat_id === 999).payload.text, /📩 Нове повідомлення/);
});

test("feedback is retained but not cleared when the admin chat is unavailable", async () => {
    const db = feedbackDb();
    await assert.rejects(
        () => submitFeedback({ DB: db }, 123, 123, "Текст", async () => null),
        /admin chat is unavailable/
    );
    assert.equal(db.calls.length, 1);
    assert.match(db.calls[0].query, /INSERT INTO user_messages/);
});
