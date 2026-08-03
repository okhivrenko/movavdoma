import test from "node:test";
import assert from "node:assert/strict";

import { messages } from "../src/domain/messages.js";

test("admin settings notice names both user-facing limits without exposing access level", () => {
    const text = messages.adminSettingsUpdated(25, 15);

    assert.match(text, /налаштування змінено адміністратором/);
    assert.match(text, /додавати до 25 слів/);
    assert.match(text, /переглядати до 15 щоденних слів/);
    assert.doesNotMatch(text, /рівень доступу/i);
});
