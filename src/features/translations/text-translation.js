import { translateWithDeepL } from "../../platform/deepl.js";
import { answerCallbackQuery, editMessage, sendMessage } from "../../platform/telegram.js";
import { LANGUAGE, LANGUAGE_LABEL_UK } from "../../domain/languages.js";
import { DEFAULT_DAILY_SETTINGS, localDateAndTime } from "../../domain/helpers.js";

export const MAX_TRANSLATION_TEXT_LENGTH = 256;
export const DAILY_TEXT_TRANSLATION_LIMIT = 10;

const TRANSLATION_DIRECTIONS = Object.freeze([
    Object.freeze({ source: LANGUAGE.UKRAINIAN, target: LANGUAGE.ENGLISH }),
    Object.freeze({ source: LANGUAGE.ENGLISH, target: LANGUAGE.UKRAINIAN }),
]);

function directionFor(source, target) {
    return TRANSLATION_DIRECTIONS.find((direction) => direction.source === source && direction.target === target) ?? null;
}

export function translationCharacterCount(text) {
    return Array.from(text).length;
}

export function textTranslationKeyboard() {
    return {
        inline_keyboard: TRANSLATION_DIRECTIONS.map((direction) => ([{
            text: `${LANGUAGE_LABEL_UK[direction.source]} → ${LANGUAGE_LABEL_UK[direction.target]}`,
            callback_data: `translate:${direction.source}:${direction.target}`,
        }])),
    };
}

export async function sendTextTranslationMenu(env, chatId) {
    await sendMessage(
        env,
        chatId,
        `🌐 Перекласти текст\n\nОбери напрям перекладу. Можна надіслати слово, фразу або речення до ${MAX_TRANSLATION_TEXT_LENGTH} символів.`,
        textTranslationKeyboard()
    );
}

export async function handleTextTranslationCallback(env, callback, { chatId, messageId, userId }) {
    const match = callback.data.match(/^translate:(uk|en):(uk|en)$/);
    if (!match) return false;

    const direction = directionFor(match[1], match[2]);
    if (!direction) {
        await answerCallbackQuery(env, callback.id, "Цей напрям перекладу недоступний.");
        return true;
    }

    await env.DB.prepare(`
      INSERT INTO pending_text_translations (user_id, source_language, target_language)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET source_language = excluded.source_language,
        target_language = excluded.target_language, created_at = CURRENT_TIMESTAMP
    `).bind(userId, direction.source, direction.target).run();

    await answerCallbackQuery(env, callback.id, "Надішли текст для перекладу.");
    await editMessage(
        env,
        chatId,
        messageId,
        `Надішли текст ${LANGUAGE_LABEL_UK[direction.source].toLowerCase()} мовою — перекладу ${LANGUAGE_LABEL_UK[direction.target].toLowerCase()} мовою.\n\nМаксимум ${MAX_TRANSLATION_TEXT_LENGTH} символів.`,
        { inline_keyboard: [] }
    );
    return true;
}

export async function clearPendingTextTranslation(env, userId) {
    await env.DB.prepare("DELETE FROM pending_text_translations WHERE user_id = ?").bind(userId).run();
}

async function getPendingTextTranslation(env, userId) {
    return env.DB.prepare(`
      SELECT source_language, target_language FROM pending_text_translations WHERE user_id = ?
    `).bind(userId).first();
}

export async function claimDailyTextTranslation(env, userId) {
    const user = await env.DB.prepare("SELECT timezone FROM users WHERE telegram_user_id = ?").bind(userId).first();
    const localTime = localDateAndTime(user?.timezone ?? DEFAULT_DAILY_SETTINGS.timezone, Date.now());
    if (!localTime) throw new Error("Unable to calculate local translation date.");

    const claimed = await env.DB.prepare(`
      INSERT INTO daily_text_translation_requests (user_id, local_date, requests)
      VALUES (?, ?, 1)
      ON CONFLICT(user_id, local_date) DO UPDATE SET requests = requests + 1
      WHERE requests < ?
    `).bind(userId, localTime.date, DAILY_TEXT_TRANSLATION_LIMIT).run();
    return claimed.meta.changes > 0;
}

async function translateText(env, text, direction) {
    const [translation] = await translateWithDeepL(env, [text], direction);
    return translation;
}

/** Consumes the direction selected by the user for exactly one plain-text message. */
export async function handlePendingTextTranslation(env, chatId, userId, text) {
    const direction = await getPendingTextTranslation(env, userId);
    if (!direction) return false;

    if (!directionFor(direction.source_language, direction.target_language)) {
        await clearPendingTextTranslation(env, userId);
        return false;
    }

    if (!text) {
        await sendMessage(env, chatId, "Надішли слово, фразу або речення для перекладу.");
        return true;
    }

    if (translationCharacterCount(text) > MAX_TRANSLATION_TEXT_LENGTH) {
        await sendMessage(env, chatId, `Текст має бути до ${MAX_TRANSLATION_TEXT_LENGTH} символів. Скороти його й надішли ще раз.`);
        return true;
    }

    try {
        if (!await claimDailyTextTranslation(env, userId)) {
            await clearPendingTextTranslation(env, userId);
            await sendMessage(env, chatId, `На сьогодні доступно до ${DAILY_TEXT_TRANSLATION_LIMIT} перекладів. Спробуй завтра.`);
            return true;
        }

        await clearPendingTextTranslation(env, userId);
        const translation = await translateText(env, text, { source: direction.source_language, target: direction.target_language });
        await sendMessage(env, chatId, `🌐 ${translation}`);
    } catch (error) {
        console.error({ event: "text_translation_failed", message: error instanceof Error ? error.message : "Unknown error" });
        await sendMessage(env, chatId, "Не вдалося перекласти текст. Спробуй ще раз за хвилину.");
    }
    return true;
}
