import test from "node:test";
import assert from "node:assert/strict";

import { grantDonationBonus } from "../donation-grants.js";

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
