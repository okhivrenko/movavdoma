/**
 * Durable per-user memory used to keep new daily words genuinely new.
 * It deliberately contains no translations, examples, or provider payloads.
 */
export function normalizeSeenWord(word) {
    return String(word ?? "").trim().toLocaleLowerCase("en-US");
}

export async function recordSeenWord(env, userId, word) {
    const normalizedWord = normalizeSeenWord(word);
    if (!normalizedWord) throw new Error("A seen word is required.");
    await env.DB.prepare(`
      INSERT INTO user_seen_words (user_id, normalized_word)
      VALUES (?, ?)
      ON CONFLICT(user_id, normalized_word) DO UPDATE
      SET last_seen_at = CURRENT_TIMESTAMP
    `).bind(userId, normalizedWord).run();
}
