import { openAIJson } from "../../platform/openai.js";
import { translateWithDeepL } from "../../platform/deepl.js";
import { getOrCreateSharedCard } from "../vocabulary/shared-vocabulary.js";
import { normalizeSeenWord } from "../vocabulary/user-word-history.js";

// Daily-card persistence and delivery flow. Network and access dependencies are
// passed in explicitly so the Worker remains the composition root.

export function hasValidDailyExamples(examples) {
    if (!Array.isArray(examples) || examples.length !== 2) return false;
    const normalized = examples.map((example) => example?.source?.trim());
    return normalized.every((source) => typeof source === "string" && source.split(/\s+/).length >= 8 && source.split(/\s+/).length <= 18)
        && new Set(normalized.map((source) => source.toLocaleLowerCase())).size === normalized.length;
}

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

    if (!result.word?.trim() || !result.context_en?.trim() || !hasValidDailyExamples(result.examples)) {
        throw new Error("Invalid daily word examples response.");
    }
    let createdSharedCard = false;
    const sharedCard = await getOrCreateSharedCard(env, result.word, result.context_en, async () => {
        createdSharedCard = true;
        const translations = await translateWithDeepL(env, [result.word, ...result.examples.map((example) => example.source)], {
            source: "en", target: "uk", context: `English vocabulary meaning: ${result.context_en}`,
        });
        return {
            translation_uk: translations[0],
            examples: result.examples.map((example, index) => ({ source: example.source.trim(), uk: translations[index + 1] })),
        };
    });
    if (!hasValidDailyExamples(sharedCard.examples)) throw new Error("Invalid shared daily word examples.");
    console.debug({ event: createdSharedCard ? "daily_word_shared_card_cache_miss" : "daily_word_shared_card_cache_hit" });
    return {
        word: result.word.trim(),
        context_en: result.context_en.trim(),
        translation_uk: sharedCard.translation_uk,
        examples: sharedCard.examples,
    };
}

export function dailyWordKeyboard(cardId, { hasPrevious = false, canLearn = true } = {}) {
    const navigation = [];
    if (hasPrevious) navigation.push({ text: "← Попереднє слово", callback_data: `daily:prev:${cardId}` });
    navigation.push({ text: "Наступне слово →", callback_data: `daily:next:${cardId}` });
    return { inline_keyboard: [
        ...(canLearn ? [[{ text: "📖 Вчити", callback_data: `daily:learn:${cardId}` }]] : []),
        navigation,
    ] };
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
        }, learnedAt: pending.learned_at ?? null, localDate: pending.local_date };
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
        let card;
        try {
            card = await generateCard(env, level);
        } catch (error) {
            if (attempt === maxAttempts - 1) throw error;
            console.warn({
                event: "daily_word_generation_retry",
                attempt: attempt + 1,
                message: error instanceof Error ? error.message : "Unknown error",
            });
            continue;
        }
        const normalizedWord = normalizeSeenWord(card.word);
        const existing = await env.DB.prepare(`
          SELECT 1 FROM user_seen_words WHERE user_id = ? AND normalized_word = ?
          UNION ALL
          SELECT 1 FROM words WHERE user_id = ? AND lower(trim(source_text)) = ?
          UNION ALL
          SELECT 1 FROM daily_word_cards WHERE user_id = ? AND lower(trim(source_text)) = ?
          UNION ALL
          SELECT 1 FROM daily_word_prefetches WHERE user_id = ? AND lower(trim(source_text)) = ?
          LIMIT 1
        `).bind(userId, normalizedWord, userId, normalizedWord, userId, normalizedWord, userId, normalizedWord).first();

        if (!existing) return card;
    }

    throw new Error("Could not generate a new daily word.");
}

