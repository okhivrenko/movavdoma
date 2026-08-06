import test from "node:test";
import assert from "node:assert/strict";

import { getUserAccessLevel, grantAccessLevel } from "./access-levels.js";

function accessDb({ permanent = 0, temporary = 0, referral = 0 } = {}) {
    const calls = [];
    return {
        calls,
        prepare(query) {
            return { bind: (...parameters) => ({
                first: async () => {
                    calls.push({ method: "first", query, parameters });
                    if (query.includes("SELECT timezone FROM users")) return { timezone: "Europe/Kyiv" };
                    if (query.includes("user_access_levels")) return { access_level: permanent };
                    if (query.includes("user_temporary_access_grants")) return { access_level: temporary };
                    if (query.includes("referral_rewards")) return referral ? { access_level: referral } : null;
                    throw new Error(`Unexpected query: ${query}`);
                },
                run: async () => {
                    calls.push({ method: "run", query, parameters });
                    return { meta: { changes: 1 } };
                },
            }) };
        },
    };
}

test("effective access uses the highest non-expired stored level and admin bypass", async () => {
    const db = accessDb({ permanent: 1, temporary: 3, referral: 1 });
    const env = { DB: db, ADMIN_TELEGRAM_USER_ID: "999" };

    assert.equal(await getUserAccessLevel(env, 123), 3);
    assert.equal(await getUserAccessLevel(env, 999), 3);
    assert.ok(db.calls.some((call) => call.query.includes("expires_at > CURRENT_TIMESTAMP")));
    assert.ok(db.calls.some((call) => call.query.includes("referral_rewards") && call.parameters.length === 2));
});

test("a referral reward temporarily raises level zero to level one", async () => {
    const db = accessDb({ referral: 1 });
    assert.equal(await getUserAccessLevel({ DB: db, ADMIN_TELEGRAM_USER_ID: "999" }, 123), 1);
});

test("permanent grants cannot lower a user's current level", async () => {
    const db = accessDb({ permanent: 2, temporary: 1 });
    const env = { DB: db, ADMIN_TELEGRAM_USER_ID: "999" };

    assert.deepEqual(await grantAccessLevel(env, 123, 1, "manual"), { changed: false, accessLevel: 2 });
    assert.equal(db.calls.filter((call) => call.method === "run").length, 0);

    assert.deepEqual(await grantAccessLevel(env, 123, 3, "manual"), { changed: true, accessLevel: 3 });
    const write = db.calls.find((call) => call.method === "run");
    assert.deepEqual(write.parameters, [123, 3, null, "manual"]);
    assert.match(write.query, /access_level = MAX\(user_access_levels\.access_level, excluded\.access_level\)/);
});
