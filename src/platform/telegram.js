/** Telegram Bot API client shared by feature modules. */
import { fetchWithTimeout } from "./http.js";

export async function telegramApi(env, method, payload) {
    const startedAt = Date.now();
    try {
        const response = await fetchWithTimeout(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
        });
        const data = await response.json();
        console.debug({ event: "telegram_api_response", method, status: response.status, durationMs: Date.now() - startedAt });
        if (!response.ok || !data.ok) throw new Error(`Telegram ${method} failed`);
        return data.result;
    } catch (error) {
        console.warn({ event: "telegram_api_failed", method, durationMs: Date.now() - startedAt, reason: error?.name === "AbortError" ? "timeout" : "request_failed" });
        throw error;
    }
}

export function sendTypingAction(env, chatId) {
    return telegramApi(env, "sendChatAction", { chat_id: chatId, action: "typing" });
}

export function sendMessage(env, chatId, text, replyMarkup) {
    return telegramApi(env, "sendMessage", { chat_id: chatId, text, reply_markup: replyMarkup });
}

export function editMessage(env, chatId, messageId, text, replyMarkup) {
    return telegramApi(env, "editMessageText", {
        chat_id: chatId, message_id: messageId, text, reply_markup: replyMarkup,
    });
}

export function editMessageReplyMarkup(env, chatId, messageId, replyMarkup) {
    return telegramApi(env, "editMessageReplyMarkup", {
        chat_id: chatId, message_id: messageId, reply_markup: replyMarkup,
    });
}

export function answerCallbackQuery(env, callbackQueryId, text) {
    return telegramApi(env, "answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

export async function getBotLink(env) {
    const username = (await telegramApi(env, "getMe", {}))?.username;
    if (!/^[A-Za-z0-9_]{5,32}$/.test(username ?? "")) throw new Error("Telegram bot username is unavailable.");
    return `https://t.me/${username}`;
}
