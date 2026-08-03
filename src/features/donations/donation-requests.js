import { createSupportCode } from "../../domain/helpers.js";
import { sendMessage } from "../../platform/telegram.js";

export const MONOBANK_JAR_URL = "https://send.monobank.ua/jar/9vp8W5V9nQ";

/** One open donation request per user, linked to a unique payment-comment code. */
export async function getOpenDonationRequest(env, userId) {
    return env.DB.prepare(`
      SELECT id, support_code, status
      FROM donation_requests
      WHERE user_id = ? AND status IN ('awaiting_payment', 'awaiting_review')
      ORDER BY id DESC LIMIT 1
    `).bind(userId).first();
}

export async function getOrCreateDonationRequest(env, userId) {
    const existing = await getOpenDonationRequest(env, userId);
    if (existing) return existing;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const supportCode = createSupportCode();
        const inserted = await env.DB.prepare(`
          INSERT OR IGNORE INTO donation_requests (user_id, support_code) VALUES (?, ?)
        `).bind(userId, supportCode).run();
        if (inserted.meta.changes > 0) {
            return { id: inserted.meta.last_row_id, support_code: supportCode, status: "awaiting_payment" };
        }
    }
    throw new Error("Unable to generate a unique donation code.");
}

function supportKeyboard() {
    return { inline_keyboard: [[{ text: "☕ Відкрити банку", url: MONOBANK_JAR_URL }]] };
}

export async function sendDonationInstructions(env, chatId, userId) {
    const request = await getOrCreateDonationRequest(env, userId);
    await sendMessage(env, chatId,
        `Дякую за підтримку! Відкрий банку й, будь ласка, додай цей код у коментар до платежу:\n\n${request.support_code}\n\nПісля переказу натисни «🎁 Отримати бонус». Код допоможе мені точно знайти твій донат.`,
        supportKeyboard());
}

/** Marks an existing payment request for review and alerts the administrator. */
export async function submitDonationBonusRequest(env, chatId, userId, notifyPendingDonationRequests) {
    const request = await getOpenDonationRequest(env, userId);

    if (!request) {
        await sendMessage(
            env,
            chatId,
            "Спершу натисни «☕ Підтримати бот»: я дам код, який треба додати в коментар до платежу."
        );
        return;
    }

    if (request.status === "awaiting_payment") {
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
        "🎁 Заявку на бонус прийнято! Ми постараємося підготувати для тебе щось цікаве найближчим часом."
    );

    await notifyPendingDonationRequests(env);
}
