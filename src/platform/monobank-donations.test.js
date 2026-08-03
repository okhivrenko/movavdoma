import test from "node:test";
import assert from "node:assert/strict";

import {
    MONOBANK_STATEMENT_OVERLAP_SECONDS,
    createMonobankDonationSync,
    isEligibleMonobankTransaction,
    monobankStatementStartTime,
} from "./monobank-donations.js";

test("Monobank synchronization accepts only positive hryvnia credits with an ID", () => {
    assert.equal(isEligibleMonobankTransaction({ id: "tx-1", amount: 1, currencyCode: 980 }), true);
    assert.equal(isEligibleMonobankTransaction({ id: "tx-1", amount: 0, currencyCode: 980 }), false);
    assert.equal(isEligibleMonobankTransaction({ id: "tx-1", amount: 1.5, currencyCode: 980 }), false);
    assert.equal(isEligibleMonobankTransaction({ id: "tx-1", amount: 1, currencyCode: 840 }), false);
    assert.equal(isEligibleMonobankTransaction({ amount: 1, currencyCode: 980 }), false);
});

test("Monobank statement window overlaps the last sync but remains within the API lookback", () => {
    const now = 3_000_000;
    assert.equal(
        monobankStatementStartTime(now - 120, now),
        now - 120 - MONOBANK_STATEMENT_OVERLAP_SECONDS
    );
    assert.equal(monobankStatementStartTime(1, now), now - 2_682_000);
    assert.equal(monobankStatementStartTime(0, now), now - MONOBANK_STATEMENT_OVERLAP_SECONDS);
});

test("Monobank synchronization is a no-op when the token is not configured", async () => {
    const sync = createMonobankDonationSync({
        jarSendId: "public-jar",
        notifyPendingDonationRequests: async () => assert.fail("should not notify"),
        notifyUnmatchedDonations: async () => assert.fail("should not notify"),
    });

    await sync({ DB: { prepare: () => assert.fail("should not query D1") } }, Date.now());
});
