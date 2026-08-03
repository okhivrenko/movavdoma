export async function removeExpiredLearnedWords(env, retentionDays = 30) {
    const cutoff = `-${retentionDays} days`;
    const expiredWordIds = `SELECT id FROM words WHERE is_active = 0 AND learned_at IS NOT NULL AND learned_at < datetime('now', ?)`;
    const results = await env.DB.batch([
        env.DB.prepare(`DELETE FROM examples WHERE word_id IN (${expiredWordIds})`).bind(cutoff),
        env.DB.prepare(`DELETE FROM reviews WHERE word_id IN (${expiredWordIds})`).bind(cutoff),
        env.DB.prepare(`DELETE FROM words WHERE id IN (${expiredWordIds})`).bind(cutoff),
    ]);
    const deleted = results[2]?.meta?.changes ?? 0;
    if (deleted > 0) console.log({ event: "expired_learned_words_removed", deleted });
}
