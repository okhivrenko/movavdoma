import { editMessage, sendMessage } from "../../platform/telegram.js";

// Profile fields increase each row's length; 25 rows stay safely below
// Telegram's 4,096-character message limit even with long names.
const ADMIN_USER_LIST_LIMIT = 25;
const ADMIN_MESSAGE_LIST_LIMIT = 10;
const ADMIN_MESSAGE_PREVIEW_LIMIT = 240;
const ADMIN_MESSAGE_DETAIL_LIMIT = 3500;
const ADMIN_MESSAGE_BUTTON_COLUMNS = 5;

const MESSAGE_LIST_CONFIG = Object.freeze({
    feedback: Object.freeze({ title: "💬 Відгуки", detailTitle: "💬 Відгук", callback: "admin:feedback" }),
    contact: Object.freeze({ title: "📩 Повідомлення", detailTitle: "📩 Повідомлення", callback: "admin:contact" }),
});

export function adminKeyboard() {
    return { inline_keyboard: [
        [{ text: "👥 Список користувачів", callback_data: "admin:users" }],
        [{ text: "📈 Джерела стартів", callback_data: "admin:sources" }],
        [{ text: "💬 Відгуки", callback_data: "admin:feedback" }, { text: "📩 Повідомлення", callback_data: "admin:contact" }],
        [{ text: "🔗 Посилання на бота", callback_data: "admin:link" }],
        [{ text: "🎁 Змінити ліміт", callback_data: "admin:grant" }],
        [{ text: "🎚 Змінити рівень", callback_data: "admin:level" }],
        [{ text: "🧪 Тест рівня 1", callback_data: "admin:testlevel" }],
        [{ text: "❓ Команди адміна", callback_data: "admin:help" }],
    ] };
}

export function adminHelpText() {
    return "🛠 Адмін-панель\n\n• 👥 Список користувачів — усі користувачі, по 25 на сторінці, з ID, ім’ям, ніком, лімітами, кількістю активних слів і останньою активністю.\n• 📈 Джерела стартів або /sources — підсумок першого відомого джерела запуску бота.\n• 💬 Відгуки та 📩 Повідомлення — окремі списки звернень, по 10 на сторінці, з кнопками для читання повного тексту.\n• 🔗 Посилання на бота — показує пряме посилання, яке можна скопіювати або переслати.\n• /grant <userId> <ліміт> — встановити ліміт додавання слів на 1 місяць.\n  Приклад: /grant 123456789 45\n• /level <userId> <0-3> — постійно підвищити рівень доступу. Щоденні картки: 0→5, 1→10, 2→15, 3→20.\n  Приклад: /level 123456789 2\n• /testlevel <userId> — видати тестовий рівень 1 на 1 день.\n  Приклад: /testlevel 123456789\n• 🎁 Заявки на донати приходять окремими картками з кнопками підтвердження.";
}

export async function sendAcquisitionSourceSummary(env, chatId) {
    const result = await env.DB.prepare(`
      SELECT COALESCE(acquisition_campaign, acquisition_source, 'direct_or_legacy') AS source, COUNT(*) AS total
      FROM users
      GROUP BY COALESCE(acquisition_campaign, acquisition_source, 'direct_or_legacy')
      ORDER BY total DESC, source ASC
    `).all();
    const rows = result.results ?? [];
    const total = rows.reduce((sum, row) => sum + Number(row.total ?? 0), 0);
    const list = rows.length > 0
        ? rows.map((row) => `• ${row.source}: ${row.total}`).join("\n")
        : "Поки немає користувачів.";
    await sendMessage(env, chatId, `📈 Джерела стартів: ${total}\n\n${list}\n\nВраховується лише перший відомий start-link. direct_or_legacy — прямі та наявні до запуску міток.`);
}

function compactAdminNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return "?";
    return number > 999 ? "999+" : String(Math.floor(number));
}

