import { messages } from "../../domain/messages.js";
import { sendMessage } from "../../platform/telegram.js";

export const USER_MESSAGE_TYPE = Object.freeze({
    FEEDBACK: "feedback",
    CONTACT: "contact",
});

/** The explicit feedback flow: one pending plain-text message per user. */
export async function startFeedback(env, chatId, userId, prompt = messages.feedbackPrompt, type = USER_MESSAGE_TYPE.FEEDBACK) {
    await env.DB.prepare("UPDATE users SET feedback_pending = 1, feedback_kind = ? WHERE telegram_user_id = ?")
        .bind(type, userId).run();
    await sendMessage(env, chatId, prompt);
}

export async function clearPendingFeedback(env, userId) {
    await env.DB.prepare("UPDATE users SET feedback_pending = 0 WHERE telegram_user_id = ? AND feedback_pending = 1")
        .bind(userId).run();
}

export async function submitFeedback(env, chatId, userId, feedback, getAdminChatId, type = USER_MESSAGE_TYPE.FEEDBACK) {
    await env.DB.prepare("INSERT INTO user_messages (user_id, message_type, content) VALUES (?, ?, ?)")
        .bind(userId, type, feedback).run();
    const adminChatId = await getAdminChatId(env);
    if (!adminChatId) throw new Error("Feedback admin chat is unavailable.");
    const heading = type === USER_MESSAGE_TYPE.CONTACT ? "📩 Нове повідомлення" : "💬 Новий відгук";
    await sendMessage(env, adminChatId, `${heading}\nКористувач: ${userId}\n\n${feedback}`);
    await clearPendingFeedback(env, userId);
    await sendMessage(env, chatId, messages.feedbackThankYou);
}
