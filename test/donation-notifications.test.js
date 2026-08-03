import test from "node:test";
import assert from "node:assert/strict";
import { adminDonationKeyboard } from "../src/features/donations/donation-notifications.js";
import { notifyUnmatchedDonations } from "../src/features/donations/donation-notifications.js";

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
