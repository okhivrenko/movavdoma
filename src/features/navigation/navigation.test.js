import test from "node:test";
import assert from "node:assert/strict";

import {
    MENU_ACTION,
    mainKeyboard,
    menuActionFromText,
    shouldClearPendingFeedback,
    handleNavigationMessage,
} from "./navigation.js";

test("navigation resolves Ukrainian button text to stable internal actions", () => {
    assert.equal(menuActionFromText("➕ Додати слово"), MENU_ACTION.ADD_WORD);
    assert.equal(menuActionFromText("⏰ Розклад і рівень (10:00 — Рівень A0)"), MENU_ACTION.SETTINGS);
    assert.equal(menuActionFromText("невідома кнопка"), null);
});

test("navigation keyboard and feedback cancellation retain current Ukrainian UI", () => {
    const keyboard = mainKeyboard(false, 1, { daily_time: "18:00", daily_enabled: 1, daily_level: "C1" });
    assert.deepEqual(keyboard.keyboard[0].map((button) => button.text), ["➕ Додати слово", "📚 Мої слова"]);
    assert.equal(shouldClearPendingFeedback("💬 Відгук"), false);
    assert.equal(shouldClearPendingFeedback("📚 Мої слова"), true);
    assert.equal(menuActionFromText("📤 Поділитися ботом"), MENU_ACTION.SHARE_BOT);
    const secondPage = mainKeyboard(false, 2, { daily_time: "18:00", daily_enabled: 1, daily_level: "C1" });
    assert.ok(secondPage.keyboard.flat().some((button) => button.text === "📤 Поділитися ботом"));
});

test("share action sends a native Telegram share button and a copyable link", async () => {
    const messages = [];
    const handled = await handleNavigationMessage({}, "📤 Поділитися ботом", { chatId: 123, userId: 123 }, {
        getBotLink: async () => "https://t.me/movayakvdoma_bot",
        sendMessage: async (_env, _chatId, text, keyboard) => messages.push({ text, keyboard }),
        logError: () => assert.fail("share link should be available"),
    });
    assert.equal(handled, true);
    assert.match(messages[0].text, /https:\/\/t\.me\/movayakvdoma_bot/);
    assert.match(messages[0].keyboard.inline_keyboard[0][0].url, /^https:\/\/t\.me\/share\/url\?/);
});
