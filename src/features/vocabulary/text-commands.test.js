import test from "node:test";
import assert from "node:assert/strict";

import { handleVocabularyTextCommand } from "./text-commands.js";

function dependencies(overrides = {}) {
    return {
        sendMessage: async (_env, _chatId, text) => { overrides.sent?.push(text); },
        parseVocabularyInput: (value) => ({ word: value, explicitContext: "" }),
        claimDailyWordAddition: async () => true,
        getDailyAdditionLimit: async () => 10,
        dailyLimitReachedText: () => "limit",
        sendLimitReachedOptions: async () => {},
        closePendingSelection: async () => {}, saveAndSendWord: async () => {}, suggestSenses: async () => [],
        senseText: () => "", senseKeyboard: () => ({}), wordCountLabel: () => "слів", listLimit: 10,
        getRecentActiveWords: async () => [], getRecentArchivedWords: async () => [],
        sendActiveWordList: async () => {}, sendLearnedWordList: async () => {}, ...overrides,
    };
}

test("vocabulary text commands reject non-English input before claiming quota", async () => {
    const sent = []; let claimed = false;
    const handled = await handleVocabularyTextCommand({}, "привіт", { chatId: 1, userId: 2 }, dependencies({
        sent, claimDailyWordAddition: async () => { claimed = true; return true; },
    }));
    assert.equal(handled, true);
    assert.equal(claimed, false);
    assert.match(sent[0], /англійське слово/i);
});

test("an explicitly supplied context is never written to the shared card cache", async () => {
    let saved;
    const handled = await handleVocabularyTextCommand({}, "/add charge / payment for a service", { chatId: 1, userId: 2 }, dependencies({
        parseVocabularyInput: () => ({ word: "charge", explicitContext: "payment for a service" }),
        saveAndSendWord: async (...arguments_) => { saved = arguments_; },
    }));
    assert.equal(handled, true);
    assert.deepEqual(saved.slice(3), ["charge", "payment for a service", { sharedCache: false }]);
});

test("a reached addition limit offers the combined growth options", async () => {
    const options = [];
    const handled = await handleVocabularyTextCommand({}, "resilient", { chatId: 1, userId: 2 }, dependencies({
        claimDailyWordAddition: async () => false,
        getDailyAdditionLimit: async () => 15,
        sendLimitReachedOptions: async (...args) => options.push(args),
    }));
    assert.equal(handled, true);
    assert.deepEqual(options, [[{}, 1, 2, 15]]);
});

test("archive all binds its owner and never interpolates user data", async () => {
    const calls = []; const sent = [];
    const env = { DB: { prepare(query) { calls.push(query); return { bind(...values) { return { run: async () => ({ meta: { changes: 2 }, values }) }; } }; } } };
    const handled = await handleVocabularyTextCommand(env, "/archive all", { chatId: 1, userId: 42 }, dependencies({ sent }));
    assert.equal(handled, true);
    assert.match(calls[0], /WHERE user_id = \? AND is_active = \?/);
    assert.match(sent[0], /2 слів/);
});
