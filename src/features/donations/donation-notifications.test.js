import test from "node:test";
import assert from "node:assert/strict";
import {
    adminDonationKeyboard,
    notifyPendingDonationReminder,
    notifyPendingDonationRequests,
    notifyUnmatchedDonations,
} from "./donation-notifications.js";

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

test("pending bonus monitor stays silent when there are no active requests", async () => {
    const env = { DB: { prepare: () => ({ first: async () => ({ pending_count: 0 }) }) } };

    const sent = await notifyPendingDonationReminder(
        env,
        async () => assert.fail("admin chat should not be resolved without pending requests"),
        { sendMessage: async () => assert.fail("an empty monitor must not notify the admin") }
    );

    assert.equal(sent, false);
});

test("pending bonus monitor sends one summary when requests await review", async () => {
    const messages = [];
    const env = { DB: { prepare: () => ({ first: async () => ({ pending_count: 2 }) }) } };

    const sent = await notifyPendingDonationReminder(env, async () => 999, {
        sendMessage: async (...args) => messages.push(args),
    });

    assert.equal(sent, true);
    assert.equal(messages.length, 1);
    assert.equal(messages[0][1], 999);
    assert.match(messages[0][2], /заявок на бонус без рішення — 2/);
});
