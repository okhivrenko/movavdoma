import { createSupportCode } from "../../domain/helpers.js";
import { sendMessage } from "../../platform/telegram.js";
import { publicRuntimeConfig } from "../../platform/runtime-config.js";

export const DONATION_REQUEST_SOURCE = Object.freeze({
    SUPPORT: "support",
    MANUAL_BONUS: "manual_bonus",
});

/** One open donation request per user, linked to a unique payment-comment code. */
export async function getOpenDonationRequest(env, userId, requestSource = DONATION_REQUEST_SOURCE.SUPPORT) {
    return env.DB.prepare(`
      SELECT id, support_code, status, request_source
      FROM donation_requests
      WHERE user_id = ? AND request_source = ? AND status IN ('awaiting_payment', 'awaiting_review')
      ORDER BY id DESC LIMIT 1
    `).bind(userId, requestSource).first();
}

export async function getOrCreateDonationRequest(env, userId) {
    const existing = await getOpenDonationRequest(env, userId);
    if (existing) return existing;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const supportCode = createSupportCode();
        const inserted = await env.DB.prepare(`
          INSERT OR IGNORE INTO donation_requests (user_id, support_code, request_source) VALUES (?, ?, ?)
        `).bind(userId, supportCode, DONATION_REQUEST_SOURCE.SUPPORT).run();
        if (inserted.meta.changes > 0) {
            return { id: inserted.meta.last_row_id, support_code: supportCode, status: "awaiting_payment", request_source: DONATION_REQUEST_SOURCE.SUPPORT };
        }
    }
    throw new Error("Unable to generate a unique donation code.");
}

async function getOrCreateManualBonusRequest(env, userId) {
    const existing = await getOpenDonationRequest(env, userId, DONATION_REQUEST_SOURCE.MANUAL_BONUS);
    if (existing) return existing;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const supportCode = createSupportCode();
        const inserted = await env.DB.prepare(`
          INSERT OR IGNORE INTO donation_requests (user_id, support_code, request_source, status, requested_at)
          VALUES (?, ?, ?, 'awaiting_review', CURRENT_TIMESTAMP)
        `).bind(userId, supportCode, DONATION_REQUEST_SOURCE.MANUAL_BONUS).run();
        if (inserted.meta.changes > 0) {
            return { id: inserted.meta.last_row_id, support_code: supportCode, status: "awaiting_review", request_source: DONATION_REQUEST_SOURCE.MANUAL_BONUS };
        }
    }
    throw new Error("Unable to create a manual bonus request.");
}

function supportKeyboard(env) {
    const { monobankJarSendId } = publicRuntimeConfig(env);
    return { inline_keyboard: [[{ text: "☕ Відкрити банку", url: `https://send.monobank.ua/jar/${encodeURIComponent(monobankJarSendId)}` }]] };
}

export async function sendDonationInstructions(env, chatId, userId) {
    const request = await getOrCreateDonationRequest(env, userId);
    await sendMessage(env, chatId,
        `Дякую за підтримку! Відкрий банку й, будь ласка, додай цей код у коментар до платежу:\n\n${request.support_code}\n\nПісля переказу натисни «🎁 Отримати бонус». Код допоможе мені точно знайти твій донат.`,
        supportKeyboard(env));
}

/** Submits either a payment-linked or independent manual request for admin review. */
export async function submitDonationBonusRequest(env, chatId, userId, notifyPendingDonationRequests) {
    const supportRequest = await getOpenDonationRequest(env, userId);
    const request = supportRequest ?? await getOrCreateManualBonusRequest(env, userId);

    if (request.request_source === DONATION_REQUEST_SOURCE.SUPPORT && request.status === "awaiting_payment") {
        await env.DB
            .prepare(`
              UPDATE donation_requests
              SET status = 'awaiting_review', requested_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `)
            .bind(request.id)
            .run();
    }

    await sendMessage(
        env,
        chatId,
        request.request_source === DONATION_REQUEST_SOURCE.SUPPORT
            ? "🎁 Заявку на бонус прийнято! Адмін перевірить платіж і розгляне рівень доступу."
            : "🎁 Заявку на бонус надіслано адміну. Ми ще розвиваємо бот, тому адмін індивідуально розгляне рівень доступу."
    );

    await notifyPendingDonationRequests(env);
}
