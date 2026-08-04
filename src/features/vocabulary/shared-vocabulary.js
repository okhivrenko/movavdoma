function normalizeCachePart(value) {
    return String(value ?? "").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

export function sharedVocabularyKey(word, context = "") {
    return { word: normalizeCachePart(word), context: normalizeCachePart(context) };
}

function isSenses(value) {
    return Array.isArray(value) && value.length > 0 && value.every((sense) =>
        typeof sense?.label_uk === "string" && sense.label_uk.trim() &&
        typeof sense?.context_en === "string" && sense.context_en.trim()
    );
}

function isCard(value) {
    return typeof value?.translation_uk === "string" && value.translation_uk.trim() &&
        Array.isArray(value.examples) && value.examples.length === 2 && value.examples.every((example) =>
            typeof example?.source === "string" && example.source.trim() &&
            typeof example?.uk === "string" && example.uk.trim()
        );
}

export async function getOrCreateSharedSenses(env, word, createSenses) {
    const key = sharedVocabularyKey(word).word;
    const existing = await env.DB.prepare("SELECT senses_json FROM shared_word_senses WHERE normalized_word = ?")
        .bind(key).first();
    if (existing?.senses_json) {
        try {
            const senses = JSON.parse(existing.senses_json);
            if (isSenses(senses)) return senses;
        } catch { /* Replace malformed cache data with a fresh result. */ }
    }
    const senses = await createSenses();
    if (!isSenses(senses)) throw new Error("Invalid word senses.");
    await env.DB.prepare(`
      INSERT INTO shared_word_senses (normalized_word, senses_json) VALUES (?, ?)
      ON CONFLICT(normalized_word) DO UPDATE SET senses_json = excluded.senses_json
    `).bind(key, JSON.stringify(senses)).run();
    return senses;
}

export async function getOrCreateSharedCard(env, word, context, createCard) {
    const key = sharedVocabularyKey(word, context);
    const existing = await env.DB.prepare(`
      SELECT translation_uk, examples_json FROM shared_vocabulary_cards
      WHERE normalized_word = ? AND normalized_context = ?
    `).bind(key.word, key.context).first();
    if (existing?.translation_uk && existing.examples_json) {
        try {
            const card = { translation_uk: existing.translation_uk, examples: JSON.parse(existing.examples_json) };
            if (isCard(card)) return card;
        } catch { /* Replace malformed cache data with a fresh result. */ }
    }
    const card = await createCard();
    if (!isCard(card)) throw new Error("Invalid shared vocabulary card.");
    await env.DB.prepare(`
      INSERT INTO shared_vocabulary_cards (normalized_word, normalized_context, translation_uk, examples_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(normalized_word, normalized_context) DO UPDATE SET
        translation_uk = excluded.translation_uk, examples_json = excluded.examples_json
    `).bind(key.word, key.context, card.translation_uk, JSON.stringify(card.examples)).run();
    return card;
}
