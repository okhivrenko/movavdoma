import { localDateAndTime } from "./helpers.js";

// Atomically claims a learning-list slot before a word is generated or saved.
export async function claimDailyWordAddition(env, userId, dependencies) {
    if (dependencies.isAdmin(env, userId)) return true;

    const user = await env.DB
        .prepare("SELECT timezone FROM users WHERE telegram_user_id = ?")
        .bind(userId)
        .first();
    const limit = await env.DB
        .prepare("SELECT daily_limit FROM user_daily_limits WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP")
        .bind(userId)
        .first();
    const localTime = localDateAndTime(user?.timezone ?? "Europe/Warsaw", Date.now());
    if (!localTime) throw new Error("Unable to calculate daily addition date.");

    const claimed = await env.DB.prepare(`
      INSERT INTO daily_word_additions (user_id, local_date, additions)
      VALUES (?, ?, 1)
      ON CONFLICT(user_id, local_date) DO UPDATE
      SET additions = additions + 1
      WHERE additions < ?
    `).bind(userId, localTime.date, limit?.daily_limit ?? dependencies.dailyAddLimit).run();

    return claimed.meta.changes > 0;
}

export async function getDailyAdditionLimit(env, userId, dependencies) {
    if (dependencies.isAdmin(env, userId)) return null;

    const limit = await env.DB
        .prepare("SELECT daily_limit FROM user_daily_limits WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP")
        .bind(userId)
        .first();
    return limit?.daily_limit ?? dependencies.dailyAddLimit;
}
