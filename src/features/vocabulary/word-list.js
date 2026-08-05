import { answerCallbackQuery, editMessage, sendMessage } from "../../platform/telegram.js";

export const LIST_LIMIT = 10;
// Keep both vocabulary lists compact and visually consistent in Telegram.
// Ten items become two rows of five action buttons.
const ACTIVE_WORDS_PER_PAGE = LIST_LIMIT;
const LEARNED_WORDS_PER_PAGE = 10;

/** Read-model and Telegram presentation for active and learned vocabulary. */
export async function getRecentActiveWords(env, userId, page = 0) {
    const result = await env.DB.prepare(`
      SELECT id, source_text, translation_uk FROM words
      WHERE user_id = ? AND is_active = 1 ORDER BY id DESC LIMIT ? OFFSET ?
    `).bind(userId, ACTIVE_WORDS_PER_PAGE, page * ACTIVE_WORDS_PER_PAGE).all();
    return result.results;
}

async function activeWordPageCount(env, userId) {
    const result = await env.DB.prepare(`
      SELECT COUNT(*) AS total FROM words
      WHERE user_id = ? AND is_active = 1
    `).bind(userId).first();
    return Math.max(1, Math.ceil(Number(result?.total ?? 0) / ACTIVE_WORDS_PER_PAGE));
}

export async function getRecentArchivedWords(env, userId, page = 0) {
    const result = await env.DB.prepare(`
      SELECT id, source_text, translation_uk FROM words
      WHERE user_id = ? AND is_active = 0 ORDER BY id DESC LIMIT ? OFFSET ?
    `).bind(userId, LEARNED_WORDS_PER_PAGE, page * LEARNED_WORDS_PER_PAGE).all();
    return result.results;
}

async function learnedWordPageCount(env, userId) {
    const result = await env.DB.prepare(`
      SELECT COUNT(*) AS total FROM words
      WHERE user_id = ? AND is_active = 0
    `).bind(userId).first();
    return Math.max(1, Math.ceil(Number(result?.total ?? 0) / LEARNED_WORDS_PER_PAGE));
}

function listText(words, page, totalPages) {
    if (words.length === 0) return "У словнику поки немає активних слів.";
    return `Мої слова · сторінка ${page + 1} з ${totalPages}:\n${words.map((word, index) => `${page * ACTIVE_WORDS_PER_PAGE + index + 1}. ${word.source_text} — ${word.translation_uk}`).join("\n")}\n\n📘 Показати приклад — натисни номер слова нижче.\n✅ Вже вивчив — натисни номер слова нижче.`;
}

function numberButtonRows(words, page, callbackData, prefix = "") {
    const buttons = words.map((word, index) => ({
        text: `${prefix}${page * ACTIVE_WORDS_PER_PAGE + index + 1}`,
        callback_data: callbackData(word),
    }));
    const rows = [];

    for (let index = 0; index < buttons.length; index += 5) {
        rows.push(buttons.slice(index, index + 5));
    }

    return rows;
}

function listKeyboard(words, page, totalPages) {
    if (words.length === 0) return undefined;
    const rows = [
        ...numberButtonRows(words, page, (word) => `examples:${word.id}`, "📘 "),
        ...numberButtonRows(words, page, (word) => `delete:${word.id}:${page}`, "✅ "),
    ];
    const navigation = [];

    if (page > 0) navigation.push({ text: "⬅️ Назад", callback_data: `active-page:${page - 1}` });
    if (page < totalPages - 1) navigation.push({ text: "➡️ Далі", callback_data: `active-page:${page + 1}` });
    if (navigation.length > 0) rows.push(navigation);

    return { inline_keyboard: rows };
}

/** Sends the active vocabulary list with its matching inline controls. */
export async function sendActiveWordList(env, chatId, userId, requestedPage = 0) {
    const totalPages = await activeWordPageCount(env, userId);
    const page = Math.min(Math.max(0, requestedPage), totalPages - 1);
    const words = await getRecentActiveWords(env, userId, page);
    await sendMessage(env, chatId, listText(words, page, totalPages), listKeyboard(words, page, totalPages));
}

function examplesText(word, examples) {
    const heading = word.translation_uk ? `${word.source_text} — ${word.translation_uk}` : word.source_text;
    if (examples.length === 0) return `📘 ${heading}\n\nДля цього слова поки немає прикладів.`;
    return `📘 ${heading}\n\n${examples.map((example, index) => `${index + 1}. ${example.sentence_source}\n${example.sentence_uk}`).join("\n\n")}`;
}

export async function sendWordExamples(env, chatId, userId, wordId) {
    const word = await env.DB.prepare(`
      SELECT source_text, translation_uk FROM words
      WHERE id = ? AND user_id = ? AND is_active = 1
    `).bind(wordId, userId).first();
    if (!word) return false;
    const result = await env.DB.prepare(`
      SELECT sentence_source, sentence_uk FROM examples WHERE word_id = ? ORDER BY position ASC
    `).bind(wordId).all();
    await sendMessage(env, chatId, examplesText(word, result.results));
    return true;
}

export async function handleExamplesCallback(env, callback, { chatId, userId }) {
    if (!callback.data.startsWith("examples:")) return false;
    const wordId = Number(callback.data.replace("examples:", ""));
    if (!Number.isInteger(wordId) || wordId <= 0) {
        await answerCallbackQuery(env, callback.id, "Невірний вибір.");
        return true;
    }
    try {
        const sent = await sendWordExamples(env, chatId, userId, wordId);
        await answerCallbackQuery(env, callback.id, sent ? "Показую приклади." : "Це слово вже недоступне.");
    } catch (error) {
        console.error({ event: "show_examples_failed", message: error instanceof Error ? error.message : "Unknown error" });
        await answerCallbackQuery(env, callback.id, "Не вдалося показати приклади.");
    }
    return true;
}

