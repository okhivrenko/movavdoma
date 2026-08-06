import { answerCallbackQuery, editMessage, sendMessage } from "../../platform/telegram.js";
import { DEFAULT_DAILY_SETTINGS } from "../../domain/helpers.js";

// The settings UI is intentionally independent from daily-card delivery.
// Callback routing remains in worker.js, which validates every user action.
export const DAILY_TIME_OPTIONS = Object.freeze(
    Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`)
);
export const DAILY_LEVEL_OPTIONS = Object.freeze(["A0", "A1", "A2", "B1", "B2", "C1", "C2"]);
export const DAILY_TIMEZONE_OPTIONS = Object.freeze([
    { id: "Europe/Kyiv", label: "🇺🇦 Київ" },
    { id: "Europe/Warsaw", label: "🇵🇱 Варшава" },
    { id: "Europe/Chisinau", label: "🇲🇩 Кишинів" },
    { id: "Europe/Bucharest", label: "🇷🇴 Бухарест" },
    { id: "Europe/Athens", label: "🇬🇷 Афіни" },
    { id: "Europe/Istanbul", label: "🇹🇷 Стамбул" },
    { id: "Europe/Berlin", label: "🇩🇪 Берлін" },
    { id: "Europe/Paris", label: "🇫🇷 Париж" },
    { id: "Europe/Rome", label: "🇮🇹 Рим" },
    { id: "Europe/Madrid", label: "🇪🇸 Мадрид" },
    { id: "Europe/London", label: "🇬🇧 Лондон" },
    { id: "America/New_York", label: "🇺🇸 Нью-Йорк" },
    { id: "America/Chicago", label: "🇺🇸 Чикаго" },
    { id: "America/Denver", label: "🇺🇸 Денвер" },
    { id: "America/Los_Angeles", label: "🇺🇸 Лос-Анджелес" },
    { id: "America/Toronto", label: "🇨🇦 Торонто" },
    { id: "America/Vancouver", label: "🇨🇦 Ванкувер" },
    { id: "America/Sao_Paulo", label: "🇧🇷 Сан-Паулу" },
    { id: "Asia/Dubai", label: "🇦🇪 Дубай" },
    { id: "Asia/Tbilisi", label: "🇬🇪 Тбілісі" },
    { id: "Asia/Yerevan", label: "🇦🇲 Єреван" },
    { id: "Asia/Almaty", label: "🇰🇿 Алмати" },
    { id: "Asia/Tashkent", label: "🇺🇿 Ташкент" },
    { id: "Asia/Kolkata", label: "🇮🇳 Делі" },
    { id: "Asia/Bangkok", label: "🇹🇭 Бангкок" },
    { id: "Asia/Singapore", label: "🇸🇬 Сінгапур" },
    { id: "Asia/Tokyo", label: "🇯🇵 Токіо" },
    { id: "Asia/Seoul", label: "🇰🇷 Сеул" },
    { id: "Australia/Sydney", label: "🇦🇺 Сідней" },
]);
const TIMEZONE_PAGE_SIZE = 6;

function timezoneLabel(timezone) {
    return DAILY_TIMEZONE_OPTIONS.find((option) => option.id === timezone)?.label ?? timezone;
}

export function timezoneGmtOffset(timezone, date = new Date()) {
    try {
        const offset = new Intl.DateTimeFormat("en", { timeZone: timezone, timeZoneName: "shortOffset" })
            .formatToParts(date)
            .find((part) => part.type === "timeZoneName")?.value;
        return offset?.replace(/^GMT([+-])0?(\d{1,2})(?::00)?$/, "GMT$1$2") ?? "GMT";
    } catch {
        return "GMT";
    }
}

export function timezoneOffsetMinutes(timezone, date = new Date()) {
    const match = timezoneGmtOffset(timezone, date).match(/^GMT(?:(\+|-)(\d{1,2})(?::(\d{2}))?)?$/);
    if (!match) return 0;
    const minutes = Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
    return match[1] === "-" ? -minutes : minutes;
}

export function timezoneDisplayLabel(timezone, date = new Date()) {
    return `${timezoneLabel(timezone)} · ${timezone} (${timezoneGmtOffset(timezone, date)})`;
}

export function dailySettingsMenuKeyboard(settings) {
    return {
        inline_keyboard: [
            [{ text: `🕒 Час: ${settings.daily_time}`, callback_data: "dailysettings:time" }],
            [{ text: `🎚 Рівень: ${settings.daily_level}`, callback_data: "dailysettings:level" }],
            [{ text: `🌍 Часовий пояс: ${timezoneLabel(settings.timezone ?? DEFAULT_DAILY_SETTINGS.timezone)} (${timezoneGmtOffset(settings.timezone ?? DEFAULT_DAILY_SETTINGS.timezone)})`, callback_data: "dailysettings:timezone" }],
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

export function dailyTimezoneKeyboard(page = 0, date = new Date()) {
    const totalPages = Math.ceil(DAILY_TIMEZONE_OPTIONS.length / TIMEZONE_PAGE_SIZE);
    const safePage = Number.isInteger(page) && page >= 0 && page < totalPages ? page : 0;
    const options = [...DAILY_TIMEZONE_OPTIONS]
        .sort((left, right) => timezoneOffsetMinutes(left.id, date) - timezoneOffsetMinutes(right.id, date))
        .slice(safePage * TIMEZONE_PAGE_SIZE, (safePage + 1) * TIMEZONE_PAGE_SIZE);
    const rows = [];
    for (const option of options) {
        rows.push([{
            text: timezoneDisplayLabel(option.id, date),
            callback_data: `dailytimezone:${option.id}`,
        }]);
    }
    if (totalPages > 1) {
        rows.push([
            ...(safePage > 0 ? [{ text: "⬅️", callback_data: `dailytimezonepage:${safePage - 1}` }] : []),
            { text: `${safePage + 1}/${totalPages}`, callback_data: "dailytimezonepage:current" },
            ...(safePage < totalPages - 1 ? [{ text: "➡️", callback_data: `dailytimezonepage:${safePage + 1}` }] : []),
        ]);
    }
    return { inline_keyboard: rows };
}

export async function getDailySettings(env, userId) {
    return env.DB.prepare(
        "SELECT timezone, daily_time, daily_enabled, daily_level FROM users WHERE telegram_user_id = ?"
    ).bind(userId).first();
}

export function dailySettingsText(settings) {
    const status = settings?.daily_enabled ? `увімкнене о ${settings.daily_time}` : "вимкнене";
    const timezone = settings?.timezone ?? DEFAULT_DAILY_SETTINGS.timezone;
    return `Щоденне слово зараз ${status}. Рівень: ${settings?.daily_level ?? "B1"}.\nЧасовий пояс: ${timezoneDisplayLabel(timezone)}.\n\nОбери, що налаштувати:`;
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
export async function handleDailySettingsCallback(env, callback, context, dependencies = {}) {
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
    if (callback.data === "dailysettings:timezone") {
        await answerCallbackQuery(env, callback.id, "Обери часовий пояс.");
        await editMessage(env, chatId, messageId, "🌍 Обери свій часовий пояс:", dailyTimezoneKeyboard());
        return true;
    }
    if (callback.data.startsWith("dailytimezonepage:")) {
        const page = Number(callback.data.replace("dailytimezonepage:", ""));
        if (!Number.isInteger(page) || page < 0 || page >= Math.ceil(DAILY_TIMEZONE_OPTIONS.length / TIMEZONE_PAGE_SIZE)) {
            await answerCallbackQuery(env, callback.id);
            return true;
        }
        await answerCallbackQuery(env, callback.id);
        await editMessage(env, chatId, messageId, "🌍 Обери свій часовий пояс:", dailyTimezoneKeyboard(page));
        return true;
    }
    if (callback.data.startsWith("dailytimezone:")) {
        const timezone = callback.data.replace("dailytimezone:", "");
        if (!DAILY_TIMEZONE_OPTIONS.some((option) => option.id === timezone)) {
            await answerCallbackQuery(env, callback.id, "Невірний часовий пояс.");
            return true;
        }
        await env.DB.prepare("UPDATE users SET timezone = ? WHERE telegram_user_id = ?").bind(timezone, userId).run();
        await answerCallbackQuery(env, callback.id, "Часовий пояс збережено.");
        await refreshDailySettings(env, chatId, messageId, userId);
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
        await env.DB.prepare("DELETE FROM daily_word_prefetches WHERE user_id = ? AND cefr_level <> ?")
            .bind(userId, level).run();
        if (dependencies.queueDailyWordPrefetch) {
            try {
                await dependencies.queueDailyWordPrefetch(env, userId);
            } catch (error) {
                console.warn({ event: "daily_word_prefetch_after_level_change_failed", message: error instanceof Error ? error.message : "Unknown error" });
            }
        }
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
