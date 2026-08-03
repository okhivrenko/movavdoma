import { localDateAndTime } from "./helpers.js";
import { dailyWordKeyboard, dailyWordText, getPendingDailyWord, savePendingDailyWord } from "./daily-words.js";
import { sendMessage } from "./telegram.js";

export async function sendTodayDailyWord(env, chatId, userId, dependencies) {
    const user = await env.DB.prepare("SELECT timezone, daily_level FROM users WHERE telegram_user_id = ?").bind(userId).first();
    const localTime = localDateAndTime(user?.timezone ?? "Europe/Warsaw", Date.now());
    if (!localTime) throw new Error("Unable to calculate local date for daily word.");
    const pending = await getPendingDailyWord(env, userId, localTime.date);
    if (pending) {
        await sendMessage(env, chatId, dailyWordText(pending.card, user?.daily_level ?? "B1"), dailyWordKeyboard(pending.id));
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
