import test from "node:test";
import assert from "node:assert/strict";

import { normalizeSeenWord, recordSeenWord } from "./user-word-history.js";

test("seen-word history uses a stable per-user normalized key", async () => {
    const calls = [];
    const env = { DB: { prepare: (query) => ({ bind: (...parameters) => ({ run: async () => {
        calls.push({ query, parameters });
        return { meta: { changes: 1 } };
    } }) }) } };

    assert.equal(normalizeSeenWord("  ACHIEVEMENT  "), "achievement");
    await recordSeenWord(env, 123, "  ACHIEVEMENT  ");

    assert.match(calls[0].query, /ON CONFLICT\(user_id, normalized_word\)/);
    assert.deepEqual(calls[0].parameters, [123, "achievement"]);
});
