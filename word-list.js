import { editMessage, sendMessage } from "./telegram.js";

export const LIST_LIMIT = 10;

/** Read-model and Telegram presentation for active and learned vocabulary. */
export async function getRecentActiveWords(env, userId) {
    const result = await env.DB.prepare(`
      SELECT id, source_text, translation_uk FROM words
      WHERE user_id = ? AND is_active = 1 ORDER BY id DESC LIMIT ?
    `).bind(userId, LIST_LIMIT).all();
    return result.results;
}

export async function getRecentArchivedWords(env, userId) {
    const result = await env.DB.prepare(`
      SELECT id, source_text, translation_uk FROM words
      WHERE user_id = ? AND is_active = 0 ORDER BY id DESC LIMIT ?
    `).bind(userId, LIST_LIMIT).all();
    return result.results;
}

function listText(words) {
    if (words.length === 0) return "У словнику поки немає активних слів.";
    return `Останні слова:\n${words.map((word, index) => `${index + 1}. ${word.source_text} — ${word.translation_uk}`).join("\n")}\n\nНатисни «Вивчив» під словом, яке вже добре знаєш.`;
}

function listKeyboard(words) {
    if (words.length === 0) return undefined;
    return { inline_keyboard: words.map((word, index) => [
        { text: `💬 Приклади №${index + 1}`, callback_data: `examples:${word.id}` },
        { text: `✅ Вивчив №${index + 1}`, callback_data: `delete:${word.id}` },
    ]) };
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

function archivedText(words) {
    if (words.length === 0) return "Вивчених слів поки немає.";
    return `Вивчені слова:\n${words.map((word, index) => `${index + 1}. ${word.source_text} — ${word.translation_uk}`).join("\n")}\n\nНатисни «Вивчати» під словом, щоб повернути його до навчання.`;
}

function archivedKeyboard(words) {
    if (words.length === 0) return undefined;
    return { inline_keyboard: words.map((word, index) => [
        { text: `📖 Вивчати №${index + 1}`, callback_data: `restore:${word.id}` },
    ]) };
}

export async function refreshListMessage(env, chatId, messageId, userId) {
    const words = await getRecentActiveWords(env, userId);
    const text = listText(words);
    const keyboard = listKeyboard(words);
    try { await editMessage(env, chatId, messageId, text, keyboard); }
    catch { await sendMessage(env, chatId, text, keyboard); }
}

export async function refreshArchivedMessage(env, chatId, messageId, userId) {
    const words = await getRecentArchivedWords(env, userId);
    const text = archivedText(words);
    const keyboard = archivedKeyboard(words);
    try { await editMessage(env, chatId, messageId, text, keyboard); }
    catch { await sendMessage(env, chatId, text, keyboard); }
}
