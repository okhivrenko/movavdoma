/** Shared formatting, authorization, and time helpers with no database access. */
export function wordCountLabel(count) {
    const lastTwoDigits = count % 100;
    const lastDigit = count % 10;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return "слів";
    if (lastDigit === 1) return "слово";
    if (lastDigit >= 2 && lastDigit <= 4) return "слова";
    return "слів";
}

export function dailyLimitReachedText(limit) {
    return `На сьогодні ліміт — ${limit} ${wordCountLabel(limit)} — уже використано. Нові слова можна буде додати завтра.\n\nЯкщо бот корисний, підтримка допомагає його розвивати й може збільшити персональний ліміт.`;
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
