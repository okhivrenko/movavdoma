import { isAdmin } from "../../domain/helpers.js";
import { normalizeAccessLevel } from "../../domain/policies.js";

/** D1 access-level reads and monotonic grants, isolated from donation routing. */
export async function getAdminChatId(env) {
    if (!env.ADMIN_TELEGRAM_USER_ID) return null;
    const admin = await env.DB.prepare("SELECT chat_id FROM users WHERE telegram_user_id = ?")
        .bind(env.ADMIN_TELEGRAM_USER_ID).first();
    return admin?.chat_id ?? null;
}

export async function getUserAccessLevel(env, userId) {
    if (isAdmin(env, userId)) return 3;
    const [permanent, temporary] = await Promise.all([
        env.DB.prepare("SELECT access_level FROM user_access_levels WHERE user_id = ?").bind(userId).first(),
        env.DB.prepare("SELECT MAX(access_level) AS access_level FROM user_temporary_access_grants WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP").bind(userId).first(),
    ]);
    return Math.max(normalizeAccessLevel(permanent?.access_level), normalizeAccessLevel(temporary?.access_level));
}

/** Permanent access only moves upwards and never overwrites a higher level. */
export async function grantAccessLevel(env, userId, accessLevel, source, donationRequestId = null) {
    const level = normalizeAccessLevel(accessLevel);
    const previousLevel = await getUserAccessLevel(env, userId);
    if (level <= previousLevel && !isAdmin(env, userId)) return { changed: false, accessLevel: previousLevel };

    await env.DB.prepare(`
      INSERT INTO user_access_levels (user_id, access_level, donation_request_id, source)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        access_level = MAX(user_access_levels.access_level, excluded.access_level),
        donation_request_id = excluded.donation_request_id,
        source = excluded.source,
        updated_at = CURRENT_TIMESTAMP
    `).bind(userId, level, donationRequestId, source).run();
    return { changed: level > previousLevel, accessLevel: Math.max(level, previousLevel) };
}

/** Temporary grants are additive records and never change a permanent level. */
export async function grantTemporaryAccessLevel(env, userId, accessLevel, source, duration, donationRequestId = null) {
    const previousLevel = await getUserAccessLevel(env, userId);
    await env.DB.prepare(`
      INSERT INTO user_temporary_access_grants (user_id, access_level, donation_request_id, source, expires_at)
      VALUES (?, ?, ?, ?, datetime('now', ?))
    `).bind(userId, normalizeAccessLevel(accessLevel), donationRequestId, source, duration).run();
    const currentLevel = await getUserAccessLevel(env, userId);
    return { changed: currentLevel > previousLevel, accessLevel: currentLevel };
}
