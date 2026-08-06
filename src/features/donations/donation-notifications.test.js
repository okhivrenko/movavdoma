import test from "node:test";
import assert from "node:assert/strict";
import { adminDonationKeyboard, notifyPendingDonationRequests, notifyUnmatchedDonations } from "./donation-notifications.js";

test("donation review keyboard preserves stable admin callback formats", () => {
    const keyboard = adminDonationKeyboard(42, 2).inline_keyboard.flat();
    assert.ok(keyboard.some((button) => button.callback_data === "bonus:level:2:42"));
    assert.ok(keyboard.some((button) => button.callback_data === "bonus:reject:42"));
});

test("unmatched donation is marked only after admin notification succeeds", async () => {
    const writes = [];
    const env = { DB: { prepare: (query) => ({
        all: async () => ({ results: [{ transaction_id: "tx-1", amount_kopiykas: 1000, comment: "" }] }),
        bind: (...parameters) => ({ run: async () => { writes.push({ query, parameters }); return { meta: { changes: 1 } }; } }),
    }) } };
    await notifyUnmatchedDonations(env, async () => 999, {
        formatHryvnias: () => "10 грн", sendMessage: async () => {},
    });
    assert.deepEqual(writes[0].parameters, ["tx-1"]);
});

test("an independent manual bonus request is immediately sent to the admin without a payment warning", async () => {
    const writes = [];
    const sent = [];
    const env = { DB: { prepare(query) {
        if (query.includes("FROM donation_requests WHERE status")) {
            return { all: async () => ({ results: [{ id: 7, user_id: 123, request_source: "manual_bonus", matched_transaction_id: null }] }) };
        }
        return { bind: (...parameters) => ({ run: async () => { writes.push({ query, parameters }); return { meta: { changes: 1 } }; } }) };
    } } };

    await notifyPendingDonationRequests(env, async () => 999, {
        donationAccessLevel: () => assert.fail("manual request has no transaction"),
        formatHryvnias: () => "0 грн",
        dailyWordCardLimitForLevel: () => 0,
        sendMessage: async (...args) => sent.push(args),
    });

    assert.match(sent[0][2], /Тип: без донату/);
    assert.match(sent[0][2], /рішення про рівень за адміністратором/);
    assert.doesNotMatch(sent[0][2], /Платіж ще не знайдено/);
    assert.deepEqual(writes[0].parameters, [7]);
});
