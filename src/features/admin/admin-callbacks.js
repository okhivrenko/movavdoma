import { answerCallbackQuery, sendMessage } from "../../platform/telegram.js";
import { adminHelpText, sendAcquisitionSourceSummary, sendAdminMessageList, sendAdminUserList, showAdminMessageDetail } from "./admin-panel.js";

/** Handles only the stable `admin:` callback namespace after private-chat validation. */
export async function handleAdminCallback(env, callback, context, dependencies) {
    if (!callback.data.startsWith("admin:")) return false;
    const { chatId, messageId, userId } = context;
    if (!dependencies.isAdmin(env, userId)) {
        await answerCallbackQuery(env, callback.id, "Ця дія доступна лише адміну.");
        return true;
    }

    const usersMatch = callback.data.match(/^admin:users(?::(\d+))?$/);
    if (usersMatch) {
        const page = Number(usersMatch[1] ?? 0);
        if (!Number.isInteger(page) || page < 0) {
            await answerCallbackQuery(env, callback.id, "Невірна сторінка.");
            return true;
        }
        await answerCallbackQuery(env, callback.id, "Готую список користувачів.");
        await sendAdminUserList(env, chatId, page, usersMatch[1] ? messageId : null, {
            isAdmin: dependencies.isAdmin,
            dailyAddLimit: dependencies.dailyAddLimit,
        });
        return true;
    }

    if (callback.data === "admin:sources") {
        await answerCallbackQuery(env, callback.id, "Готую джерела стартів.");
        await sendAcquisitionSourceSummary(env, chatId);
        return true;
    }

    const messageReadMatch = callback.data.match(/^admin:(feedback|contact):read:(\d+):(\d+)$/);
    if (messageReadMatch) {
        const recordId = Number(messageReadMatch[2]);
        const page = Number(messageReadMatch[3]);
        if (!Number.isSafeInteger(recordId) || recordId < 1 || !Number.isSafeInteger(page) || page < 0) {
            await answerCallbackQuery(env, callback.id, "Невірне звернення.");
            return true;
        }
        const found = await showAdminMessageDetail(env, chatId, messageReadMatch[1], recordId, page, messageId);
        await answerCallbackQuery(env, callback.id, found ? "Відкриваю звернення." : "Звернення не знайдено.");
        return true;
    }

    const messagesMatch = callback.data.match(/^admin:(feedback|contact)(?::(\d+))?$/);
    if (messagesMatch) {
        const page = Number(messagesMatch[2] ?? 0);
        if (!Number.isInteger(page) || page < 0) {
            await answerCallbackQuery(env, callback.id, "Невірна сторінка.");
            return true;
        }
        await answerCallbackQuery(env, callback.id, "Готую список звернень.");
        await sendAdminMessageList(env, chatId, messagesMatch[1], page, messagesMatch[2] ? messageId : null);
        return true;
    }

    const commandHints = {
        "admin:grant": "Щоб змінити ліміт користувача, надішли:\n/grant userId ліміт\n\nНаприклад: /grant 123456789 45",
        "admin:level": "Щоб підвищити рівень доступу, надішли:\n/level userId рівень\n\nРівні: 0→5, 1→10, 2→15, 3→20 щоденних карток.\nПриклад: /level 123456789 2",
        "admin:testlevel": "Щоб видати тестовий рівень 1 на 1 день, надішли:\n/testlevel userId\n\nНаприклад: /testlevel 123456789",
    };
    if (commandHints[callback.data]) {
        await answerCallbackQuery(env, callback.id, "Показую формат команди.");
        await sendMessage(env, chatId, commandHints[callback.data]);
        return true;
    }

    if (callback.data === "admin:link") {
        try {
            const botLink = await dependencies.getBotLink(env);
            await answerCallbackQuery(env, callback.id, "Показую посилання.");
            await sendMessage(env, chatId, `🔗 Посилання на бота:\n${botLink}`, {
                inline_keyboard: [[{ text: "Відкрити бота", url: botLink }]],
            });
        } catch (error) {
            console.error({ event: "admin_bot_link_failed", message: error instanceof Error ? error.message : "Unknown error" });
            await answerCallbackQuery(env, callback.id, "Не вдалося отримати посилання.");
        }
        return true;
    }

    if (callback.data === "admin:help") {
        await answerCallbackQuery(env, callback.id, "Показую команди.");
        await sendMessage(env, chatId, adminHelpText());
        return true;
    }

    await answerCallbackQuery(env, callback.id, "Невідома адмінська дія.");
    return true;
}
