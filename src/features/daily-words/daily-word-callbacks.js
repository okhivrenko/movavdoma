import {
    hasPendingDailyWord,
    savePendingDailyWordToLearning,
} from "./daily-words.js";
import { answerCallbackQuery, editMessage, editMessageReplyMarkup, sendMessage } from "../../platform/telegram.js";

const dailyWordLoadingKeyboard = { inline_keyboard: [[{ text: "⏳ Завантаження…", callback_data: "daily:loading" }]] };

function dailyWordRetryKeyboard(action, pendingId) {
    return { inline_keyboard: [[{
        text: "🔄 Спробувати ще раз",
        callback_data: `daily:${action}:${pendingId}`,
    }]] };
}

/** Handles user-owned actions on an already-sent daily word card. */
export async function handleDailyWordCallback(env, callback, context, dependencies) {
    if (callback.data === "daily:loading") {
        await answerCallbackQuery(env, callback.id, "Ще готую слово…");
        return true;
    }
    if (!callback.data.startsWith("daily:learn:") && !callback.data.startsWith("daily:next:") && !callback.data.startsWith("daily:prev:")) return false;

    const { chatId, messageId, userId } = context;
    const match = callback.data.match(/^daily:(learn|next|prev):(\d+)$/);
    if (!match) {
        await answerCallbackQuery(env, callback.id, "Невірний вибір.");
        return true;
    }

    const action = match[1];
    const pendingId = Number(match[2]);
    const startedAt = Date.now();
    try {
        if (action === "next") {
            await answerCallbackQuery(env, callback.id, "Шукаю наступне слово…");
            const ready = await dependencies.sendReadyNextDailyWord(env, chatId, userId, pendingId, messageId);
            if (ready.status === "shown" || ready.status === "limit") {
                console.info({ event: "daily_word_navigation_ready", source: ready.source ?? ready.status, durationMs: Date.now() - startedAt });
                return true;
            }
            if (ready.status === "unavailable") {
                await restoreUnavailableDailyWord(env, chatId, messageId);
                return true;
            }
            await editMessageReplyMarkup(env, chatId, messageId, dailyWordLoadingKeyboard);
            await dependencies.queueNextDailyWord(env, { chatId, messageId, userId, pendingId });
            console.debug({ event: "daily_word_navigation_queued", action, durationMs: Date.now() - startedAt });
            return true;
        }
        if (action === "prev") {
            await answerCallbackQuery(env, callback.id, "Показую попереднє слово…");
            await editMessageReplyMarkup(env, chatId, messageId, dailyWordLoadingKeyboard);
            const shown = await dependencies.sendPreviousDailyWord(env, chatId, userId, pendingId, messageId);
            if (!shown) await restoreUnavailableDailyWord(env, chatId, messageId);
            console.debug({ event: "daily_word_navigation_completed", action, durationMs: Date.now() - startedAt, shown });
            return true;
        }
        if (action === "learn") {
            if (!(await hasPendingDailyWord(env, userId, pendingId))) {
                await answerCallbackQuery(env, callback.id, "Ця картка вже оброблена.");
                return true;
            }
            if (!(await dependencies.claimDailyWordAddition(env, userId))) {
                const dailyLimit = await dependencies.getDailyAdditionLimit(env, userId);
                await answerCallbackQuery(env, callback.id, "Денний ліміт вичерпано.");
                await dependencies.sendLimitReachedOptions(env, chatId, userId, dailyLimit);
                return true;
            }
        }

        const changed = await savePendingDailyWordToLearning(env, userId, pendingId);
        if (!changed) {
            await answerCallbackQuery(env, callback.id, "Ця картка вже оброблена.");
            return true;
        }

        await answerCallbackQuery(env, callback.id,
            "Додано до списку для вивчення.");
        await editMessage(env, chatId, messageId,
            "📖 Слово додано до «📚 Мої слова».",
            { inline_keyboard: [] });
    } catch (error) {
        console.error({ event: "daily_word_action_failed", action, durationMs: Date.now() - startedAt, message: error instanceof Error ? error.message : "Unknown error" });
        if (action === "next" || action === "prev") {
            await restoreRetryableDailyWord(env, chatId, messageId, action, pendingId);
            await sendMessage(env, chatId, "Не вдалося завантажити слово. Спробуй ще раз.");
            return true;
        }
        await answerCallbackQuery(env, callback.id, "Не вдалося зберегти вибір.");
    }
    return true;
}

async function restoreRetryableDailyWord(env, chatId, messageId, action, pendingId) {
    try {
        await editMessageReplyMarkup(env, chatId, messageId, dailyWordRetryKeyboard(action, pendingId));
    } catch (error) {
        console.warn({ event: "daily_word_retry_button_restore_failed", action, message: error instanceof Error ? error.message : "Unknown error" });
    }
}

async function restoreUnavailableDailyWord(env, chatId, messageId) {
    try {
        await editMessageReplyMarkup(env, chatId, messageId, { inline_keyboard: [] });
        await sendMessage(env, chatId, "Ця картка вже недоступна. Відкрий «📚 Щоденне слово» ще раз.");
    } catch (error) {
        console.warn({ event: "daily_word_unavailable_restore_failed", message: error instanceof Error ? error.message : "Unknown error" });
    }
}