function compactProfileField(value, maxLength) {
    const text = String(value ?? "").trim();
    if (!text) return null;
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function lastActivityLabel(value, now = Date.now()) {
    if (!value) return "—";
    const text = String(value);
    const timestamp = Date.parse(text.includes("T") ? text : `${text.replace(" ", "T")}Z`);
    if (!Number.isFinite(timestamp)) return "—";
    const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
    if (minutes < 1) return "щойно";
    if (minutes < 60) return `${minutes}хв`;
    if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}г`;
    if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / (24 * 60))}д`;
    return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Kyiv" }).format(timestamp);
}

function adminUserListKeyboard(page, totalPages) {
    const navigation = [];
    if (page > 0) navigation.push({ text: "← Назад", callback_data: `admin:users:${page - 1}` });
    if (page < totalPages - 1) navigation.push({ text: "Далі →", callback_data: `admin:users:${page + 1}` });
    return navigation.length > 0 ? { inline_keyboard: [navigation] } : { inline_keyboard: [] };
}

function compactMessagePreview(value) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    return text.length > ADMIN_MESSAGE_PREVIEW_LIMIT ? `${text.slice(0, ADMIN_MESSAGE_PREVIEW_LIMIT - 1)}…` : text;
}

function messageSender(message) {
    const username = compactProfileField(message.telegram_username, 32);
    const firstName = compactProfileField(message.telegram_first_name, 32);
    const profile = [username && `@${username.replace(/^@/, "")}`, firstName].filter(Boolean).join(" · ");
    return `ID ${message.user_id}${profile ? ` · ${profile}` : ""}`;
}

function messageCreatedAtLabel(value) {
    const text = String(value ?? "");
    const timestamp = Date.parse(text.includes("T") ? text : `${text.replace(" ", "T")}Z`);
    if (!Number.isFinite(timestamp)) return "дата невідома";
    return new Intl.DateTimeFormat("uk-UA", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Kyiv",
    }).format(timestamp);
}

function messageListKeyboard(type, page, totalPages, messages) {
    const navigation = [];
    const callback = MESSAGE_LIST_CONFIG[type].callback;
    const readButtons = messages.map((message, index) => ({
        text: String(page * ADMIN_MESSAGE_LIST_LIMIT + index + 1),
        callback_data: `${callback}:read:${message.id}:${page}`,
    }));
    const keyboard = Array.from(
        { length: Math.ceil(readButtons.length / ADMIN_MESSAGE_BUTTON_COLUMNS) },
        (_, index) => readButtons.slice(index * ADMIN_MESSAGE_BUTTON_COLUMNS, (index + 1) * ADMIN_MESSAGE_BUTTON_COLUMNS)
    );
    if (page > 0) navigation.push({ text: "← Назад", callback_data: `${callback}:${page - 1}` });
    if (page < totalPages - 1) navigation.push({ text: "Далі →", callback_data: `${callback}:${page + 1}` });
    if (navigation.length > 0) keyboard.push(navigation);
    return { inline_keyboard: keyboard };
}

export async function sendAdminMessageList(env, chatId, type, requestedPage = 0, messageId = null) {
    const config = MESSAGE_LIST_CONFIG[type];
    if (!config) throw new Error("Unsupported admin message list type.");
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM user_messages WHERE message_type = ?")
        .bind(type).first();
    const total = Number(count?.total ?? 0);
    if (total === 0) {
        await sendMessage(env, chatId, `${config.title} поки немає.`);
        return;
    }

    const totalPages = Math.ceil(total / ADMIN_MESSAGE_LIST_LIMIT);
    const page = Math.min(Math.max(requestedPage, 0), totalPages - 1);
    const result = await env.DB.prepare(`
      SELECT m.id, m.user_id, m.content, m.created_at, u.telegram_username, u.telegram_first_name
      FROM user_messages m
      LEFT JOIN users u ON u.telegram_user_id = m.user_id
      WHERE m.message_type = ?
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT ? OFFSET ?
    `).bind(type, ADMIN_MESSAGE_LIST_LIMIT, page * ADMIN_MESSAGE_LIST_LIMIT).all();
    const entries = result.results.map((message, index) => {
        return `${page * ADMIN_MESSAGE_LIST_LIMIT + index + 1}. ${messageCreatedAtLabel(message.created_at)} · ${messageSender(message)}\n${compactMessagePreview(message.content)}`;
    }).join("\n\n");
    const text = `${config.title}: ${total}\nСторінка ${page + 1} з ${totalPages}\n\n${entries}\n\nПрочитати:`;
    const keyboard = messageListKeyboard(type, page, totalPages, result.results);
    if (messageId) return editMessage(env, chatId, messageId, text, keyboard);
    return sendMessage(env, chatId, text, keyboard);
}

