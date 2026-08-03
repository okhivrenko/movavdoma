import test from "node:test";
import assert from "node:assert/strict";
import { adminDonationKeyboard } from "../donation-notifications.js";

test("donation review keyboard preserves stable admin callback formats", () => {
    const keyboard = adminDonationKeyboard(42, 2).inline_keyboard.flat();
    assert.ok(keyboard.some((button) => button.callback_data === "bonus:level:2:42"));
    assert.ok(keyboard.some((button) => button.callback_data === "bonus:reject:42"));
});
