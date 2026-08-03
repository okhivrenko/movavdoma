import test from "node:test";
import assert from "node:assert/strict";

import {
    MENU_ACTION,
    mainKeyboard,
    menuActionFromText,
    shouldClearPendingFeedback,
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
});
