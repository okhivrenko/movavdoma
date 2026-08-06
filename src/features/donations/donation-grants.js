import { dailyWordCardLimitForLevel } from "../../domain/policies.js";
import { sendMessage } from "../../platform/telegram.js";

/** Idempotently approves one admin-reviewed bonus request and grants one month. */
export async function grantDonationBonus(env, requestId, accessLevel, grantTemporaryAccessLevel) {
    const request = await env.DB.prepare(`
      SELECT id, user_id, status, matched_transaction_id, request_source FROM donation_requests WHERE id = ?
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
            `${request.request_source === "support" ? "🎁 Дякуємо за підтримку!" : "🎁 Твою заявку на бонус підтверджено!"} Твій рівень доступу: ${access.accessLevel}. Наступний місяць можна відкривати до ${dailyWordCardLimitForLevel(access.accessLevel)} нових щоденних карток на день.`);
    }
    return { request, access };
}

export async function rejectDonationBonus(env, requestId) {
    const request = await env.DB.prepare("SELECT id, user_id, status, request_source FROM donation_requests WHERE id = ?").bind(requestId).first();
    if (!request || request.status !== "awaiting_review") return null;
    const rejected = await env.DB.prepare("UPDATE donation_requests SET status = 'rejected' WHERE id = ? AND status = 'awaiting_review'").bind(request.id).run();
    if (rejected.meta.changes === 0) return null;
    const user = await env.DB.prepare("SELECT chat_id FROM users WHERE telegram_user_id = ?").bind(request.user_id).first();
    if (user?.chat_id) await sendMessage(env, user.chat_id, request.request_source === "support"
        ? "Не вдалося підтвердити донат для бонусу. Натисни «☕ Підтримати бот», отримай новий код і додай його в коментар платежу."
        : "Адмін не підтвердив заявку на бонус цього разу. Спробуй ще раз пізніше.");
    return request;
}

/** Notifies users once their donation-funded temporary access has expired. */
export async function notifyExpiredDonationAccessGrants(env, mainKeyboardForUser) {
    const expired = await env.DB
        .prepare(`
          SELECT g.id, g.user_id, u.chat_id
          FROM user_temporary_access_grants g
          JOIN users u ON u.telegram_user_id = g.user_id
          WHERE g.source = 'donation'
            AND g.expires_at <= CURRENT_TIMESTAMP
            AND g.expired_notified_at IS NULL
          ORDER BY g.id ASC
        `)
        .all();

    for (const grant of expired.results) {
        const claimed = await env.DB
            .prepare(`
              UPDATE user_temporary_access_grants
              SET expired_notified_at = CURRENT_TIMESTAMP
              WHERE id = ? AND expired_notified_at IS NULL
            `)
            .bind(grant.id)
            .run();

        if (claimed.meta.changes === 0) continue;

        try {
            await sendMessage(
                env,
                grant.chat_id,
                "🎁 Дякуємо, що користуєшся ботом! На жаль, твій бонусний період завершився.\n\nБудемо вдячні за подальшу підтримку: навіть одна кавуська мотивує нас робити бот кращим.\n\nЯкщо маєш зауваження, ідеї або просто хочеш поділитися враженням — натисни «➡️ Далі», а потім «💬 Відгук». Це допомагає нам ставати кращими.",
                await mainKeyboardForUser(env, grant.user_id)
            );
        } catch (error) {
            await env.DB
                .prepare("UPDATE user_temporary_access_grants SET expired_notified_at = NULL WHERE id = ?")
                .bind(grant.id)
                .run();
            throw error;
        }
    }
}
