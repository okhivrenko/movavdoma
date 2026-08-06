import test from "node:test";
import assert from "node:assert/strict";

import { claimDailyWordAddition, getDailyAdditionLimit } from "./daily-addition-quota.js";

test("daily addition quota atomically binds the owner's local day and effective limit", async () => {
    const calls = [];
    const env = { DB: { prepare(query) {
        return { bind: (...parameters) => ({
            first: async () => query.includes("timezone") ? { timezone: "Europe/Warsaw" } : { daily_limit: 12 },
            run: async () => {
                calls.push({ query, parameters });
                return { meta: { changes: 1 } };
            },
        }) };
    } } };

    assert.equal(await claimDailyWordAddition(env, 123, {
        isAdmin: () => false, dailyAddLimit: 10, getUserAccessLevel: async () => 1,
        dailyWordAdditionLimitForLevel: () => 15,
    }), true);
    assert.deepEqual(calls[0].parameters.slice(0, 1), [123]);
    assert.equal(calls[0].parameters.at(-1), 15);
});

test("a level reward raises the addition limit even without a manual bonus", async () => {
    const env = { DB: { prepare(query) {
        return { bind: () => ({
            first: async () => query.includes("timezone") ? { timezone: "Europe/Kyiv" } : null,
            run: async () => ({ meta: { changes: 1 } }),
        }) };
    } } };
    assert.equal(await getDailyAdditionLimit(env, 123, {
        isAdmin: () => false, dailyAddLimit: 10, getUserAccessLevel: async () => 1,
        dailyWordAdditionLimitForLevel: (level) => [10, 15, 25, 40][level],
    }), 15);
});

test("admins have no numeric daily addition limit", async () => {
    const env = { DB: { prepare: () => { throw new Error("D1 should not be queried for admins"); } } };
    assert.equal(await getDailyAdditionLimit(env, 123, { isAdmin: () => true, dailyAddLimit: 10 }), null);
});
