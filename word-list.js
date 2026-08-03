import { editMessage, sendMessage } from "./telegram.js";

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
    return `Мої слова · сторінка ${page + 1} з ${totalPages}:\n${words.map((word, index) => `${index + 1}. ${word.source_text} — ${word.translation_uk}`).join("\n")}\n\n📘 Показати приклад — натисни номер слова нижче.\n✅ Вже вивчив — натисни номер слова нижче.`;
}

function numberButtonRows(words, callbackData) {
    const buttons = words.map((word, index) => ({
        text: String(index + 1),
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
        ...numberButtonRows(words, (word) => `examples:${word.id}`),
        ...numberButtonRows(words, (word) => `delete:${word.id}:${page}`),
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

function archivedText(words, page, totalPages) {
    if (words.length === 0) return "Вивчених слів поки немає.";
    return `Вивчені слова · сторінка ${page + 1} з ${totalPages}:\n${words.map((word, index) => `${index + 1}. ${word.source_text} — ${word.translation_uk}`).join("\n")}\n\nНатисни номер слова, щоб повернути його до навчання.`;
}

function archivedKeyboard(words, page, totalPages) {
    if (words.length === 0) return undefined;
    const numberButtons = words.map((word, index) => ({
        text: String(index + 1),
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
