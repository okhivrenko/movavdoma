import test from "node:test";
import assert from "node:assert/strict";

import worker from "./worker.js";
import {
    captureTelegramCalls,
    privateCallbackUpdate,
    privateMessageUpdate,
    telegramCall,
    WorkerTestDb,
    workerEnv,
} from "./test-support/worker-test-helpers.js";

function webhookRequest(update, secret = "test-webhook-secret") {
    return new Request("https://example.test/", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "X-Telegram-Bot-Api-Secret-Token": secret,
        },
        body: JSON.stringify(update),
    });
}

test("Worker exposes the landing and privacy page without accepting an unauthenticated webhook", async () => {
    const db = new WorkerTestDb();
    const env = workerEnv(db);

    const landing = await worker.fetch(new Request("https://example.test/"), env);
    assert.equal(landing.status, 200);
    assert.match(await landing.text(), /Вивчай англійські слова легко та щодня — у Telegram/);
    assert.match(landing.headers.get("content-security-policy"), /default-src 'none'/);
    assert.equal(landing.headers.get("x-content-type-options"), "nosniff");

    const httpLanding = await worker.fetch(new Request("http://example.test/"), env);
    assert.equal(httpLanding.status, 301);
    assert.equal(httpLanding.headers.get("location"), "https://example.test/");

    const privacy = await worker.fetch(new Request("https://example.test/privacy"), env);
    assert.equal(privacy.status, 200);
    assert.match(await privacy.text(), /Privacy Policy for MovaYakVDoma/);

    const denied = await worker.fetch(
        webhookRequest(privateMessageUpdate({ text: "/start" }), "wrong-secret"),
        env
    );
    assert.equal(denied.status, 401);
    assert.equal(db.calls.length, 0);
});

test("/start shows the saved schedule and the first menu page", async () => {
    const db = new WorkerTestDb({
        dailySettings: { daily_time: "18:00", daily_enabled: 1, daily_level: "C1" },
    });

    const { response, calls } = await captureTelegramCalls(() => worker.fetch(
        webhookRequest(privateMessageUpdate({ text: "/start" })),
        workerEnv(db)
    ));

    assert.equal(response.status, 200);
    const message = telegramCall(calls, "sendMessage");
    assert.match(message.text, /Нагадування: щодня о 18:00/i);
    assert.match(message.text, /Рівень щоденних слів: C1/);
    assert.deepEqual(
        message.reply_markup.keyboard[0].map((button) => button.text),
        ["➕ Додати слово", "📚 Мої слова"]
    );
    assert.deepEqual(
        message.reply_markup.keyboard[2].map((button) => button.text),
        ["🌐 Перекласти текст", "⏰ Налаштування\n(18:00 - C1)"]
    );
    assert.ok(db.calls.some((call) => call.query?.includes("last_seen_at")));
});

test("/menu and Ukrainian menu buttons use navigation routing", async () => {
    const db = new WorkerTestDb();
    const env = workerEnv(db);

    const menu = await captureTelegramCalls(() => worker.fetch(
        webhookRequest(privateMessageUpdate({ updateId: 20, text: "/menu" })), env
    ));
    assert.equal(telegramCall(menu.calls, "sendMessage").text, "Ось меню:");

    const nextPage = await captureTelegramCalls(() => worker.fetch(
        webhookRequest(privateMessageUpdate({ updateId: 21, text: "➡️ Далі" })), env
    ));
    assert.equal(telegramCall(nextPage.calls, "sendMessage").text, "Додаткові можливості:");
    assert.deepEqual(
        telegramCall(nextPage.calls, "sendMessage").reply_markup.keyboard[0].map((button) => button.text),
        ["☕ Підтримати бот", "🎁 Отримати бонус"]
    );

    const translate = await captureTelegramCalls(() => worker.fetch(
        webhookRequest(privateMessageUpdate({ updateId: 211, text: "🌐 Перекласти текст" })), env
    ));
    const translationMenu = telegramCall(translate.calls, "sendMessage");
    assert.match(translationMenu.text, /Обери напрям перекладу/);
    assert.deepEqual(
        translationMenu.reply_markup.inline_keyboard.map(([button]) => button.callback_data),
        ["translate:uk:en", "translate:en:uk"]
    );

    const feedbackClearCount = db.calls.filter((call) => call.query?.includes("feedback_pending = 0")).length;
    const feedback = await captureTelegramCalls(() => worker.fetch(
        webhookRequest(privateMessageUpdate({ updateId: 22, text: "💬 Відгук" })), env
    ));
    assert.match(telegramCall(feedback.calls, "sendMessage").text, /Напиши одним повідомленням/);
    assert.equal(db.calls.filter((call) => call.query?.includes("feedback_pending = 0")).length, feedbackClearCount);
});

