import { editMessageReplyMarkup, sendMessage } from "../../platform/telegram.js";
import { DAILY_WORD_PREFETCH_TARGET, DailyWordContentError } from "./daily-words.js";

const MAX_JOB_ATTEMPTS = 3;
const STALE_JOB_MINUTES = 2;
const COMPLETED_JOB_RETENTION_DAYS = 7;
const PREFETCH_COVERAGE_BATCH_SIZE = 5;

function sqliteTimestampMs(timestamp) {
    if (typeof timestamp !== "string" || !timestamp) return null;
    const parsed = Date.parse(timestamp.includes("T") ? timestamp : `${timestamp.replace(" ", "T")}Z`);
    return Number.isFinite(parsed) ? parsed : null;
}

export async function queueDailyWordPrefetch(env, userId) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO daily_word_prefetch_jobs (user_id) VALUES (?)
    `).bind(userId).run();
    const job = await env.DB.prepare("SELECT status FROM daily_word_prefetch_jobs WHERE user_id = ?")
        .bind(userId).first();
    if (job?.status !== "queued") return false;
    const sent = await env.DAILY_WORD_PREFETCH_JOBS.send({ kind: "daily-word-prefetch", userId });
    console.debug({
        event: "daily_word_prefetch_queued",
        backlogCount: sent?.metadata?.metrics?.backlogCount,
    });
    return true;
}

/** Gradually warms current-level cards for active users without blocking delivery. */
export async function queueDailyWordPrefetchCoverage(env, limit = PREFETCH_COVERAGE_BATCH_SIZE) {
    const candidates = await env.DB.prepare(`
      SELECT u.telegram_user_id AS user_id
      FROM users u
      WHERE u.is_active = 1
        AND u.daily_enabled = 1
        AND u.last_seen_at >= datetime('now', '-30 days')
        AND NOT EXISTS (
          SELECT 1 FROM daily_word_prefetch_jobs j
          WHERE j.user_id = u.telegram_user_id
        )
        AND (
          SELECT COUNT(*) FROM daily_word_prefetches p
          WHERE p.user_id = u.telegram_user_id
            AND p.cefr_level = COALESCE(u.daily_level, 'B1')
        ) < ?
      ORDER BY u.last_seen_at DESC, u.created_at DESC
      LIMIT ?
    `).bind(DAILY_WORD_PREFETCH_TARGET, limit).all();

    let queued = 0;
    for (const candidate of candidates.results ?? []) {
        try {
            if (await queueDailyWordPrefetch(env, candidate.user_id)) queued += 1;
        } catch (error) {
            console.warn({ event: "daily_word_prefetch_coverage_enqueue_failed", message: error instanceof Error ? error.message : "Unknown error" });
        }
    }
    console.info({
        event: "daily_word_prefetch_coverage_checked",
        candidates: candidates.results?.length ?? 0,
        queued,
        target: DAILY_WORD_PREFETCH_TARGET,
    });
    return { candidates: candidates.results?.length ?? 0, queued };
}

export async function processDailyWordPrefetch(env, userId, dependencies) {
    const startedAt = Date.now();
    const claimed = await env.DB.prepare(`
      UPDATE daily_word_prefetch_jobs
      SET status = 'processing', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND status = 'queued'
    `).bind(userId).run();
    if (claimed.meta.changes === 0) return "done";

    const job = await env.DB.prepare("SELECT attempts FROM daily_word_prefetch_jobs WHERE user_id = ?")
        .bind(userId).first();
    try {
        const user = await env.DB.prepare("SELECT daily_level FROM users WHERE telegram_user_id = ? AND is_active = 1").bind(userId).first();
        if (!user) {
            await env.DB.prepare("DELETE FROM daily_word_prefetch_jobs WHERE user_id = ?").bind(userId).run();
            return "done";
        }

        const level = user.daily_level ?? "B1";
        const result = await dependencies.fillDailyWordPrefetches(env, userId, level);
        const currentUser = await env.DB.prepare("SELECT daily_level FROM users WHERE telegram_user_id = ? AND is_active = 1")
            .bind(userId).first();
        const currentLevel = currentUser?.daily_level ?? level;
        const complete = currentLevel === level && result.complete;

        if (complete) {
            await env.DB.prepare("DELETE FROM daily_word_prefetch_jobs WHERE user_id = ?").bind(userId).run();
        } else {
            await env.DB.prepare("UPDATE daily_word_prefetch_jobs SET status = 'queued', attempts = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?")
                .bind(userId).run();
            try {
                await env.DAILY_WORD_PREFETCH_JOBS.send({ kind: "daily-word-prefetch", userId });
            } catch (error) {
                console.warn({ event: "daily_word_prefetch_followup_enqueue_failed", message: error instanceof Error ? error.message : "Unknown error" });
            }
        }
        console.info({ event: "daily_word_prefetch_completed", complete, count: result.count, durationMs: Date.now() - startedAt });
        return "done";
    } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 200) : "Unknown error";
        if (Number(job?.attempts ?? 0) >= MAX_JOB_ATTEMPTS) {
            await env.DB.prepare("DELETE FROM daily_word_prefetch_jobs WHERE user_id = ?").bind(userId).run();
            console.error({ event: "daily_word_prefetch_failed", attempts: job?.attempts ?? 0, durationMs: Date.now() - startedAt, message });
            return "done";
        }
        await env.DB.prepare("UPDATE daily_word_prefetch_jobs SET status = 'queued', updated_at = CURRENT_TIMESTAMP WHERE user_id = ?")
            .bind(userId).run();
        console.warn({ event: "daily_word_prefetch_retry", attempts: job?.attempts ?? 0, durationMs: Date.now() - startedAt, message });
        return "retry";
    }
}

export async function queueNextDailyWord(env, { userId, chatId, messageId, pendingId }) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO daily_word_generation_jobs (user_id, chat_id, message_id, pending_id)
      VALUES (?, ?, ?, ?)
    `).bind(userId, chatId, messageId, pendingId).run();
    const job = await env.DB.prepare(`
      SELECT id, status FROM daily_word_generation_jobs
      WHERE user_id = ? AND status IN ('queued', 'processing')
      ORDER BY id DESC LIMIT 1
    `).bind(userId).first();
    if (!job) throw new Error("Unable to create daily word generation job.");
    if (job.status === "queued") {
        const sent = await env.DAILY_WORD_INTERACTIVE_JOBS.send({ kind: "daily-word-interactive", jobId: job.id });
        console.debug({
            event: "daily_word_navigation_queued",
            jobId: job.id,
            backlogCount: sent?.metadata?.metrics?.backlogCount,
        });
    }
    return job.id;
}

