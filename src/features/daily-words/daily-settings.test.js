import test from "node:test";
import assert from "node:assert/strict";

import {
    DAILY_LEVEL_OPTIONS,
    DAILY_TIME_OPTIONS,
    DAILY_TIMEZONE_OPTIONS,
    dailyLevelKeyboard,
    dailySettingsMenuKeyboard,
    dailySettingsText,
    dailyTimeKeyboard,
    dailyTimezoneKeyboard,
    timezoneDisplayLabel,
    timezoneGmtOffset,
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
    const settings = { timezone: "Europe/Kyiv", daily_time: "19:00", daily_enabled: 0, daily_level: "C2" };
    const keyboard = dailySettingsMenuKeyboard(settings);
    assert.equal(keyboard.inline_keyboard[0][0].callback_data, "dailysettings:time");
    assert.equal(keyboard.inline_keyboard[1][0].callback_data, "dailysettings:level");
    assert.equal(keyboard.inline_keyboard[2][0].callback_data, "dailysettings:timezone");
    assert.match(dailySettingsText(settings), /вимкнене/);
    assert.match(dailySettingsText(settings), /C2/);
    assert.match(dailySettingsText(settings), /Київ/);
});

test("timezone picker paginates whitelisted IANA zones", () => {
    assert.equal(DAILY_TIMEZONE_OPTIONS[0].id, "Europe/Kyiv");
    assert.ok(DAILY_TIMEZONE_OPTIONS.length > 20);
    assert.deepEqual(
        dailyTimezoneKeyboard().inline_keyboard[0].map((button) => button.callback_data),
        ["dailytimezone:Europe/Kyiv"]
    );
    const secondPage = dailyTimezoneKeyboard(1).inline_keyboard;
    assert.ok(secondPage.flat().some((button) => button.callback_data === "dailytimezonepage:0"));
    assert.ok(secondPage.flat().some((button) => button.callback_data === "dailytimezonepage:2"));
});

test("timezone labels show the current offset and preserve non-whole-hour offsets", () => {
    assert.equal(timezoneGmtOffset("Europe/Kyiv", new Date("2026-01-15T12:00:00Z")), "GMT+2");
    assert.equal(timezoneGmtOffset("Europe/Kyiv", new Date("2026-08-04T12:00:00Z")), "GMT+3");
    assert.equal(timezoneGmtOffset("Asia/Kolkata", new Date("2026-08-04T12:00:00Z")), "GMT+5:30");
    assert.equal(
        timezoneDisplayLabel("Europe/Kyiv", new Date("2026-01-15T12:00:00Z")),
        "🇺🇦 Київ · Europe/Kyiv (GMT+2)"
    );
});
