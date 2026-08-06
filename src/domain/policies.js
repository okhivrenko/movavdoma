// Stable business rules shared by webhook handlers and scheduled jobs.
// Keep this module free of database and network dependencies so its boundary
// values can be checked quickly with Node's built-in test runner.

export const DAILY_WORD_CARD_LIMITS = Object.freeze([5, 10, 15, 20]);
export const DAILY_WORD_ADDITION_LIMITS = Object.freeze([10, 15, 25, 40]);
export const DONATION_TIER_100_KOPIYKAS = 10_000;
export const DONATION_TIER_200_KOPIYKAS = 20_000;

/** Converts any stored input to one of the four supported access levels. */
export function normalizeAccessLevel(accessLevel) {
    const numericLevel = Number(accessLevel);

    if (!Number.isFinite(numericLevel)) return 0;

    return Math.min(Math.max(Math.trunc(numericLevel), 0), DAILY_WORD_CARD_LIMITS.length - 1);
}

export function donationDailyLimit(amountKopiykas) {
    return dailyWordAdditionLimitForLevel(donationAccessLevel(amountKopiykas));
}

// A matched donation grants a permanent, monotonic daily-card access level.
export function donationAccessLevel(amountKopiykas) {
    if (amountKopiykas > DONATION_TIER_200_KOPIYKAS) return 3;
    if (amountKopiykas >= DONATION_TIER_100_KOPIYKAS) return 2;
    return 1;
}

export function dailyWordCardLimitForLevel(accessLevel) {
    return DAILY_WORD_CARD_LIMITS[normalizeAccessLevel(accessLevel)];
}

export function dailyWordAdditionLimitForLevel(accessLevel) {
    return DAILY_WORD_ADDITION_LIMITS[normalizeAccessLevel(accessLevel)];
}