export async function showAdminMessageDetail(env, chatId, type, recordId, page, telegramMessageId) {
    const config = MESSAGE_LIST_CONFIG[type];
    if (!config) throw new Error("Unsupported admin message list type.");
    const message = await env.DB.prepare(`
      SELECT m.id, m.user_id, m.content, m.created_at, u.telegram_username, u.telegram_first_name
      FROM user_messages m
      LEFT JOIN users u ON u.telegram_user_id = m.user_id
      WHERE m.id = ? AND m.message_type = ?
      LIMIT 1
    `).bind(recordId, type).first();
    if (!message) return false;

    const content = String(message.content ?? "").slice(0, ADMIN_MESSAGE_DETAIL_LIMIT);
    const text = `${config.detailTitle} #${recordId}\n${messageCreatedAtLabel(message.created_at)} · ${messageSender(message)}\n\n${content}`;
    await editMessage(env, chatId, telegramMessageId, text, {
        inline_keyboard: [[{ text: "← До списку", callback_data: `${config.callback}:${page}` }]],
    });
    return true;
}

export async function sendAdminUserList(env, chatId, requestedPage = 0, messageId = null, dependencies) {
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM users").first();
    const total = Number(count?.total ?? 0);
    if (total === 0) {
        await sendMessage(env, chatId, "Користувачів поки немає.");
        return;
    }

    const totalPages = Math.ceil(total / ADMIN_USER_LIST_LIMIT);
    const page = Math.min(Math.max(requestedPage, 0), totalPages - 1);
    const result = await env.DB.prepare(`
      SELECT u.telegram_user_id, u.telegram_username, u.telegram_first_name, u.last_seen_at,
        (SELECT COUNT(*) FROM words w WHERE w.user_id = u.telegram_user_id AND w.is_active = 1) AS active_word_count,
        (SELECT daily_limit FROM user_daily_limits l WHERE l.user_id = u.telegram_user_id AND l.expires_at > CURRENT_TIMESTAMP) AS bonus_daily_limit,
        MAX(COALESCE((SELECT access_level FROM user_access_levels a WHERE a.user_id = u.telegram_user_id), 0), COALESCE((SELECT MAX(access_level) FROM user_temporary_access_grants g WHERE g.user_id = u.telegram_user_id AND g.expires_at > CURRENT_TIMESTAMP), 0)) AS access_level
      FROM users u ORDER BY u.last_seen_at DESC, u.created_at DESC LIMIT ? OFFSET ?
    `).bind(ADMIN_USER_LIST_LIMIT, page * ADMIN_USER_LIST_LIMIT).all();

    const text = result.results.map((user, index) => {
        const dailyLimit = dependencies.isAdmin(env, user.telegram_user_id) ? "∞" : compactAdminNumber(user.bonus_daily_limit ?? dependencies.dailyAddLimit);
        const username = compactProfileField(user.telegram_username, 32);
        const firstName = compactProfileField(user.telegram_first_name, 32);
        const profile = [username && `@${username.replace(/^@/, "")}`, firstName].filter(Boolean).join(" · ");
        return `${page * ADMIN_USER_LIST_LIMIT + index + 1}. ID ${user.telegram_user_id}${profile ? ` · ${profile}` : ""} · слів: ${compactAdminNumber(user.active_word_count)} · ліміт: ${dailyLimit} · рівень: ${user.access_level} · був: ${lastActivityLabel(user.last_seen_at)}`;
    }).join("\n");
    const listText = `👥 Користувачі: ${total}\nСторінка ${page + 1} з ${totalPages}\n\n${text}\n\nЩоб змінити ліміт: /grant userId ліміт`;
    const keyboard = adminUserListKeyboard(page, totalPages);
    if (messageId) return editMessage(env, chatId, messageId, listText, keyboard);
    return sendMessage(env, chatId, listText, keyboard);
}
