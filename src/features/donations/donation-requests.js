import { createSupportCode } from "../../domain/helpers.js";
import { answerCallbackQuery, sendMessage } from "../../platform/telegram.js";
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
    return { inline_keyboard: [
        [{ text: "☕ Відкрити банку", url: `https://send.monobank.ua/jar/${encodeURIComponent(monobankJarSendId)}` }],
        [{ text: "🎁 Отримати бонус після донату", callback_data: "support:bonus" }],
    ] };
}

export async function sendDonationInstructions(env, chatId, userId) {
    const request = await getOrCreateDonationRequest(env, userId);
    await sendMessage(env, chatId,
        `Дякую за підтримку! Відкрий банку й, будь ласка, додай цей код у коментар до платежу:\n\n${request.support_code}\n\nПісля переказу натисни «🎁 Отримати бонус після донату» нижче. Код допоможе мені точно знайти твій донат.`,
        supportKeyboard(env));
}

async function submitSupportBonusRequest(env, chatId, userId, notifyPendingDonationRequests) {
    const request = await getOpenDonationRequest(env, userId);
    if (!request) {
        await sendMessage(env, chatId, "Спершу натисни «☕ Підтримати бот», щоб отримати код для коментаря до платежу.");
        return;
    }

    if (request.status === "awaiting_payment") {
        await env.DB
            .prepare(`
              UPDATE donation_requests
              SET status = 'awaiting_review', requested_at = CURRENT_TIMESTAMP
              WHERE id = ? AND request_source = ? AND status = 'awaiting_payment'
            `)
            .bind(request.id, DONATION_REQUEST_SOURCE.SUPPORT)
            .run();
    }

    await sendMessage(env, chatId, "🎁 Заявку на бонус прийнято! Адмін перевірить платіж і розгляне рівень доступу.");
    await notifyPendingDonationRequests(env);
}

/** Creates an independent manual request for admin review, without a donation. */
export async function submitDonationBonusRequest(env, chatId, userId, notifyPendingDonationRequests) {
    await getOrCreateManualBonusRequest(env, userId);
    await sendMessage(
        env,
        chatId,
        "🎁 Заявку на бонус надіслано адміну. Ми ще розвиваємо бот, тому адмін індивідуально розгляне рівень доступу."
    );

    await notifyPendingDonationRequests(env);
}

/** Handles only the payment-linked bonus button shown with a support request. */
export async function handleDonationSupportBonusCallback(env, callback, context, dependencies) {
    if (!callback.data.startsWith("support:")) return false;
    if (callback.data !== "support:bonus") {
        await answerCallbackQuery(env, callback.id, "Невірний вибір.");
        return true;
    }

    try {
        await answerCallbackQuery(env, callback.id, "Перевіряю заявку…");
        await submitSupportBonusRequest(env, context.chatId, context.userId, dependencies.notifyPendingDonationRequests);
    } catch (error) {
        console.error({ event: "support_bonus_request_failed", message: error instanceof Error ? error.message : "Unknown error" });
        await sendMessage(env, context.chatId, "Не вдалося надіслати заявку. Спробуй ще раз за хвилину.");
    }
    return true;
}
