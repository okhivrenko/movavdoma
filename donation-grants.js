import { dailyWordCardLimitForLevel } from "./policies.js";
import { sendMessage } from "./telegram.js";

/** Idempotently approves one admin-reviewed donation and grants one month. */
export async function grantDonationBonus(env, requestId, accessLevel, grantTemporaryAccessLevel) {
    const request = await env.DB.prepare(`
      SELECT id, user_id, status, matched_transaction_id FROM donation_requests WHERE id = ?
    `).bind(requestId).first();
    if (!request || request.status !== "awaiting_review") return null;

    const granted = await env.DB.prepare(`
      UPDATE donation_requests
      SET status = 'granted', granted_daily_limit = NULL, granted_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'awaiting_review'
    `).bind(request.id).run();
    if (granted.meta.changes === 0) return null;

    const access = await grantTemporaryAccessLevel(env, request.user_id, accessLevel, "donation", "+1 month", request.id);
    const user = await env.DB.prepare("SELECT chat_id FROM users WHERE telegram_user_id = ?")
        .bind(request.user_id).first();
    if (user?.chat_id) {
        await sendMessage(env, user.chat_id,
            `🎁 Дякуємо за підтримку! Твій рівень доступу: ${access.accessLevel}. Наступний місяць можна відкривати до ${dailyWordCardLimitForLevel(access.accessLevel)} нових щоденних карток на день.`);
    }
    return { request, access };
}
