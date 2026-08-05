import { DEFAULT_DAILY_SETTINGS, localDateAndTime } from "../../domain/helpers.js";
import { dailyWordKeyboard, dailyWordText, getDailyWordNavigation, getPendingDailyWord, hasPreviousDailyWord, savePendingDailyWord } from "./daily-words.js";
import { editMessage, sendMessage, sendTypingAction } from "../../platform/telegram.js";

export async function sendTodayDailyWord(env, chatId, userId, dependencies) {
    const user = await env.DB.prepare(`
      SELECT timezone, daily_level,
        (last_daily_word_menu_opened_at IS NULL
          OR last_daily_word_menu_opened_at <= datetime('now', '-12 hours')) AS should_refresh_daily_word
      FROM users WHERE telegram_user_id = ?
    `).bind(userId).first();
    const localTime = localDateAndTime(user?.timezone ?? DEFAULT_DAILY_SETTINGS.timezone, Date.now());
    if (!localTime) throw new Error("Unable to calculate local date for daily word.");
    const pending = await getPendingDailyWord(env, userId, localTime.date);
    if (pending) {
        if (user?.should_refresh_daily_word === 0) {
            await sendDailyWordCard(env, chatId, userId, pending, user?.daily_level ?? "B1");
        } else {
            await sendNextDailyWord(env, chatId, userId, pending.id, dependencies);
        }
        await markDailyWordMenuOpened(env, userId);
        return;
    }
    if (!(await dependencies.claimDailyWordCard(env, userId, localTime.date, dependencies.access))) {
        const limit = dependencies.dailyWordCardLimitForLevel(await dependencies.getUserAccessLevel(env, userId));
        await sendMessage(env, chatId, `На сьогодні вже показано ${limit} нових карток. Завтра можна буде відкрити ще.`);
        return;
    }
    let pendingId = null;
    try {
        console.debug({ event: "daily_word_generation_started", trigger: "menu" });
        await sendTypingAction(env, chatId).catch(() => undefined);
        const level = user?.daily_level ?? "B1";
        const card = await dependencies.generateNewDailyWord(env, userId, level, dependencies.generateDailyWordCard, dependencies.maxAttempts);
        pendingId = await savePendingDailyWord(env, userId, card, localTime.date);
        await sendDailyWordCard(env, chatId, userId, { id: pendingId, card, localDate: localTime.date }, level);
        await markDailyWordMenuOpened(env, userId);
        console.debug({ event: "daily_word_generation_completed", trigger: "menu" });
    } catch (error) {
        if (pendingId) await env.DB.prepare("DELETE FROM daily_word_cards WHERE id = ? AND user_id = ?").bind(pendingId, userId).run();
        throw error;
    }
}

async function markDailyWordMenuOpened(env, userId) {
    await env.DB.prepare(`
      UPDATE users SET last_daily_word_menu_opened_at = CURRENT_TIMESTAMP
      WHERE telegram_user_id = ?
    `).bind(userId).run();
}

/** Replaces an already displayed unanswered card with another card for today. */
export async function sendNextDailyWord(env, chatId, userId, pendingId, dependencies, messageId = null) {
    const user = await env.DB.prepare("SELECT timezone, daily_level FROM users WHERE telegram_user_id = ?").bind(userId).first();
    const localTime = localDateAndTime(user?.timezone ?? DEFAULT_DAILY_SETTINGS.timezone, Date.now());
    if (!localTime) throw new Error("Unable to calculate local date for daily word.");
    const current = await env.DB.prepare(`
      SELECT id, source_text, translation_uk, context_note, examples_json, learned_at
      FROM daily_word_cards d
      WHERE id = ? AND user_id = ? AND local_date = ?
    `).bind(pendingId, userId, localTime.date).first();
    if (!current) return false;
    const next = await getDailyWordNavigation(env, userId, pendingId, localTime.date, "next");
    if (next) {
        await sendDailyWordCard(env, chatId, userId, next, user?.daily_level ?? "B1", messageId);
        return true;
    }
    if (!(await dependencies.claimDailyWordCard(env, userId, localTime.date, dependencies.access))) {
        const limit = dependencies.dailyWordCardLimitForLevel(await dependencies.getUserAccessLevel(env, userId));
        await sendMessage(env, chatId, `На сьогодні вже показано ${limit} нових карток. Завтра можна буде відкрити ще.`);
        return true;
    }

    const level = user?.daily_level ?? "B1";
    console.debug({ event: "daily_word_generation_started", trigger: "next" });
    await sendTypingAction(env, chatId).catch(() => undefined);
    const card = await dependencies.generateNewDailyWord(env, userId, level, dependencies.generateDailyWordCard, dependencies.maxAttempts);
    const newId = await savePendingDailyWord(env, userId, card, localTime.date);
    await sendDailyWordCard(env, chatId, userId, { id: newId, card, localDate: localTime.date }, level, messageId);
    console.debug({ event: "daily_word_generation_completed", trigger: "next" });
    return true;
}

export async function sendPreviousDailyWord(env, chatId, userId, cardId, messageId) {
    const user = await env.DB.prepare("SELECT timezone, daily_level FROM users WHERE telegram_user_id = ?").bind(userId).first();
    const localTime = localDateAndTime(user?.timezone ?? DEFAULT_DAILY_SETTINGS.timezone, Date.now());
    if (!localTime) throw new Error("Unable to calculate local date for daily word.");
    const previous = await getDailyWordNavigation(env, userId, cardId, localTime.date, "previous");
    if (!previous) return false;
    await sendDailyWordCard(env, chatId, userId, previous, user?.daily_level ?? "B1", messageId);
    return true;
}

async function sendDailyWordCard(env, chatId, userId, dailyWord, level, messageId = null) {
    const hasPrevious = await hasPreviousDailyWord(env, userId, dailyWord.id, dailyWord.localDate);
    const keyboard = dailyWordKeyboard(dailyWord.id, { hasPrevious, canLearn: !dailyWord.learnedAt });
    if (messageId) await editMessage(env, chatId, messageId, dailyWordText(dailyWord.card, level), keyboard);
    else await sendMessage(env, chatId, dailyWordText(dailyWord.card, level), keyboard);
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
            await sendDailyWordCard(env, user.chat_id, user.telegram_user_id, { id: pendingId, card, localDate: localTime.date }, user.daily_level);
        } catch (error) {
            console.error({ event: "daily_word_delivery_failed", userId: user.telegram_user_id, message: error instanceof Error ? error.message : "Unknown error" });
            if (claimedDelivery) await env.DB.prepare(`UPDATE users SET last_delivery_local_date = NULL WHERE telegram_user_id = ? AND last_delivery_local_date = ?`).bind(user.telegram_user_id, localTime.date).run();
            if (pendingId) await env.DB.prepare("DELETE FROM daily_word_cards WHERE id = ? AND user_id = ?").bind(pendingId, user.telegram_user_id).run();
        }
    }
}
