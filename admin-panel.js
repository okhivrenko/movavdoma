import { editMessage, sendMessage } from "./telegram.js";

const ADMIN_USER_LIST_LIMIT = 50;

export function adminKeyboard() {
    return { inline_keyboard: [
        [{ text: "👥 Список користувачів", callback_data: "admin:users" }],
        [{ text: "🔗 Посилання на бота", callback_data: "admin:link" }],
        [{ text: "🎁 Змінити ліміт", callback_data: "admin:grant" }],
        [{ text: "🎚 Змінити рівень", callback_data: "admin:level" }],
        [{ text: "🧪 Тест рівня 1", callback_data: "admin:testlevel" }],
        [{ text: "❓ Команди адміна", callback_data: "admin:help" }],
    ] };
}

export function adminHelpText() {
    return "🛠 Адмін-панель\n\n• 👥 Список користувачів — усі користувачі, по 50 на сторінці, з ID, лімітами та кількістю активних слів.\n• 🔗 Посилання на бота — показує пряме посилання, яке можна скопіювати або переслати.\n• /grant <userId> <ліміт> — встановити ліміт додавання слів на 1 місяць.\n  Приклад: /grant 123456789 45\n• /level <userId> <0-3> — постійно підвищити рівень доступу. Щоденні картки: 0→5, 1→10, 2→15, 3→20.\n  Приклад: /level 123456789 2\n• /testlevel <userId> — видати тестовий рівень 1 на 1 день.\n  Приклад: /testlevel 123456789\n• 🎁 Заявки на донати приходять окремими картками з кнопками підтвердження.";
}

function compactAdminNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return "?";
    return number > 999 ? "999+" : String(Math.floor(number));
}

function adminUserListKeyboard(page, totalPages) {
    const navigation = [];
    if (page > 0) navigation.push({ text: "← Назад", callback_data: `admin:users:${page - 1}` });
    if (page < totalPages - 1) navigation.push({ text: "Далі →", callback_data: `admin:users:${page + 1}` });
    return navigation.length > 0 ? { inline_keyboard: [navigation] } : { inline_keyboard: [] };
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
      SELECT u.telegram_user_id,
        (SELECT COUNT(*) FROM words w WHERE w.user_id = u.telegram_user_id AND w.is_active = 1) AS active_word_count,
        (SELECT daily_limit FROM user_daily_limits l WHERE l.user_id = u.telegram_user_id AND l.expires_at > CURRENT_TIMESTAMP) AS bonus_daily_limit,
        MAX(COALESCE((SELECT access_level FROM user_access_levels a WHERE a.user_id = u.telegram_user_id), 0), COALESCE((SELECT MAX(access_level) FROM user_temporary_access_grants g WHERE g.user_id = u.telegram_user_id AND g.expires_at > CURRENT_TIMESTAMP), 0)) AS access_level
      FROM users u ORDER BY u.created_at DESC LIMIT ? OFFSET ?
    `).bind(ADMIN_USER_LIST_LIMIT, page * ADMIN_USER_LIST_LIMIT).all();

    const text = result.results.map((user, index) => {
        const dailyLimit = dependencies.isAdmin(env, user.telegram_user_id) ? "∞" : compactAdminNumber(user.bonus_daily_limit ?? dependencies.dailyAddLimit);
        return `${page * ADMIN_USER_LIST_LIMIT + index + 1}. ID ${user.telegram_user_id} · слів: ${compactAdminNumber(user.active_word_count)} · ліміт: ${dailyLimit} · рівень: ${user.access_level}`;
    }).join("\n");
    const listText = `👥 Користувачі: ${total}\nСторінка ${page + 1} з ${totalPages}\n\n${text}\n\nЩоб змінити ліміт: /grant userId ліміт`;
    const keyboard = adminUserListKeyboard(page, totalPages);
    if (messageId) return editMessage(env, chatId, messageId, listText, keyboard);
    return sendMessage(env, chatId, listText, keyboard);
}
