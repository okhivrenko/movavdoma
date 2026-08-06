const REFERRAL_START_PATTERN = /^\/start\s+ref_(\d{1,20})$/i;

/** Extracts a bounded Telegram user ID from this bot's referral deep link. */
export function referralUserIdFromStartCommand(text) {
    const match = REFERRAL_START_PATTERN.exec(String(text).trim());
    if (!match) return null;

    const userId = Number(match[1]);
    return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}