export async function processDailyWordJob(env, jobId, dependencies) {
    const startedAt = Date.now();
    const claimed = await env.DB.prepare(`
      UPDATE daily_word_generation_jobs
      SET status = 'processing', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND (
        status = 'queued'
        OR (status = 'processing' AND updated_at <= datetime('now', '-2 minutes'))
      )
    `).bind(jobId).run();
    if (claimed.meta.changes === 0) return "done";

    let job = null;
    try {
        job = await env.DB.prepare(`
          SELECT id, user_id, chat_id, message_id, pending_id, attempts, created_at
          FROM daily_word_generation_jobs WHERE id = ?
        `).bind(jobId).first();
        if (!job) return "done";
        const createdAtMs = sqliteTimestampMs(job.created_at);
        const jobAgeMs = createdAtMs === null ? null : Math.max(0, startedAt - createdAtMs);
        const shown = await dependencies.sendNextDailyWord(env, job.chat_id, job.user_id, job.pending_id, job.message_id);
        if (!shown) throw new Error("Daily card is no longer available.");
        await env.DB.prepare("UPDATE daily_word_generation_jobs SET status = 'succeeded', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(job.id).run();
        console.info({ event: "daily_word_job_succeeded", jobId: job.id, attempts: job.attempts, jobAgeMs, durationMs: Date.now() - startedAt });
        return "done";
    } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 200) : "Unknown error";
        const attempts = Number(job?.attempts ?? 1);
        const createdAtMs = sqliteTimestampMs(job?.created_at);
        const jobAgeMs = createdAtMs === null ? null : Math.max(0, startedAt - createdAtMs);
        if (attempts >= MAX_JOB_ATTEMPTS) {
            await env.DB.prepare("UPDATE daily_word_generation_jobs SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                .bind(message, jobId).run();
            if (job) {
                await editMessageReplyMarkup(env, job.chat_id, job.message_id, { inline_keyboard: [[{ text: "🔄 Спробувати ще раз", callback_data: `daily:next:${job.pending_id}` }]] });
                await sendMessage(env, job.chat_id, "Не вдалося завантажити слово. Спробуй ще раз.");
            }
            console.error({ event: "daily_word_job_failed", jobId, attempts, jobAgeMs, durationMs: Date.now() - startedAt, message });
            return "done";
        }
        await env.DB.prepare("UPDATE daily_word_generation_jobs SET status = 'queued', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(message, jobId).run();
        const retryKind = error instanceof DailyWordContentError ? "content" : "provider";
        console.warn({ event: "daily_word_job_retry", jobId, attempts, retryKind, jobAgeMs, durationMs: Date.now() - startedAt, message });
        return retryKind === "content" ? "retry-fast" : "retry";
    }
}

export async function requeueDailyWordJobs(env) {
    await env.DB.prepare(`
      UPDATE daily_word_generation_jobs SET status = 'queued', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'processing' AND updated_at <= datetime('now', '-${STALE_JOB_MINUTES} minutes')
    `).run();
    await env.DB.prepare(`
      UPDATE daily_word_prefetch_jobs SET status = 'queued', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'processing' AND updated_at <= datetime('now', '-${STALE_JOB_MINUTES} minutes')
    `).run();
    await env.DB.prepare(`
      DELETE FROM daily_word_generation_jobs
      WHERE status IN ('succeeded', 'failed') AND updated_at <= datetime('now', '-${COMPLETED_JOB_RETENTION_DAYS} days')
    `).run();

    const generationJobs = await env.DB.prepare(`
      SELECT id FROM daily_word_generation_jobs
      WHERE status = 'queued' ORDER BY updated_at ASC LIMIT 10
    `).all();
    for (const job of generationJobs.results ?? []) {
        await env.DAILY_WORD_INTERACTIVE_JOBS.send({ kind: "daily-word-interactive", jobId: job.id });
    }

    const prefetchJobs = await env.DB.prepare(`
      SELECT user_id FROM daily_word_prefetch_jobs
      WHERE status = 'queued' ORDER BY updated_at ASC LIMIT 10
    `).all();
    for (const job of prefetchJobs.results ?? []) {
        await env.DAILY_WORD_PREFETCH_JOBS.send({ kind: "daily-word-prefetch", userId: job.user_id });
    }
}
