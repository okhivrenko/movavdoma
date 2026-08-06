import { DEFAULT_DAILY_SETTINGS, localDateAndTime } from "../../domain/helpers.js";

const REFERRAL_SHARE_TEXT = "Я вчу англійські слова з MovaYakVDoma — спробуй і ти!";

/** Returns the personal, shareable Telegram deep link for an existing user. */
export async function referralInvitation(env, userId, dependencies) {
    const botLink = await dependencies.getBotLink(env);
    const referralLink = `${botLink}?start=ref_${userId}`;
    const shareLink = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(REFERRAL_SHARE_TEXT)}`;
    return {
        text: `🎁 Запроси друга за посиланням нижче. Коли новий користувач запустить бота за ним, ти отримаєш рівень 1 до кінця свого дня — до 10 нових щоденних карток.\n\n${referralLink}`,
        replyMarkup: { inline_keyboard: [[{ text: "Запросити друга", url: shareLink }]] },
    };
}

/**
 * Records one first-start referral and makes level 1 effective for the
 * referrer's current local date. The unique referred user ID prevents repeats.
 */
export async function rewardReferralFromNewUser(env, referrerUserId, referredUserId, now = Date.now()) {
    if (referrerUserId === referredUserId) return false;

    const referrer = await env.DB.prepare("SELECT timezone FROM users WHERE telegram_user_id = ?")
        .bind(referrerUserId).first();
    if (!referrer) return false;

    const localTime = localDateAndTime(referrer.timezone ?? DEFAULT_DAILY_SETTINGS.timezone, now);
    if (!localTime) throw new Error("Unable to calculate referral reward date.");

    const result = await env.DB.prepare(`
      INSERT OR IGNORE INTO referral_rewards (referrer_user_id, referred_user_id, local_date)
      VALUES (?, ?, ?)
    `).bind(referrerUserId, referredUserId, localTime.date).run();
    return result.meta.changes > 0;
}
