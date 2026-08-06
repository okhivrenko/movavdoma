import { contentFor } from "../../content/index.js";

function logError(event, error) {
    console.error({ event, message: error instanceof Error ? error.message : "Unknown error" });
}

async function handleAdd(env, text, { chatId, userId }, d, copy) {
    const addMatch = text.match(/^\/add\s+(.+)$/i);
    const input = addMatch ? addMatch[1] : text.startsWith("/") ? null : text;
    if (!input) return false;
    const { word, explicitContext } = d.parseVocabularyInput(input);
    if (!word) { await d.sendMessage(env, chatId, copy.missingWord); return true; }
    if (!/[A-Za-z]/.test(word)) { await d.sendMessage(env, chatId, copy.invalidWord); return true; }
    if (word.length > 80 || explicitContext.length > 250) { await d.sendMessage(env, chatId, copy.wordTooLong); return true; }
    try {
        if (!await d.claimDailyWordAddition(env, userId)) {
            try {
                await d.sendLimitReachedOptions(env, chatId, userId, await d.getDailyAdditionLimit(env, userId));
            } catch (error) {
                logError("limit_options_failed", error);
                await d.sendMessage(env, chatId, d.dailyLimitReachedText(await d.getDailyAdditionLimit(env, userId)));
            }
            return true;
        }
    } catch (error) { logError("daily_addition_limit_check_failed", error); await d.sendMessage(env, chatId, copy.quotaCheckFailed); return true; }
    await d.closePendingSelection(env, userId);
    try {
        if (explicitContext) { await d.saveAndSendWord(env, chatId, userId, word, explicitContext, { sharedCache: false }); return true; }
        const senses = await d.suggestSenses(env, word);
        if (senses.length === 1) { await d.saveAndSendWord(env, chatId, userId, word, senses[0].context_en); return true; }
        const selection = await d.sendMessage(env, chatId, d.senseText(word, senses, 0), d.senseKeyboard(senses, 0));
        await env.DB.prepare(`INSERT INTO pending_words (user_id, source_text, senses_json, chat_id, message_id)
            VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET source_text = excluded.source_text,
            senses_json = excluded.senses_json, chat_id = excluded.chat_id, message_id = excluded.message_id, created_at = CURRENT_TIMESTAMP`)
            .bind(userId, word, JSON.stringify(senses), chatId, selection.message_id).run();
    } catch (error) { logError("add_word_failed", error); await d.sendMessage(env, chatId, copy.addFailed); }
    return true;
}

async function handleBulkCommand(env, text, { chatId, userId }, d, type, copy) {
    const matcher = type === "archive" ? /^\/(?:archive|delete)(?:\s+(.+))?$/i : /^\/restore(?:\s+(.+))?$/i;
    const match = text.match(matcher);
    if (!match) return false;
    const selection = match[1]?.trim().toLowerCase();
    if (!selection) { await d.sendMessage(env, chatId, copy.missing); return true; }
    const active = type === "archive";
    if (selection === "all") {
        const result = await env.DB.prepare(`UPDATE words SET is_active = ?, learned_at = ${active ? "CURRENT_TIMESTAMP" : "NULL"} WHERE user_id = ? AND is_active = ?`)
            .bind(active ? 0 : 1, userId, active ? 1 : 0).run();
        await d.sendMessage(env, chatId, result.meta.changes ? copy.success(result.meta.changes, d.wordCountLabel) : copy.empty);
        return true;
    }
    const range = selection.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!range) { await d.sendMessage(env, chatId, copy.invalid); return true; }
    const start = Number(range[1]); const end = Number(range[2] ?? range[1]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > d.listLimit) { await d.sendMessage(env, chatId, copy.outOfRange); return true; }
    const words = await (active ? d.getRecentActiveWords : d.getRecentArchivedWords)(env, userId);
    if (end > words.length) { await d.sendMessage(env, chatId, copy.shortList(words.length, d.wordCountLabel)); return true; }
    const ids = words.slice(start - 1, end).map((word) => word.id);
    const placeholders = ids.map(() => "?").join(", ");
    const result = await env.DB.prepare(`UPDATE words SET is_active = ?, learned_at = ${active ? "CURRENT_TIMESTAMP" : "NULL"} WHERE user_id = ? AND is_active = ? AND id IN (${placeholders})`)
        .bind(active ? 0 : 1, userId, active ? 1 : 0, ...ids).run();
    await d.sendMessage(env, chatId, result.meta.changes ? copy.success(result.meta.changes, d.wordCountLabel) : copy.unavailable);
    return true;
}

/** Handles vocabulary input and legacy bulk archive/restore commands. */
export async function handleVocabularyTextCommand(env, text, context, dependencies) {
    const copy = contentFor().vocabulary;
    if (text === "/add") { await dependencies.sendMessage(env, context.chatId, copy.addWordHint); return true; }
    if (await handleAdd(env, text, context, dependencies, copy)) return true;
    if (await handleBulkCommand(env, text, context, dependencies, "archive", copy.archive)) return true;
    if (await handleBulkCommand(env, text, context, dependencies, "restore", copy.restore)) return true;
    if (text === "/list") { await dependencies.sendActiveWordList(env, context.chatId, context.userId); return true; }
    if (text === "/archived" || text === "/learned") { await dependencies.sendLearnedWordList(env, context.chatId, context.userId); return true; }
    return false;
}
