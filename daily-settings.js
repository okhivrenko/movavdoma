import { answerCallbackQuery, editMessage, sendMessage } from "./telegram.js";
import { DEFAULT_DAILY_SETTINGS } from "./helpers.js";

// The settings UI is intentionally independent from daily-card delivery.
// Callback routing remains in worker.js, which validates every user action.
export const DAILY_TIME_OPTIONS = Object.freeze(
    Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`)
);
export const DAILY_LEVEL_OPTIONS = Object.freeze(["A0", "A1", "A2", "B1", "B2", "C1", "C2"]);

export function dailySettingsMenuKeyboard(settings) {
    return {
        inline_keyboard: [
            [{ text: `🕒 Час: ${settings.daily_time}`, callback_data: "dailysettings:time" }],
            [{ text: `🎚 Рівень: ${settings.daily_level}`, callback_data: "dailysettings:level" }],
            [{
                text: settings.daily_enabled ? "🔕 Вимкнути нагадування" : "🔔 Увімкнути нагадування",
                callback_data: "daily:off",
            }],
        ],
    };
}

export function dailyTimeKeyboard() {
    const rows = [];
    for (let index = 0; index < DAILY_TIME_OPTIONS.length; index += 4) {
        rows.push(DAILY_TIME_OPTIONS.slice(index, index + 4).map((dailyTime) => ({
            text: dailyTime,
            callback_data: `dailytime:${dailyTime}`,
        })));
    }
    return { inline_keyboard: rows };
}

export function dailyLevelKeyboard() {
    return {
        inline_keyboard: [
            DAILY_LEVEL_OPTIONS.slice(0, 4).map((level) => ({ text: level, callback_data: `dailylevel:${level}` })),
            DAILY_LEVEL_OPTIONS.slice(4).map((level) => ({ text: level, callback_data: `dailylevel:${level}` })),
        ],
    };
}

export async function getDailySettings(env, userId) {
    return env.DB.prepare(
        "SELECT daily_time, daily_enabled, daily_level FROM users WHERE telegram_user_id = ?"
    ).bind(userId).first();
}

export function dailySettingsText(settings) {
    const status = settings?.daily_enabled ? `увімкнене о ${settings.daily_time}` : "вимкнене";
    return `Щоденне слово зараз ${status}. Рівень: ${settings?.daily_level ?? "B1"}.\n\nОбери, що налаштувати:`;
}

export async function sendDailySettings(env, chatId, userId) {
    const settings = await getDailySettings(env, userId);
    await sendMessage(env, chatId, dailySettingsText(settings), dailySettingsMenuKeyboard(settings ?? DEFAULT_DAILY_SETTINGS));
}

export async function refreshDailySettings(env, chatId, messageId, userId) {
    const settings = await getDailySettings(env, userId) ?? DEFAULT_DAILY_SETTINGS;
    await editMessage(env, chatId, messageId, dailySettingsText(settings), dailySettingsMenuKeyboard(settings));
}

/** Handles the settings-only callback namespaces after the private-chat gate. */
export async function handleDailySettingsCallback(env, callback, context) {
    const { chatId, messageId, userId } = context;
    if (callback.data === "dailysettings:time") {
        await answerCallbackQuery(env, callback.id, "Обери час.");
        await editMessage(env, chatId, messageId, "🕒 Обери час щоденного слова:", dailyTimeKeyboard());
        return true;
    }
    if (callback.data === "dailysettings:level") {
        await answerCallbackQuery(env, callback.id, "Обери рівень.");
        await editMessage(env, chatId, messageId, "🎚 Обери рівень нових слів:", dailyLevelKeyboard());
        return true;
    }
    if (callback.data === "daily:off") {
        await env.DB.prepare("UPDATE users SET daily_enabled = CASE WHEN daily_enabled = 1 THEN 0 ELSE 1 END WHERE telegram_user_id = ?")
            .bind(userId).run();
        await answerCallbackQuery(env, callback.id, "Налаштування оновлено.");
        await refreshDailySettings(env, chatId, messageId, userId);
        return true;
    }
    if (callback.data.startsWith("dailylevel:")) {
        const level = callback.data.replace("dailylevel:", "");
        if (!DAILY_LEVEL_OPTIONS.includes(level)) {
            await answerCallbackQuery(env, callback.id, "Невірний рівень.");
            return true;
        }
        await env.DB.prepare("UPDATE users SET daily_level = ? WHERE telegram_user_id = ?").bind(level, userId).run();
        await answerCallbackQuery(env, callback.id, "Рівень збережено.");
        await refreshDailySettings(env, chatId, messageId, userId);
        return true;
    }
    if (!callback.data.startsWith("dailytime:")) return false;
    const dailyTime = callback.data.replace("dailytime:", "");
    if (!DAILY_TIME_OPTIONS.includes(dailyTime)) {
        await answerCallbackQuery(env, callback.id, "Невірний час.");
        return true;
    }
    await env.DB.prepare(`
      UPDATE users SET daily_time = ?, daily_enabled = 1 WHERE telegram_user_id = ?
    `).bind(dailyTime, userId).run();
    await answerCallbackQuery(env, callback.id, "Час збережено.");
    await refreshDailySettings(env, chatId, messageId, userId);
    return true;
}
