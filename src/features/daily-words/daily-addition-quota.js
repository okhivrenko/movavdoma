import { DEFAULT_DAILY_SETTINGS, localDateAndTime } from "../../domain/helpers.js";

// Atomically claims a learning-list slot before a word is generated or saved.
export async function claimDailyWordAddition(env, userId, dependencies) {
    if (dependencies.isAdmin(env, userId)) return true;

    const user = await env.DB
        .prepare("SELECT timezone FROM users WHERE telegram_user_id = ?")
        .bind(userId)
        .first();
    const [limit, accessLevel] = await Promise.all([
        env.DB.prepare("SELECT daily_limit FROM user_daily_limits WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP")
            .bind(userId).first(),
        dependencies.getUserAccessLevel(env, userId),
    ]);
    const localTime = localDateAndTime(user?.timezone ?? DEFAULT_DAILY_SETTINGS.timezone, Date.now());
    if (!localTime) throw new Error("Unable to calculate daily addition date.");

    const claimed = await env.DB.prepare(`
      INSERT INTO daily_word_additions (user_id, local_date, additions)
      VALUES (?, ?, 1)
      ON CONFLICT(user_id, local_date) DO UPDATE
      SET additions = additions + 1
      WHERE additions < ?
    `).bind(userId, localTime.date, Math.max(
        limit?.daily_limit ?? dependencies.dailyAddLimit,
        dependencies.dailyWordAdditionLimitForLevel(accessLevel)
    )).run();

    return claimed.meta.changes > 0;
}

export async function getDailyAdditionLimit(env, userId, dependencies) {
    if (dependencies.isAdmin(env, userId)) return null;

    const [limit, accessLevel] = await Promise.all([
        env.DB.prepare("SELECT daily_limit FROM user_daily_limits WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP")
            .bind(userId).first(),
        dependencies.getUserAccessLevel(env, userId),
    ]);
    return Math.max(
        limit?.daily_limit ?? dependencies.dailyAddLimit,
        dependencies.dailyWordAdditionLimitForLevel(accessLevel)
    );
}
