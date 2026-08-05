import test from "node:test";
import assert from "node:assert/strict";

import { handleAdminCommand } from "./admin-commands.js";

test("only an admin can request the grouped acquisition-source summary", async () => {
    const summaries = [];
    const sent = [];
    const dependencies = {
        isAdmin: (_env, userId) => userId === 999,
        sendAcquisitionSourceSummary: async (...args) => summaries.push(args),
    };

    assert.equal(
        await handleAdminCommand({}, "/sources", { chatId: 42, userId: 999 }, dependencies),
        true
    );
    assert.deepEqual(summaries, [[{}, 42]]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, options) => {
        sent.push(JSON.parse(options.body));
        return new Response(JSON.stringify({ ok: true, result: {} }));
    };
    try {
        assert.equal(
            await handleAdminCommand({ TELEGRAM_BOT_TOKEN: "test-token" }, "/sources", { chatId: 42, userId: 123 }, dependencies),
            true
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
    assert.equal(summaries.length, 1);
    assert.match(sent[0].text, /доступна лише адміну/);
});
