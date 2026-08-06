import DEFAULT_INPUT_PARSER from "../features/vocabulary/input-parsers/index.js";
import { PLURAL_RULES_UK } from "../content/uk/plural-rules.js";
/** Shared formatting, authorization, and time helpers with no database access. */
export const DEFAULT_DAILY_SETTINGS = Object.freeze({
    timezone: "Europe/Kyiv",
    daily_time: "10:00",
    daily_enabled: 1,
    daily_level: "A0",
});

/** Formats the compact schedule summary shown in the persistent menu. */
export function dailyScheduleKeyboardLabel(settings) {
    const time = settings?.daily_enabled
        ? settings.daily_time ?? DEFAULT_DAILY_SETTINGS.daily_time
        : "вимкнено";
    const level = settings?.daily_level ?? DEFAULT_DAILY_SETTINGS.daily_level;
    return `⏰ Налаштування\n(${time} - ${level})`;
}

export function wordCountLabel(count) {
    return PLURAL_RULES_UK.pluralForms(count);
}

export function dailyLimitReachedText(limit) {
    return `На сьогодні ліміт — ${limit} ${wordCountLabel(limit)} — уже використано. Нові слова можна буде додати завтра.`;
}

export function localDateAndTime(timezone, timestamp) {
    try {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        }).formatToParts(new Date(timestamp));
        const values = Object.fromEntries(
            parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
        );

        return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
    } catch {
        return null;
    }
}

export function isAdmin(env, userId) {
    return String(userId) === env.ADMIN_TELEGRAM_USER_ID;
}

export function formatHryvnias(amountKopiykas) {
    return new Intl.NumberFormat("uk-UA", {
        style: "currency",
        currency: "UAH",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(amountKopiykas / 100);
}

export function createSupportCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const values = new Uint32Array(5);
    crypto.getRandomValues(values);
    return `V-${Array.from(values, (value) => alphabet[value % alphabet.length]).join("")}`;
}

/**
 * Split an optional meaning hint from a vocabulary entry. Delegates to the
 * direction-specific input parser (default: EN → UK) to allow per-language
 * configuration of separators and parsing rules.
 */
export function parseVocabularyInput(input) {
    return DEFAULT_INPUT_PARSER.parseInput(input);
}
