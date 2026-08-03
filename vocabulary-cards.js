import { openAIJson } from "./openai.js";
import { answerCallbackQuery, editMessage, sendMessage } from "./telegram.js";

export const SENSES_PER_PAGE = 3;
const MAX_SENSES = 9;

/** OpenAI generation and D1 persistence for one user-selected word meaning. */
export async function suggestSenses(env, word) {
    const result = await openAIJson(env, "word_senses", {
        type: "object", additionalProperties: false,
        properties: { senses: { type: "array", items: {
            type: "object", additionalProperties: false,
            properties: { label_uk: { type: "string" }, context_en: { type: "string" } },
            required: ["label_uk", "context_en"],
        } } }, required: ["senses"],
    }, "For an English vocabulary word, return one to nine genuinely different common meanings. Return one item only when the word is unambiguous. label_uk must be a short Ukrainian label suitable for a Telegram button. context_en must be a short English explanation of the exact meaning. Prioritize everyday meanings. Do not return grammatical forms of the same sense.", `Word: ${word}`);

    return result.senses.slice(0, MAX_SENSES);
}

async function generateWordCard(env, word, context) {
    const result = await openAIJson(env, "word_card", {
        type: "object", additionalProperties: false,
        properties: {
            translation_uk: { type: "string" }, examples: { type: "array", items: {
                type: "object", additionalProperties: false,
                properties: { source: { type: "string" }, uk: { type: "string" } },
                required: ["source", "uk"],
            } },
        }, required: ["translation_uk", "examples"],
    }, "Create one consistent vocabulary card. Translate the word into Ukrainian strictly for the supplied meaning. Create exactly two natural English sentences, each 8–18 words, using only that same meaning. Translate each sentence fluently into Ukrainian. Never mix meanings of the word.", `Word: ${word}\nChosen meaning: ${context}`);

    if (!Array.isArray(result.examples) || result.examples.length !== 2) throw new Error("Invalid examples response.");
    return result;
}

export function senseKeyboard(senses, page) {
    const totalPages = Math.ceil(senses.length / SENSES_PER_PAGE);
    const start = page * SENSES_PER_PAGE;
    const rows = senses.slice(start, start + SENSES_PER_PAGE).map((sense, offset) => ([{
        text: sense.label_uk, callback_data: `sense:${start + offset}`,
    }]));
    const navigation = [];
    if (page > 0) navigation.push({ text: "← Назад", callback_data: `page:${page - 1}` });
    if (page < totalPages - 1) navigation.push({ text: "Ще значення →", callback_data: `page:${page + 1}` });
    if (navigation.length > 0) rows.push(navigation);
    return { inline_keyboard: rows };
}

export function senseText(word, senses, page) {
    const totalPages = Math.ceil(senses.length / SENSES_PER_PAGE);
    return totalPages > 1
        ? `${word} має кілька значень. Обери потрібне:\nСторінка ${page + 1} з ${totalPages}`
        : `${word} має кілька значень. Обери потрібне:`;
}

export async function getPendingWord(env, userId) {
    const pending = await env.DB.prepare(`
      SELECT source_text, senses_json FROM pending_words WHERE user_id = ?
    `).bind(userId).first();
    if (!pending) return null;
    try { return { word: pending.source_text, senses: JSON.parse(pending.senses_json) }; } catch { return null; }
}

export async function closePendingSelection(env, userId) {
    const previous = await env.DB.prepare(`
      SELECT chat_id, message_id FROM pending_words WHERE user_id = ?
    `).bind(userId).first();
    if (!previous?.chat_id || !previous?.message_id) return;
    try {
        await editMessage(env, previous.chat_id, previous.message_id,
            "Вибір скасовано: ти почав додавати інше слово.", { inline_keyboard: [] });
    } catch {
        // The old selection can have been deleted; beginning the new one is still safe.
    }
}

export async function saveAndSendWord(env, chatId, userId, word, context) {
    const card = await generateWordCard(env, word, context);
    const insertedWord = await env.DB.prepare(`
      INSERT INTO words (user_id, source_text, source_language, translation_uk, context_note)
      VALUES (?, ?, 'en', ?, ?)
    `).bind(userId, word, card.translation_uk, context).run();

    for (let index = 0; index < card.examples.length; index += 1) {
        const example = card.examples[index];
        await env.DB.prepare(`
          INSERT INTO examples (word_id, sentence_source, sentence_uk, position) VALUES (?, ?, ?, ?)
        `).bind(insertedWord.meta.last_row_id, example.source, example.uk, index + 1).run();
    }

    await sendMessage(env, chatId,
        `✅ ${word} — ${card.translation_uk}\n\n1. ${card.examples[0].source}\n${card.examples[0].uk}\n\n2. ${card.examples[1].source}\n${card.examples[1].uk}`);
}

/** Handles stable `page:*` and `sense:*` callbacks for a user's pending choice. */
export async function handleVocabularyCallback(env, callback, { chatId, messageId, userId }) {
    const pending = await getPendingWord(env, userId);
    if (!pending) {
        await answerCallbackQuery(env, callback.id, "Цей вибір уже неактуальний. Додай слово ще раз.");
        return;
    }

    if (callback.data.startsWith("page:")) {
        const page = Number(callback.data.replace("page:", ""));
        const totalPages = Math.ceil(pending.senses.length / SENSES_PER_PAGE);
        if (!Number.isInteger(page) || page < 0 || page >= totalPages) {
            await answerCallbackQuery(env, callback.id, "Невірна сторінка.");
            return;
        }
        await answerCallbackQuery(env, callback.id, "");
        const text = senseText(pending.word, pending.senses, page);
        const keyboard = senseKeyboard(pending.senses, page);
        try { await editMessage(env, chatId, messageId, text, keyboard); }
        catch { await sendMessage(env, chatId, text, keyboard); }
        return;
    }

    if (callback.data.startsWith("sense:")) {
        const selectedSense = pending.senses[Number(callback.data.replace("sense:", ""))];
        if (!selectedSense) {
            await answerCallbackQuery(env, callback.id, "Невірний вибір.");
            return;
        }
        await answerCallbackQuery(env, callback.id, "Створюю картку…");
        try {
            await editMessage(env, chatId, messageId, `✅ Обране значення: ${selectedSense.label_uk}`, { inline_keyboard: [] });
            await saveAndSendWord(env, chatId, userId, pending.word, selectedSense.context_en);
            await env.DB.prepare("DELETE FROM pending_words WHERE user_id = ?").bind(userId).run();
        } catch {
            await sendMessage(env, chatId, "Не вдалося створити картку. Спробуй вибрати значення ще раз.");
        }
    }
}
