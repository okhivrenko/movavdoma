import test from "node:test";
import assert from "node:assert/strict";

import { removeExpiredLearnedWords } from "./learned-word-cleanup.js";

test("learned-word cleanup deletes dependent rows before expired words", async () => {
    const statements = [];
    const env = { DB: {
        prepare: (query) => ({ bind: (...parameters) => ({ query, parameters }) }),
        batch: async (batch) => {
            statements.push(...batch);
            return [{ meta: { changes: 2 } }, { meta: { changes: 2 } }, { meta: { changes: 1 } }];
        },
    } };
    await removeExpiredLearnedWords(env, 30);
    assert.match(statements[0].query, /^DELETE FROM examples/);
    assert.match(statements[1].query, /^DELETE FROM reviews/);
    assert.match(statements[2].query, /^DELETE FROM words/);
    assert.ok(statements.every((statement) => statement.parameters[0] === "-30 days"));
});
