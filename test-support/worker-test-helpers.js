import assert from "node:assert/strict";

/**
 * A deliberately small D1 double for HTTP-level Worker tests. It implements
 * only the statements exercised by the test and records every query, which
 * keeps tests independent from Cloudflare and production data.
 */
export class WorkerTestDb {
    constructor({ dailySettings, interfaceVersion = 9, existingUsers = [] } = {}) {
        this.dailySettings = dailySettings ?? {
            timezone: "Europe/Kyiv",
            daily_time: "10:00",
            daily_enabled: 1,
            daily_level: "A0",
        };
        this.interfaceVersion = interfaceVersion;
        this.lastSeenUpdates = 0;
        this.processedUpdates = new Set();
        this.existingUsers = new Set(existingUsers);
        this.calls = [];
    }

    prepare(query) {
        return {
            bind: (...parameters) => ({
                first: async () => this.first(query, parameters),
                all: async () => this.all(query, parameters),
                run: async () => this.run(query, parameters),
            }),
        };
    }

    async first(query, parameters = []) {
        this.calls.push({ method: "first", query, parameters });

        if (query.includes("SELECT telegram_user_id FROM users")) {
            return this.existingUsers.has(parameters[0]) ? { telegram_user_id: parameters[0] } : null;
        }
        if (query.includes("SELECT timezone FROM users")) {
            return { timezone: this.dailySettings.timezone };
        }

        if (query.includes("SELECT interface_version FROM users")) {
            return { interface_version: this.interfaceVersion };
        }
        if (query.includes("SELECT timezone, daily_time, daily_enabled, daily_level FROM users")) {
            return { ...this.dailySettings };
        }
        if (query.includes("SELECT feedback_pending, feedback_kind FROM users")) {
            return { feedback_pending: 0, feedback_kind: "feedback" };
        }

        throw new Error(`Unexpected D1 first query: ${query}`);
    }

    async all(query) {
        this.calls.push({ method: "all", query });
        throw new Error(`Unexpected D1 all query: ${query}`);
    }

    async run(query, parameters) {
        this.calls.push({ method: "run", query, parameters });

        if (query.includes("INSERT OR IGNORE INTO processed_updates")) {
            const updateId = parameters[0];
            const changes = this.processedUpdates.has(updateId) ? 0 : 1;
            this.processedUpdates.add(updateId);
            return { meta: { changes } };
        }
        if (query.includes("INSERT INTO users")) {
            this.existingUsers.add(parameters[0]);
            return { meta: { changes: 1 } };
        }
        if (query.includes("INSERT OR IGNORE INTO referral_rewards")) return { meta: { changes: 1 } };
        if (query.includes("UPDATE users SET interface_version")) {
            this.interfaceVersion = parameters[0];
            return { meta: { changes: 1 } };
        }
        if (query.includes("last_seen_at = CURRENT_TIMESTAMP")) {
            this.lastSeenUpdates += 1;
            return { meta: { changes: 1 } };
        }
        if (query.includes("UPDATE users SET feedback_pending = 0")) {
            return { meta: { changes: 0 } };
        }
        if (query.includes("DELETE FROM pending_text_translations")) {
            return { meta: { changes: 0 } };
        }
        if (query.includes("UPDATE users SET feedback_pending = 1")) {
            return { meta: { changes: 1 } };
        }
        if (query.includes("INSERT INTO user_messages")) return { meta: { changes: 1 } };
        if (query.includes("UPDATE users SET daily_level")) {
            this.dailySettings.daily_level = parameters[0];
            return { meta: { changes: 1 } };
        }
        if (query.includes("UPDATE users SET timezone")) {
            this.dailySettings.timezone = parameters[0];
            return { meta: { changes: 1 } };
        }
        if (query.includes("SET daily_time = ?, daily_enabled = 1")) {
            this.dailySettings.daily_time = parameters[0];
            this.dailySettings.daily_enabled = 1;
            return { meta: { changes: 1 } };
        }
        if (query.includes("SET daily_enabled = CASE")) {
            this.dailySettings.daily_enabled = this.dailySettings.daily_enabled ? 0 : 1;
            return { meta: { changes: 1 } };
        }

        throw new Error(`Unexpected D1 run query: ${query}`);
    }
}

export function workerEnv(db) {
    return {
        DB: db,
        TELEGRAM_BOT_TOKEN: "test-token",
        TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret",
        ADMIN_TELEGRAM_USER_ID: "999",
        BOT_BRAND_NAME: "MovaYakVDoma",
        PUBLIC_WORKER_URL: "https://example.test",
        MONOBANK_JAR_SEND_ID: "test-jar-id",
    };
}

export function privateMessageUpdate({ updateId = 1, userId = 123, chatId = userId, text }) {
    return {
        update_id: updateId,
        message: {
            chat: { id: chatId, type: "private" },
            from: { id: userId },
            text,
        },
    };
}

export function privateCallbackUpdate({
    updateId = 1,
    userId = 123,
    chatId = userId,
    data,
    username = "olena",
    firstName = "Олена",
}) {
    return {
        update_id: updateId,
        callback_query: {
            id: `callback-${updateId}`,
            from: { id: userId, username, first_name: firstName },
            data,
            message: { message_id: 7, chat: { id: chatId, type: "private" } },
        },
    };
}

export async function captureTelegramCalls(action) {
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, options) => {
        calls.push({ url: String(url), payload: JSON.parse(options.body) });
        return new Response(JSON.stringify({ ok: true, result: {} }));
    };

    try {
        const response = await action();
        return { response, calls };
    } finally {
        globalThis.fetch = originalFetch;
    }
}

export function telegramCall(calls, method) {
    const call = calls.find((item) => item.url.endsWith(`/${method}`));
    assert.ok(call, `Expected Telegram ${method} call`);
    return call.payload;
}
