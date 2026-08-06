import test from "node:test";
import assert from "node:assert/strict";

import {
    dailyWordCardLimitForLevel,
    dailyWordAdditionLimitForLevel,
    donationAccessLevel,
    donationDailyLimit,
    normalizeAccessLevel,
} from "./policies.js";

test("daily-card limits map exactly to access levels", () => {
    assert.deepEqual(
        [0, 1, 2, 3].map(dailyWordCardLimitForLevel),
        [5, 10, 15, 20]
    );
});

test("word-addition limits map exactly to the same access levels", () => {
    assert.deepEqual(
        [0, 1, 2, 3].map(dailyWordAdditionLimitForLevel),
        [10, 15, 25, 40]
    );
});

test("access levels are always stored in the supported integer range", () => {
    assert.equal(normalizeAccessLevel(-1), 0);
    assert.equal(normalizeAccessLevel("2.9"), 2);
    assert.equal(normalizeAccessLevel(99), 3);
    assert.equal(normalizeAccessLevel("invalid"), 0);
    assert.equal(dailyWordCardLimitForLevel(1.5), 10);
    assert.equal(dailyWordAdditionLimitForLevel(1.5), 15);
});

test("donation boundaries retain the announced tier behavior", () => {
    assert.equal(donationDailyLimit(9_999), 15);
    assert.equal(donationDailyLimit(10_000), 25);
    assert.equal(donationDailyLimit(20_000), 25);
    assert.equal(donationDailyLimit(20_001), 40);

    assert.equal(donationAccessLevel(1), 1);
    assert.equal(donationAccessLevel(10_000), 2);
    assert.equal(donationAccessLevel(20_000), 2);
    assert.equal(donationAccessLevel(20_001), 3);
});
