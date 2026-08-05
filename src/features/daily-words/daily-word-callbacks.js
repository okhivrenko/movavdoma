import { dailyLimitReachedText } from "../../domain/helpers.js";
import {
    hasPendingDailyWord,
    savePendingDailyWordToLearning,
} from "./daily-words.js";
import { answerCallbackQuery, editMessage, sendMessage } from "../../platform/telegram.js";

const dailyWordLoadingKeyboard = { inline_keyboard: [[{ text: "⏳ Завантаження…", callback_data: "daily:loading" }]] };
const dailyWordLoadingText = "⏳ Завантажую слово…";

/** Handles user-owned actions on an already-sent daily word card. */
export async function handleDailyWordCallback(env, callback, context, dependencies) {
    if (!callback.data.startsWith("daily:learn:") && !callback.data.startsWith("daily:next:") && !callback.data.startsWith("daily:prev:")) return false;

    const { chatId, messageId, userId } = context;
    const match = callback.data.match(/^daily:(learn|next|prev):(\d+)$/);
    if (!match) {
        await answerCallbackQuery(env, callback.id, "Невірний вибір.");
        return true;
    }

    const action = match[1];
    const pendingId = Number(match[2]);
    try {
        if (action === "next") {
            await answerCallbackQuery(env, callback.id, "Завантажую наступне слово…");
            await editMessage(env, chatId, messageId, dailyWordLoadingText, dailyWordLoadingKeyboard);
            await dependencies.sendNextDailyWord(env, chatId, userId, pendingId, messageId);
            return true;
        }
        if (action === "prev") {
            await answerCallbackQuery(env, callback.id, "Показую попереднє слово…");
            await editMessage(env, chatId, messageId, dailyWordLoadingText, dailyWordLoadingKeyboard);
            await dependencies.sendPreviousDailyWord(env, chatId, userId, pendingId, messageId);
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
                await sendMessage(env, chatId, dailyLimitReachedText(dailyLimit));
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
        console.error({ event: "daily_word_action_failed", message: error instanceof Error ? error.message : "Unknown error" });
        if (action === "next" || action === "prev") {
            await sendMessage(env, chatId, "Не вдалося завантажити наступне слово. Спробуй ще раз за хвилину.");
            return true;
        }
        await answerCallbackQuery(env, callback.id, "Не вдалося зберегти вибір.");
    }
    return true;
}
