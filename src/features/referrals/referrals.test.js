import test from "node:test";
import assert from "node:assert/strict";

import { referralInvitation, rewardReferralFromNewUser } from "./referrals.js";

test("a referral invitation contains only the user's bounded Telegram deep link", async () => {
    const invitation = await referralInvitation({}, 123, { getBotLink: async () => "https://t.me/MovaVDomaBot" });
    assert.match(invitation.text, /https:\/\/t\.me\/MovaVDomaBot\?start=ref_123/);
    assert.match(invitation.replyMarkup.inline_keyboard[0][0].url, /url=https%3A%2F%2Ft\.me%2FMovaVDomaBot%3Fstart%3Dref_123/);
});

test("a new referral is stored against the referrer's local date exactly once", async () => {
    const calls = [];
    const env = { DB: { prepare(query) {
        return { bind: (...parameters) => ({
            first: async () => ({ timezone: "Europe/Kyiv" }),
            run: async () => { calls.push({ query, parameters }); return { meta: { changes: 1 } }; },
        }) };
    } } };

    assert.equal(await rewardReferralFromNewUser(env, 11, 22, Date.UTC(2026, 7, 6, 12)), true);
    assert.deepEqual(calls[0].parameters, [11, 22, "2026-08-06"]);
    assert.match(calls[0].query, /INSERT OR IGNORE INTO referral_rewards/);
    assert.equal(await rewardReferralFromNewUser(env, 22, 22), false);
});