export async function fillDailyWordPrefetches(env, userId, level, generateCard, maxAttempts, target = 5) {
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM daily_word_prefetches WHERE user_id = ?")
        .bind(userId).first();
    const missing = Math.max(0, target - Number(count?.total ?? 0));
    for (let index = 0; index < missing; index += 1) {
        const card = await generateNewDailyWord(env, userId, level, generateCard, maxAttempts);
        await env.DB.prepare(`
          INSERT OR IGNORE INTO daily_word_prefetches (user_id, source_text, translation_uk, context_note, examples_json)
          VALUES (?, ?, ?, ?, ?)
        `).bind(userId, card.word, card.translation_uk, card.context_en, JSON.stringify(card.examples)).run();
    }
}

export async function takeDailyWordPrefetch(env, userId) {
    const prefetched = await env.DB.prepare(`
      SELECT id, source_text, translation_uk, context_note, examples_json
      FROM daily_word_prefetches WHERE user_id = ? ORDER BY id ASC LIMIT 1
    `).bind(userId).first();
    if (!prefetched) return null;
    const card = dailyCardFromPending(prefetched);
    if (!card) return null;
    await env.DB.prepare("DELETE FROM daily_word_prefetches WHERE id = ? AND user_id = ?")
        .bind(prefetched.id, userId).run();
    return card.card;
}

export async function savePendingDailyWord(env, userId, card, localDate) {
    await env.DB.prepare("DELETE FROM daily_word_cards WHERE user_id = ? AND local_date <> ?")
        .bind(userId, localDate).run();
    const inserted = await env.DB.prepare(`
      INSERT INTO daily_word_cards (
        user_id, source_text, translation_uk, context_note, examples_json, local_date
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(userId, card.word.trim(), card.translation_uk, card.context_en, JSON.stringify(card.examples), localDate).run();
    return inserted.meta.last_row_id;
}

export async function getPendingDailyWord(env, userId, localDate) {
    const pending = await env.DB.prepare(`
      SELECT id, source_text, translation_uk, context_note, examples_json, learned_at, local_date
      FROM daily_word_cards d
      WHERE user_id = ? AND local_date = ?
        AND NOT EXISTS (
          SELECT 1 FROM words w
          WHERE w.user_id = d.user_id AND lower(w.source_text) = lower(d.source_text)
        )
      ORDER BY id DESC LIMIT 1
    `).bind(userId, localDate).first();
    if (!pending) return null;

    return dailyCardFromPending(pending);
}

export async function getDailyWordNavigation(env, userId, cardId, localDate, direction) {
    const comparison = direction === "previous" ? "<" : ">";
    const ordering = direction === "previous" ? "DESC" : "ASC";
    const pending = await env.DB.prepare(`
      SELECT id, source_text, translation_uk, context_note, examples_json, learned_at, local_date
      FROM daily_word_cards d
      WHERE user_id = ? AND local_date = ? AND id ${comparison} ?
        AND NOT EXISTS (
          SELECT 1 FROM words w
          WHERE w.user_id = d.user_id AND lower(w.source_text) = lower(d.source_text)
        )
      ORDER BY id ${ordering} LIMIT 1
    `).bind(userId, localDate, cardId).first();
    if (!pending) return null;
    return dailyCardFromPending(pending);
}

export async function hasPreviousDailyWord(env, userId, cardId, localDate) {
    return Boolean(await getDailyWordNavigation(env, userId, cardId, localDate, "previous"));
}

export async function hasPendingDailyWord(env, userId, pendingId) {
    return Boolean(await env.DB.prepare("SELECT 1 FROM daily_word_cards WHERE id = ? AND user_id = ? AND learned_at IS NULL")
        .bind(pendingId, userId).first());
}

export async function savePendingDailyWordToLearning(env, userId, pendingId) {
    const pending = await env.DB.prepare(`
      SELECT source_text, translation_uk, context_note, examples_json
      FROM daily_word_cards WHERE id = ? AND user_id = ? AND learned_at IS NULL
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
    await env.DB.prepare("UPDATE daily_word_cards SET learned_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
        .bind(pendingId, userId).run();
    return true;
}
