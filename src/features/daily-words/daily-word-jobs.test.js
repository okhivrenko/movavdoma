import test from "node:test";
import assert from "node:assert/strict";

import {
    processDailyWordJob,
    processDailyWordPrefetch,
    queueNextDailyWord,
    queueDailyWordPrefetchCoverage,
    requeueDailyWordJobs,
} from "./daily-word-jobs.js";
import { DailyWordContentError } from "./daily-words.js";

function queueRecorder() {
    const messages = [];
    return {
        messages,
        async send(message) {
            messages.push(message);
            return { metadata: { metrics: { backlogCount: messages.length, backlogBytes: 0 } } };
        },
    };
}

test("an existing queued navigation job is safely redelivered after an ambiguous enqueue failure", async () => {
    const interactive = queueRecorder();
    const env = {
        DAILY_WORD_INTERACTIVE_JOBS: interactive,
        DB: { prepare(query) {
            return { bind: () => ({
                run: async () => ({ meta: { changes: 0 } }),
                first: async () => query.includes("SELECT id, status") ? { id: 7, status: "queued" } : null,
            }) };
        } },
    };

    assert.equal(await queueNextDailyWord(env, { userId: 123, chatId: 123, messageId: 9, pendingId: 42 }), 7);
    assert.deepEqual(interactive.messages, [{ kind: "daily-word-interactive", jobId: 7 }]);
});

test("one prefetch invocation creates at most one card and schedules the next bounded fill", async () => {
    const prefetch = queueRecorder();
    const calls = [];
    let userReads = 0;
    const env = {
        DAILY_WORD_PREFETCH_JOBS: prefetch,
        DB: { prepare(query) {
            return { bind: (...parameters) => ({
                run: async () => {
                    calls.push({ query, parameters });
                    return { meta: { changes: 1 } };
                },
                first: async () => {
                    if (query.includes("SELECT attempts")) return { attempts: 1 };
                    if (query.includes("SELECT daily_level")) {
                        userReads += 1;
                        return { daily_level: "B1" };
                    }
                    return null;
                },
            }) };
        } },
    };
    let fills = 0;
    const result = await processDailyWordPrefetch(env, 123, {
        fillDailyWordPrefetches: async () => {
            fills += 1;
            return { complete: false, count: 1 };
        },
    });

    assert.equal(result, "done");
    assert.equal(fills, 1);
    assert.equal(userReads, 2);
    assert.deepEqual(prefetch.messages, [{ kind: "daily-word-prefetch", userId: 123 }]);
    assert.ok(calls.some((call) => call.query.includes("attempts = 0")));
});

test("the coverage sweep warms a bounded batch of the most recently active users", async () => {
    const prefetch = queueRecorder();
    const calls = [];
    const env = {
        DAILY_WORD_PREFETCH_JOBS: prefetch,
        DB: { prepare(query) {
            return { bind: (...parameters) => ({
                all: async () => {
                    calls.push({ query, parameters });
                    return { results: [{ user_id: 123 }, { user_id: 456 }] };
                },
                run: async () => ({ meta: { changes: 1 } }),
                first: async () => ({ status: "queued" }),
            }) };
        } },
    };

    assert.deepEqual(await queueDailyWordPrefetchCoverage(env), { candidates: 2, queued: 2 });
    assert.deepEqual(calls[0].parameters, [3, 5]);
    assert.match(calls[0].query, /ORDER BY u\.last_seen_at DESC/);
    assert.match(calls[0].query, /u\.daily_enabled = 1/);
    assert.match(calls[0].query, /u\.last_seen_at >= datetime\('now', '-30 days'\)/);
    assert.deepEqual(prefetch.messages, [
        { kind: "daily-word-prefetch", userId: 123 },
        { kind: "daily-word-prefetch", userId: 456 },
    ]);
});

test("prefetch failures stop after the bounded attempt budget", async () => {
    const calls = [];
    const env = {
        DAILY_WORD_PREFETCH_JOBS: queueRecorder(),
        DB: { prepare(query) {
            return { bind: (...parameters) => ({
                run: async () => {
                    calls.push({ query, parameters });
                    return { meta: { changes: 1 } };
                },
                first: async () => query.includes("SELECT attempts") ? { attempts: 3 } : { daily_level: "B1" },
            }) };
        } },
    };
    const result = await processDailyWordPrefetch(env, 123, {
        fillDailyWordPrefetches: async () => { throw new Error("provider unavailable"); },
    });

    assert.equal(result, "done");
    assert.ok(calls.some((call) => call.query.includes("DELETE FROM daily_word_prefetch_jobs")));
});

test("unexpected job reads return the claimed job to the retryable state", async () => {
    const calls = [];
    const env = { DB: { prepare(query) {
        return { bind: (...parameters) => ({
            run: async () => {
                calls.push({ query, parameters });
                return { meta: { changes: 1 } };
            },
            first: async () => { throw new Error("temporary D1 failure"); },
        }) };
    } } };

    assert.equal(await processDailyWordJob(env, 7, {}), "retry");
    assert.ok(calls.some((call) => call.query.includes("SET status = 'queued'")));
});

test("invalid generated content retries without the provider backoff", async () => {
    const env = { DB: { prepare(query) {
        return { bind: () => ({
            run: async () => ({ meta: { changes: 1 } }),
            first: async () => query.includes("SELECT id, user_id") ? {
                id: 7, user_id: 123, chat_id: 123, message_id: 9, pending_id: 42, attempts: 1,
            } : null,
        }) };
    } } };

    assert.equal(await processDailyWordJob(env, 7, {
        sendNextDailyWord: async () => { throw new DailyWordContentError("invalid examples"); },
    }), "retry-fast");
});

test("a duplicate delivery is acknowledged while the original job is still processing", async () => {
    const env = { DB: { prepare(query) {
        return { bind: () => ({
            run: async () => ({ meta: { changes: 0 } }),
        }) };
    } } };

    assert.equal(await processDailyWordJob(env, 7, {}), "done");
});

test("the recovery sweep isolates interactive and background redelivery", async () => {
    const interactive = queueRecorder();
    const prefetch = queueRecorder();
    let reads = 0;
    const env = {
        DAILY_WORD_INTERACTIVE_JOBS: interactive,
        DAILY_WORD_PREFETCH_JOBS: prefetch,
        DB: { prepare() {
            return {
                run: async () => ({ meta: { changes: 0 } }),
                all: async () => {
                    reads += 1;
                    return reads === 1 ? { results: [{ id: 7 }] } : { results: [{ user_id: 123 }] };
                },
            };
        } },
    };

    await requeueDailyWordJobs(env);
    assert.deepEqual(interactive.messages, [{ kind: "daily-word-interactive", jobId: 7 }]);
    assert.deepEqual(prefetch.messages, [{ kind: "daily-word-prefetch", userId: 123 }]);
});
