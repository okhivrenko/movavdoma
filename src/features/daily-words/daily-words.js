import { openAIJson } from "../../platform/openai.js";
import { translateWithDeepL } from "../../platform/deepl.js";

// Daily-card persistence and delivery flow. Network and access dependencies are
// passed in explicitly so the Worker remains the composition root.

/** Generates one coherent two-example card for the supplied CEFR level. */
export async function generateDailyWordCard(env, level) {
    const result = await openAIJson(env, "daily_word_card", {
        type: "object", additionalProperties: false,
        properties: {
            word: { type: "string" }, context_en: { type: "string" },
            examples: { type: "array", items: {
                type: "object", additionalProperties: false,
                properties: { source: { type: "string" } },
                required: ["source"],
            } },
        }, required: ["word", "context_en", "examples"],
    }, "Create one useful English vocabulary card for a learner at the requested CEFR level. word must be a single English word or a short common phrase, not a proper noun. context_en must precisely state its meaning. Create exactly two natural English example sentences, each 8–18 words. Both examples must use exactly the stated meaning. Do not translate anything.", `CEFR level: ${level}`, { model: env.OPENAI_WORD_MODEL ?? "gpt-5.4-mini", reasoningEffort: "low" });

    if (!result.word?.trim() || !result.context_en?.trim() || !Array.isArray(result.examples) || result.examples.length !== 2 || result.examples.some((example) => typeof example?.source !== "string" || !example.source.trim())) {
        throw new Error("Invalid daily word examples response.");
    }
    const translations = await translateWithDeepL(env, [result.word, ...result.examples.map((example) => example.source)], {
        source: "en", target: "uk", context: `English vocabulary meaning: ${result.context_en}`,
    });
    return {
        word: result.word.trim(),
        context_en: result.context_en.trim(),
        translation_uk: translations[0],
        examples: result.examples.map((example, index) => ({ source: example.source.trim(), uk: translations[index + 1] })),
    };
}

export function dailyWordKeyboard(pendingId) {
    return {
        inline_keyboard: [[
            { text: "✅ Знаю", callback_data: `daily:know:${pendingId}` },
            { text: "📖 Вчити", callback_data: `daily:learn:${pendingId}` },
        ]],
    };
}

export function dailyWordText(card, level) {
    return `📚 Нове слово · ${level}\n\n${card.word} — ${card.translation_uk}\n\n1. ${card.examples[0].source}\n${card.examples[0].uk}\n\n2. ${card.examples[1].source}\n${card.examples[1].uk}\n\nЯкщо хочеш додати його до свого списку, натисни «Вчити».`;
}

export function dailyCardFromPending(pending) {
    try {
        const examples = JSON.parse(pending.examples_json);
        if (!Array.isArray(examples) || examples.length !== 2) return null;
        return { id: pending.id, card: {
            word: pending.source_text, translation_uk: pending.translation_uk,
            context_en: pending.context_note, examples,
        } };
    } catch {
        return null;
    }
}

export async function claimDailyWordCard(env, userId, localDate, { isAdmin, getUserAccessLevel, dailyWordCardLimitForLevel }) {
    if (isAdmin(env, userId)) return true;

    const limit = dailyWordCardLimitForLevel(await getUserAccessLevel(env, userId));
    const claimed = await env.DB.prepare(`
      INSERT INTO daily_word_card_views (user_id, local_date, views)
      VALUES (?, ?, 1)
      ON CONFLICT(user_id, local_date) DO UPDATE
      SET views = views + 1
      WHERE views < ?
    `).bind(userId, localDate, limit).run();

    return claimed.meta.changes > 0;
}

export async function generateNewDailyWord(env, userId, level, generateCard, maxAttempts) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const card = await generateCard(env, level);
        const existing = await env.DB.prepare(`
          SELECT 1 FROM words WHERE user_id = ? AND lower(source_text) = lower(?)
          UNION ALL
          SELECT 1 FROM pending_daily_words WHERE user_id = ? AND lower(source_text) = lower(?)
          LIMIT 1
        `).bind(userId, card.word.trim(), userId, card.word.trim()).first();

        if (!existing) return card;
    }

    throw new Error("Could not generate a new daily word.");
}

export async function savePendingDailyWord(env, userId, card, localDate) {
    await env.DB.prepare("DELETE FROM pending_daily_words WHERE user_id = ? AND local_date <> ?")
        .bind(userId, localDate).run();
    const inserted = await env.DB.prepare(`
      INSERT INTO pending_daily_words (
        user_id, source_text, translation_uk, context_note, examples_json, local_date
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(userId, card.word.trim(), card.translation_uk, card.context_en, JSON.stringify(card.examples), localDate).run();
    return inserted.meta.last_row_id;
}

export async function getPendingDailyWord(env, userId, localDate) {
    const pending = await env.DB.prepare(`
      SELECT id, source_text, translation_uk, context_note, examples_json
      FROM pending_daily_words WHERE user_id = ? AND local_date = ? LIMIT 1
    `).bind(userId, localDate).first();
    if (!pending) return null;

    return dailyCardFromPending(pending);
}

export async function hasPendingDailyWord(env, userId, pendingId) {
    return Boolean(await env.DB.prepare("SELECT 1 FROM pending_daily_words WHERE id = ? AND user_id = ?")
        .bind(pendingId, userId).first());
}

export async function savePendingDailyWordToLearning(env, userId, pendingId) {
    const pending = await env.DB.prepare(`
      SELECT source_text, translation_uk, context_note, examples_json
      FROM pending_daily_words WHERE id = ? AND user_id = ?
    `).bind(pendingId, userId).first();
    if (!pending) return false;

    const examples = JSON.parse(pending.examples_json);
    if (!Array.isArray(examples) || examples.length !== 2) throw new Error("Invalid pending daily word.");

    const insertedWord = await env.DB.prepare(`
      INSERT INTO words (user_id, source_text, source_language, translation_uk, context_note)
      VALUES (?, ?, 'en', ?, ?)
    `).bind(userId, pending.source_text, pending.translation_uk, pending.context_note).run();
    for (let index = 0; index < examples.length; index += 1) {
        await env.DB.prepare(`
          INSERT INTO examples (word_id, sentence_source, sentence_uk, position)
          VALUES (?, ?, ?, ?)
        `).bind(insertedWord.meta.last_row_id, examples[index].source, examples[index].uk, index + 1).run();
    }
    await env.DB.prepare("DELETE FROM pending_daily_words WHERE id = ? AND user_id = ?")
        .bind(pendingId, userId).run();
    return true;
}
