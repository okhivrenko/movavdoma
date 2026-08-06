import { editMessageReplyMarkup, sendMessage } from "../../platform/telegram.js";

const MAX_JOB_ATTEMPTS = 3;

export async function queueDailyWordPrefetch(env, userId) {
    const inserted = await env.DB.prepare(`
      INSERT OR IGNORE INTO daily_word_prefetch_jobs (user_id) VALUES (?)
    `).bind(userId).run();
    if (inserted.meta.changes > 0) await env.DAILY_WORD_JOBS.send({ kind: "prefetch", userId });
}

export async function processDailyWordPrefetch(env, userId, dependencies) {
    const claimed = await env.DB.prepare(`
      UPDATE daily_word_prefetch_jobs SET status = 'processing', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND status = 'queued'
    `).bind(userId).run();
    if (claimed.meta.changes === 0) return "done";
    try {
        const user = await env.DB.prepare("SELECT daily_level FROM users WHERE telegram_user_id = ? AND is_active = 1").bind(userId).first();
        if (user) await dependencies.fillDailyWordPrefetches(env, userId, user.daily_level ?? "B1");
        await env.DB.prepare("DELETE FROM daily_word_prefetch_jobs WHERE user_id = ?").bind(userId).run();
        console.info({ event: "daily_word_prefetch_completed", userId });
        return "done";
    } catch (error) {
        await env.DB.prepare("UPDATE daily_word_prefetch_jobs SET status = 'queued', updated_at = CURRENT_TIMESTAMP WHERE user_id = ?").bind(userId).run();
        console.warn({ event: "daily_word_prefetch_retry", userId, message: error instanceof Error ? error.message : "Unknown error" });
        return "retry";
    }
}

export async function requeueDailyWordPrefetches(env) {
    const jobs = await env.DB.prepare("SELECT user_id FROM daily_word_prefetch_jobs WHERE status = 'queued' ORDER BY updated_at ASC LIMIT 10").all();
    for (const job of jobs.results ?? []) await env.DAILY_WORD_JOBS.send({ kind: "prefetch", userId: job.user_id });
}

export async function queueNextDailyWord(env, { userId, chatId, messageId, pendingId }) {
    const inserted = await env.DB.prepare(`
      INSERT OR IGNORE INTO daily_word_generation_jobs (user_id, chat_id, message_id, pending_id)
      VALUES (?, ?, ?, ?)
    `).bind(userId, chatId, messageId, pendingId).run();
    const job = await env.DB.prepare(`
      SELECT id FROM daily_word_generation_jobs
      WHERE user_id = ? AND pending_id = ? AND status IN ('queued', 'processing')
      ORDER BY id DESC LIMIT 1
    `).bind(userId, pendingId).first();
    if (!job) throw new Error("Unable to create daily word generation job.");
    if (inserted.meta.changes > 0) await env.DAILY_WORD_JOBS.send({ jobId: job.id });
    return job.id;
}

export async function processDailyWordJob(env, jobId, dependencies) {
    const claimed = await env.DB.prepare(`
      UPDATE daily_word_generation_jobs
      SET status = 'processing', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'queued'
    `).bind(jobId).run();
    if (claimed.meta.changes === 0) return "done";
    const job = await env.DB.prepare(`
      SELECT id, user_id, chat_id, message_id, pending_id, attempts
      FROM daily_word_generation_jobs WHERE id = ?
    `).bind(jobId).first();
    if (!job) return "done";
    try {
        const shown = await dependencies.sendNextDailyWord(env, job.chat_id, job.user_id, job.pending_id, job.message_id);
        if (!shown) throw new Error("Daily card is no longer available.");
        await env.DB.prepare("UPDATE daily_word_generation_jobs SET status = 'succeeded', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(job.id).run();
        console.info({ event: "daily_word_job_succeeded", jobId: job.id, attempts: job.attempts });
        return "done";
    } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 200) : "Unknown error";
        if (job.attempts >= MAX_JOB_ATTEMPTS) {
            await env.DB.prepare("UPDATE daily_word_generation_jobs SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                .bind(message, job.id).run();
            await editMessageReplyMarkup(env, job.chat_id, job.message_id, { inline_keyboard: [[{ text: "🔄 Спробувати ще раз", callback_data: `daily:next:${job.pending_id}` }]] });
            await sendMessage(env, job.chat_id, "Не вдалося завантажити слово. Спробуй ще раз.");
            console.error({ event: "daily_word_job_failed", jobId: job.id, attempts: job.attempts, message });
            return "done";
        }
        await env.DB.prepare("UPDATE daily_word_generation_jobs SET status = 'queued', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(message, job.id).run();
        console.warn({ event: "daily_word_job_retry", jobId: job.id, attempts: job.attempts, message });
        return "retry";
    }
}
