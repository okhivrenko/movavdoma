// Daily-card persistence and delivery flow. Network and access dependencies are
// passed in explicitly so the Worker remains the composition root.

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
