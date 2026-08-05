import { DEFAULT_DAILY_SETTINGS, localDateAndTime } from "../../domain/helpers.js";
import { dailyWordKeyboard, dailyWordText, getPendingDailyWord, replacePendingDailyWord, savePendingDailyWord } from "./daily-words.js";
import { editMessage, sendMessage } from "../../platform/telegram.js";

export async function sendTodayDailyWord(env, chatId, userId, dependencies) {
    const user = await env.DB.prepare("SELECT timezone, daily_level FROM users WHERE telegram_user_id = ?").bind(userId).first();
    const localTime = localDateAndTime(user?.timezone ?? DEFAULT_DAILY_SETTINGS.timezone, Date.now());
    if (!localTime) throw new Error("Unable to calculate local date for daily word.");
    const pending = await getPendingDailyWord(env, userId, localTime.date);
    if (pending) {
        await sendNextDailyWord(env, chatId, userId, pending.id, dependencies);
        return;
    }
    if (!(await dependencies.claimDailyWordCard(env, userId, localTime.date, dependencies.access))) {
        const limit = dependencies.dailyWordCardLimitForLevel(await dependencies.getUserAccessLevel(env, userId));
        await sendMessage(env, chatId, `На сьогодні вже показано ${limit} нових карток. Завтра можна буде відкрити ще.`);
        return;
    }
    let pendingId = null;
    try {
        const level = user?.daily_level ?? "B1";
        const card = await dependencies.generateNewDailyWord(env, userId, level, dependencies.generateDailyWordCard, dependencies.maxAttempts);
        pendingId = await savePendingDailyWord(env, userId, card, localTime.date);
        await sendMessage(env, chatId, dailyWordText(card, level), dailyWordKeyboard(pendingId));
    } catch (error) {
        if (pendingId) await env.DB.prepare("DELETE FROM pending_daily_words WHERE id = ? AND user_id = ?").bind(pendingId, userId).run();
        throw error;
    }
}

/** Replaces an already displayed unanswered card with another card for today. */
export async function sendNextDailyWord(env, chatId, userId, pendingId, dependencies, messageId = null) {
    const user = await env.DB.prepare("SELECT timezone, daily_level FROM users WHERE telegram_user_id = ?").bind(userId).first();
    const localTime = localDateAndTime(user?.timezone ?? DEFAULT_DAILY_SETTINGS.timezone, Date.now());
    if (!localTime) throw new Error("Unable to calculate local date for daily word.");
    const pending = await getPendingDailyWord(env, userId, localTime.date);
    if (!pending || pending.id !== pendingId) return false;
    if (!(await dependencies.claimDailyWordCard(env, userId, localTime.date, dependencies.access))) {
        const limit = dependencies.dailyWordCardLimitForLevel(await dependencies.getUserAccessLevel(env, userId));
        await sendMessage(env, chatId, `На сьогодні вже показано ${limit} нових карток. Завтра можна буде відкрити ще.`);
        return true;
    }

    const level = user?.daily_level ?? "B1";
    const card = await dependencies.generateNewDailyWord(env, userId, level, dependencies.generateDailyWordCard, dependencies.maxAttempts);
    if (!(await replacePendingDailyWord(env, userId, pendingId, card, localTime.date))) return false;

    if (messageId) {
        await editMessage(env, chatId, messageId, dailyWordText(card, level), dailyWordKeyboard(pendingId));
    } else {
        await sendMessage(env, chatId, dailyWordText(card, level), dailyWordKeyboard(pendingId));
    }
    return true;
}

export async function sendDueDailyWords(env, scheduledTime, dependencies) {
    const users = await env.DB.prepare(`
      SELECT telegram_user_id, chat_id, timezone, daily_time, daily_level, last_delivery_local_date
      FROM users WHERE is_active = 1 AND daily_enabled = 1
    `).all();
    for (const user of users.results) {
        const localTime = localDateAndTime(user.timezone, scheduledTime);
        if (!localTime || localTime.time !== user.daily_time || user.last_delivery_local_date === localTime.date) continue;
        if (await getPendingDailyWord(env, user.telegram_user_id, localTime.date)) {
            await env.DB.prepare("UPDATE users SET last_delivery_local_date = ? WHERE telegram_user_id = ?").bind(localTime.date, user.telegram_user_id).run();
            continue;
        }
        if (!(await dependencies.claimDailyWordCard(env, user.telegram_user_id, localTime.date, dependencies.access))) continue;
        let claimedDelivery = false;
        let pendingId = null;
        try {
            const card = await dependencies.generateNewDailyWord(env, user.telegram_user_id, user.daily_level, dependencies.generateDailyWordCard, dependencies.maxAttempts);
            const claimed = await env.DB.prepare(`
              UPDATE users SET last_delivery_local_date = ? WHERE telegram_user_id = ?
              AND (last_delivery_local_date IS NULL OR last_delivery_local_date <> ?)
            `).bind(localTime.date, user.telegram_user_id, localTime.date).run();
            if (claimed.meta.changes === 0) continue;
            claimedDelivery = true;
            pendingId = await savePendingDailyWord(env, user.telegram_user_id, card, localTime.date);
            await sendMessage(env, user.chat_id, dailyWordText(card, user.daily_level), dailyWordKeyboard(pendingId));
        } catch (error) {
            console.error({ event: "daily_word_delivery_failed", userId: user.telegram_user_id, message: error instanceof Error ? error.message : "Unknown error" });
            if (claimedDelivery) await env.DB.prepare(`UPDATE users SET last_delivery_local_date = NULL WHERE telegram_user_id = ? AND last_delivery_local_date = ?`).bind(user.telegram_user_id, localTime.date).run();
            if (pendingId) await env.DB.prepare("DELETE FROM pending_daily_words WHERE id = ? AND user_id = ?").bind(pendingId, user.telegram_user_id).run();
        }
    }
}
