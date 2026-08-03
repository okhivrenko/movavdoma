import { messages } from "../../domain/messages.js";
import { sendMessage } from "../../platform/telegram.js";

/** The explicit feedback flow: one pending plain-text message per user. */
export async function startFeedback(env, chatId, userId, prompt = messages.feedbackPrompt) {
    await env.DB.prepare("UPDATE users SET feedback_pending = 1 WHERE telegram_user_id = ?")
        .bind(userId).run();
    await sendMessage(env, chatId, prompt);
}

export async function clearPendingFeedback(env, userId) {
    await env.DB.prepare("UPDATE users SET feedback_pending = 0 WHERE telegram_user_id = ? AND feedback_pending = 1")
        .bind(userId).run();
}

export async function submitFeedback(env, chatId, userId, feedback, getAdminChatId) {
    const adminChatId = await getAdminChatId(env);
    if (!adminChatId) throw new Error("Feedback admin chat is unavailable.");
    await sendMessage(env, adminChatId, `💬 Новий відгук\nКористувач: ${userId}\n\n${feedback}`);
    await clearPendingFeedback(env, userId);
    await sendMessage(env, chatId, messages.feedbackThankYou);
}
