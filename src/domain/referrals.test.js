import test from "node:test";
import assert from "node:assert/strict";

import { referralUserIdFromStartCommand } from "./referrals.js";

test("referral start payloads accept only a bounded numeric owner ID", () => {
    assert.equal(referralUserIdFromStartCommand("/start ref_123456"), 123456);
    assert.equal(referralUserIdFromStartCommand(" /START REF_42 "), 42);
    assert.equal(referralUserIdFromStartCommand("/start ig_bio"), null);
    assert.equal(referralUserIdFromStartCommand("/start ref_123 extra"), null);
    assert.equal(referralUserIdFromStartCommand("/start ref_0"), null);
    assert.equal(referralUserIdFromStartCommand("/start ref_123<script>"), null);
});