test("daily settings can be changed in two steps and keep the settings menu visible", async () => {
    const db = new WorkerTestDb({
        dailySettings: { timezone: "Europe/Kyiv", daily_time: "10:00", daily_enabled: 1, daily_level: "A0" },
        interfaceVersion: 12,
    });
    const env = workerEnv(db);

    const opened = await captureTelegramCalls(() => worker.fetch(
        webhookRequest(privateMessageUpdate({ updateId: 1, text: "⏰ Налаштування\n(10:00 - A0)" })),
        env
    ));
    const settingsMessage = telegramCall(opened.calls, "sendMessage");
    assert.equal(settingsMessage.reply_markup.inline_keyboard[0][0].callback_data, "dailysettings:time");
    assert.equal(settingsMessage.reply_markup.inline_keyboard[1][0].callback_data, "dailysettings:level");
    assert.equal(settingsMessage.reply_markup.inline_keyboard[2][0].callback_data, "dailysettings:timezone");

    const chooseTime = await captureTelegramCalls(() => worker.fetch(
        webhookRequest(privateCallbackUpdate({ updateId: 2, data: "dailysettings:time" })),
        env
    ));
    const timePicker = telegramCall(chooseTime.calls, "editMessageText");
    assert.equal(timePicker.reply_markup.inline_keyboard[0][0].callback_data, "dailytime:00:00");

    const savedTime = await captureTelegramCalls(() => worker.fetch(
        webhookRequest(privateCallbackUpdate({ updateId: 3, data: "dailytime:19:00" })),
        env
    ));
    const refreshedMenu = telegramCall(savedTime.calls, "editMessageText");
    assert.equal(db.dailySettings.daily_time, "19:00");
    assert.equal(refreshedMenu.reply_markup.inline_keyboard[1][0].callback_data, "dailysettings:level");

    const savedLevel = await captureTelegramCalls(() => worker.fetch(
        webhookRequest(privateCallbackUpdate({ updateId: 4, data: "dailylevel:C2" })),
        env
    ));
    const refreshedAfterLevel = telegramCall(savedLevel.calls, "editMessageText");
    assert.equal(db.dailySettings.daily_level, "C2");
    assert.equal(refreshedAfterLevel.reply_markup.inline_keyboard[0][0].callback_data, "dailysettings:time");

    const chooseTimezone = await captureTelegramCalls(() => worker.fetch(
        webhookRequest(privateCallbackUpdate({ updateId: 5, data: "dailysettings:timezone" })), env
    ));
    const timezonePicker = telegramCall(chooseTimezone.calls, "editMessageText");
    assert.equal(timezonePicker.reply_markup.inline_keyboard[0][0].callback_data, "dailytimezone:America/Los_Angeles");

    const savedTimezone = await captureTelegramCalls(() => worker.fetch(
        webhookRequest(privateCallbackUpdate({ updateId: 6, data: "dailytimezone:America/New_York" })), env
    ));
    assert.equal(db.dailySettings.timezone, "America/New_York");
    assert.match(telegramCall(savedTimezone.calls, "editMessageText").text, /Нью-Йорк/);

    const timezoneUpdates = db.calls.filter((call) => call.query?.includes("UPDATE users SET timezone")).length;
    await captureTelegramCalls(() => worker.fetch(
        webhookRequest(privateCallbackUpdate({ updateId: 7, data: "dailytimezone:Etc/Unknown" })), env
    ));
    assert.equal(db.calls.filter((call) => call.query?.includes("UPDATE users SET timezone")).length, timezoneUpdates);
});

test("duplicate Telegram updates are idempotent and group chats are ignored", async () => {
    const db = new WorkerTestDb();
    const env = workerEnv(db);
    const update = privateMessageUpdate({ updateId: 11, text: "/start" });

    const first = await captureTelegramCalls(() => worker.fetch(webhookRequest(update), env));
    const second = await captureTelegramCalls(() => worker.fetch(webhookRequest(update), env));
    assert.equal(first.calls.length, 1);
    assert.equal(second.calls.length, 0);

    const callback = await captureTelegramCalls(() => worker.fetch(
        webhookRequest(privateCallbackUpdate({ updateId: 13, data: "dailysettings:time" })), env
    ));
    assert.equal(callback.response.status, 200);
    assert.equal(db.lastSeenUpdates, 1);

    const groupUpdate = {
        update_id: 12,
        message: { chat: { id: -100, type: "group" }, from: { id: 123 }, text: "/start" },
    };
    const group = await captureTelegramCalls(() => worker.fetch(webhookRequest(groupUpdate), env));
    assert.equal(group.calls.length, 0);
});

test("callback interactions fill missing Telegram profile fields without overwriting existing data", async () => {
    const db = new WorkerTestDb({ interfaceVersion: 12 });
    const { response } = await captureTelegramCalls(() => worker.fetch(
        webhookRequest(privateCallbackUpdate({
            updateId: 14,
            data: "dailysettings:time",
            username: null,
            firstName: "Ірина",
        })),
        workerEnv(db)
    ));

    assert.equal(response.status, 200);
    const profileUpdate = db.calls.find((call) =>
        call.method === "run" && call.query?.includes("telegram_first_name = CASE")
    );
    assert.ok(profileUpdate);
    assert.match(profileUpdate.query, /NULLIF\(TRIM\(telegram_username\), ''\) IS NULL/);
    assert.match(profileUpdate.query, /NULLIF\(TRIM\(telegram_first_name\), ''\) IS NULL/);
    assert.deepEqual(profileUpdate.parameters, [null, "Ірина", 123]);
});