function archivedText(words, page, totalPages) {
    if (words.length === 0) return "Вивчених слів поки немає.";
    return `Вивчені слова · сторінка ${page + 1} з ${totalPages}:\n${words.map((word, index) => `${page * LEARNED_WORDS_PER_PAGE + index + 1}. ${word.source_text} — ${word.translation_uk}`).join("\n")}\n\nНатисни номер слова, щоб повернути його до навчання.`;
}

function archivedKeyboard(words, page, totalPages) {
    if (words.length === 0) return undefined;
    const numberButtons = words.map((word, index) => ({
        text: String(page * LEARNED_WORDS_PER_PAGE + index + 1),
        callback_data: `restore:${word.id}:${page}`,
    }));
    const rows = [];

    for (let index = 0; index < numberButtons.length; index += 5) {
        rows.push(numberButtons.slice(index, index + 5));
    }

    const navigation = [];
    if (page > 0) navigation.push({ text: "⬅️ Назад", callback_data: `learned-page:${page - 1}` });
    if (page < totalPages - 1) navigation.push({ text: "➡️ Далі", callback_data: `learned-page:${page + 1}` });
    if (navigation.length > 0) rows.push(navigation);

    return { inline_keyboard: rows };
}

/** Sends the learned-vocabulary list with controls to restore each word. */
export async function sendLearnedWordList(env, chatId, userId, requestedPage = 0) {
    const totalPages = await learnedWordPageCount(env, userId);
    const page = Math.min(Math.max(0, requestedPage), totalPages - 1);
    const words = await getRecentArchivedWords(env, userId, page);
    await sendMessage(env, chatId, archivedText(words, page, totalPages), archivedKeyboard(words, page, totalPages));
}

export async function refreshListMessage(env, chatId, messageId, userId, requestedPage = 0) {
    const totalPages = await activeWordPageCount(env, userId);
    const page = Math.min(Math.max(0, requestedPage), totalPages - 1);
    const words = await getRecentActiveWords(env, userId, page);
    const text = listText(words, page, totalPages);
    const keyboard = listKeyboard(words, page, totalPages);
    try { await editMessage(env, chatId, messageId, text, keyboard); }
    catch { await sendMessage(env, chatId, text, keyboard); }
}

export async function refreshArchivedMessage(env, chatId, messageId, userId, requestedPage = 0) {
    const totalPages = await learnedWordPageCount(env, userId);
    const page = Math.min(Math.max(0, requestedPage), totalPages - 1);
    const words = await getRecentArchivedWords(env, userId, page);
    const text = archivedText(words, page, totalPages);
    const keyboard = archivedKeyboard(words, page, totalPages);
    try { await editMessage(env, chatId, messageId, text, keyboard); }
    catch { await sendMessage(env, chatId, text, keyboard); }
}

/** Handles archive, restore, and pagination callbacks for vocabulary lists. */
export async function handleWordListCallback(env, callback, { chatId, messageId, userId }) {
    const data = callback.data;
    const invalid = async (text = "Невірний вибір.") => {
        await answerCallbackQuery(env, callback.id, text);
        return true;
    };
    if (data.startsWith("delete:") || data.startsWith("archive:")) {
        const match = data.match(/^(?:delete|archive):(\d+)(?::(\d+))?$/);
        const wordId = Number(match?.[1]);
        const page = Number(match?.[2] ?? 0);
        if (!Number.isInteger(wordId) || wordId <= 0 || !Number.isInteger(page) || page < 0) return invalid();
        const archived = await env.DB.prepare(`
          UPDATE words SET is_active = 0, learned_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ? AND is_active = 1
        `).bind(wordId, userId).run();
        await answerCallbackQuery(env, callback.id, archived.meta.changes > 0 ? "Слово позначено як вивчене." : "Це слово вже позначене як вивчене.");
        await refreshListMessage(env, chatId, messageId, userId, page);
        return true;
    }
    if (data.startsWith("active-page:") || data.startsWith("learned-page:")) {
        const page = Number(data.replace(/^(?:active|learned)-page:/, ""));
        if (!Number.isInteger(page) || page < 0) return invalid("Невірна сторінка.");
        await answerCallbackQuery(env, callback.id);
        if (data.startsWith("active-page:")) await refreshListMessage(env, chatId, messageId, userId, page);
        else await refreshArchivedMessage(env, chatId, messageId, userId, page);
        return true;
    }
    if (!data.startsWith("restore:")) return false;
    const match = data.match(/^restore:(\d+)(?::(\d+))?$/);
    const wordId = Number(match?.[1]);
    const page = Number(match?.[2] ?? 0);
    if (!Number.isInteger(wordId) || wordId <= 0 || !Number.isInteger(page) || page < 0) return invalid();
    const restored = await env.DB.prepare(`
      UPDATE words SET is_active = 1, learned_at = NULL
      WHERE id = ? AND user_id = ? AND is_active = 0
    `).bind(wordId, userId).run();
    await answerCallbackQuery(env, callback.id, restored.meta.changes > 0 ? "Слово повернено до навчання." : "Це слово вже у списку для навчання.");
    await refreshArchivedMessage(env, chatId, messageId, userId, page);
    return true;
}
