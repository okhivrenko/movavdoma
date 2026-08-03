import { dailyLimitReachedText } from "./helpers.js";
import {
    hasPendingDailyWord,
    savePendingDailyWordToLearning,
} from "./daily-words.js";
import { answerCallbackQuery, editMessage, sendMessage } from "./telegram.js";

/** Handles the two user-owned actions on an already-sent daily word card. */
export async function handleDailyWordCallback(env, callback, context, dependencies) {
    if (!callback.data.startsWith("daily:know:") && !callback.data.startsWith("daily:learn:")) return false;

    const { chatId, messageId, userId } = context;
    const match = callback.data.match(/^daily:(know|learn):(\d+)$/);
    if (!match) {
        await answerCallbackQuery(env, callback.id, "Невірний вибір.");
        return true;
    }

    const action = match[1];
    const pendingId = Number(match[2]);
    try {
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

        const changed = action === "learn"
            ? await savePendingDailyWordToLearning(env, userId, pendingId)
            : (await env.DB.prepare("DELETE FROM pending_daily_words WHERE id = ? AND user_id = ?")
                .bind(pendingId, userId).run()).meta.changes > 0;
        if (!changed) {
            await answerCallbackQuery(env, callback.id, "Ця картка вже оброблена.");
            return true;
        }

        await answerCallbackQuery(env, callback.id,
            action === "learn" ? "Додано до списку для вивчення." : "Чудово, не додаю до списку.");
        await editMessage(env, chatId, messageId,
            action === "learn" ? "📖 Слово додано до «📚 Мої слова»." : "✅ Чудово! Це слово не додано до твого списку.",
            { inline_keyboard: [] });
    } catch (error) {
        console.error({ event: "daily_word_action_failed", message: error instanceof Error ? error.message : "Unknown error" });
        await answerCallbackQuery(env, callback.id, "Не вдалося зберегти вибір.");
    }
    return true;
}
