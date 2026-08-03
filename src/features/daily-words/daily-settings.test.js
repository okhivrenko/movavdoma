import test from "node:test";
import assert from "node:assert/strict";

import {
    DAILY_LEVEL_OPTIONS,
    DAILY_TIME_OPTIONS,
    dailyLevelKeyboard,
    dailySettingsMenuKeyboard,
    dailySettingsText,
    dailyTimeKeyboard,
} from "./daily-settings.js";

test("daily settings expose every CEFR level and all 24 whole-hour times", () => {
    assert.deepEqual(DAILY_LEVEL_OPTIONS, ["A0", "A1", "A2", "B1", "B2", "C1", "C2"]);
    assert.equal(DAILY_TIME_OPTIONS.length, 24);
    assert.equal(DAILY_TIME_OPTIONS[0], "00:00");
    assert.equal(DAILY_TIME_OPTIONS.at(-1), "23:00");
    assert.equal(dailyTimeKeyboard().inline_keyboard.length, 6);
    assert.deepEqual(dailyLevelKeyboard().inline_keyboard.map((row) => row.length), [4, 3]);
});

test("daily settings menu preserves both choices after any individual change", () => {
    const settings = { daily_time: "19:00", daily_enabled: 0, daily_level: "C2" };
    const keyboard = dailySettingsMenuKeyboard(settings);
    assert.equal(keyboard.inline_keyboard[0][0].callback_data, "dailysettings:time");
    assert.equal(keyboard.inline_keyboard[1][0].callback_data, "dailysettings:level");
    assert.match(dailySettingsText(settings), /вимкнене/);
    assert.match(dailySettingsText(settings), /C2/);
});
