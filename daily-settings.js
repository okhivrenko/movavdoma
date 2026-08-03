import { editMessage, sendMessage } from "./telegram.js";
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
