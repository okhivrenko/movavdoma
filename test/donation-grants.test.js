import test from "node:test";
import assert from "node:assert/strict";

import { grantDonationBonus, notifyExpiredDonationAccessGrants } from "../src/features/donations/donation-grants.js";
import { captureTelegramCalls, telegramCall } from "./worker-test-helpers.js";

test("donation grant is idempotent before creating temporary access", async () => {
    const calls = [];
    const env = { DB: { prepare: (query) => ({ bind: (...parameters) => ({
        first: async () => {
            calls.push({ method: "first", query, parameters });
            return { id: 5, user_id: 123, status: "granted" };
        },
        run: async () => {
            calls.push({ method: "run", query, parameters });
            return { meta: { changes: 1 } };
        },
    }) }) } };
    let grants = 0;
    assert.equal(await grantDonationBonus(env, 5, 2, async () => { grants += 1; }), null);
    assert.equal(grants, 0);
    assert.equal(calls.filter((call) => call.method === "run").length, 0);
});

test("expired donation access is claimed before notifying its owner", async () => {
    const updates = [];
    const env = { TELEGRAM_BOT_TOKEN: "test-token", DB: { prepare(query) {
        if (query.includes("SELECT g.id")) return { all: async () => ({ results: [{ id: 5, user_id: 123, chat_id: 456 }] }) };
        return { bind: (...parameters) => ({ run: async () => {
            updates.push({ query, parameters });
            return { meta: { changes: 1 } };
        } }) };
    } } };

    const { calls } = await captureTelegramCalls(() => notifyExpiredDonationAccessGrants(
        env,
        async (_keyboardEnv, userId) => {
            assert.equal(userId, 123);
            return { keyboard: [["Меню"]] };
        }
    ));

    assert.ok(updates[0].query.includes("SET expired_notified_at = CURRENT_TIMESTAMP"));
    assert.match(telegramCall(calls, "sendMessage").text, /бонусний період завершився/);
});
