import { sendMessage } from "../../platform/telegram.js";

async function findUserChat(env, userId) {
    return env.DB
        .prepare("SELECT chat_id FROM users WHERE telegram_user_id = ?")
        .bind(userId)
        .first();
}

/** Admin-only upgrade. Permanent levels are intentionally monotonic. */
export async function grantManualAccessLevel(env, userId, accessLevel, dependencies) {
    const user = await findUserChat(env, userId);
    if (!user?.chat_id) return null;

    const access = await dependencies.grantAccessLevel(env, userId, accessLevel, "manual");
    if (access.changed) {
        const dailyAdditionLimit = await dependencies.getDailyAdditionLimit(env, userId);
        await sendMessage(env, user.chat_id, dependencies.adminSettingsUpdated(
            dailyAdditionLimit ?? dependencies.dailyAddLimit,
            dependencies.dailyWordCardLimitForLevel(access.accessLevel)
        ));
    }
    return access;
}

export async function grantManualDailyLimit(env, userId, dailyLimit, dependencies) {
    const user = await findUserChat(env, userId);
    if (!user?.chat_id) return false;

    await env.DB.prepare(`
      INSERT INTO user_daily_limits (user_id, daily_limit, donation_request_id, expires_at)
      VALUES (?, ?, NULL, datetime('now', '+1 month'))
      ON CONFLICT(user_id) DO UPDATE SET
        daily_limit = excluded.daily_limit,
        donation_request_id = NULL,
        expires_at = excluded.expires_at,
        granted_at = CURRENT_TIMESTAMP
    `).bind(userId, dailyLimit).run();

    const accessLevel = await dependencies.getUserAccessLevel(env, userId);
    await sendMessage(env, user.chat_id, dependencies.adminSettingsUpdated(
        dailyLimit,
        dependencies.dailyWordCardLimitForLevel(accessLevel)
    ));
    return true;
}

export async function grantTestLevelOne(env, userId, dependencies) {
    const user = await findUserChat(env, userId);
    if (!user?.chat_id) return null;

    const access = await dependencies.grantTemporaryAccessLevel(env, userId, 1, "admin_test", "+1 day");
    const dailyAdditionLimit = await dependencies.getDailyAdditionLimit(env, userId);
    await sendMessage(env, user.chat_id, dependencies.adminSettingsUpdated(
        dailyAdditionLimit ?? dependencies.dailyAddLimit,
        dependencies.dailyWordCardLimitForLevel(access.accessLevel)
    ));
    return access;
}
