import { dailyLimitReachedText } from "../../domain/helpers.js";
import { answerCallbackQuery, sendMessage } from "../../platform/telegram.js";

const LIMIT_OPTIONS_TEXT = "Ми ще розвиваємо MovaYakVDoma — дякуємо за терпіння 💛\n\nЗапроси друга: якщо новий користувач запустить бота за твоїм посиланням, ти отримаєш тимчасовий рівень 1 до кінця дня — до 15 слів і 10 щоденних карток, якщо твій поточний рівень нижчий.\n\nАбо підтримай бот і після переказу подай заявку на бонус на місяць.";

function limitOptionsKeyboard(invitation) {
    return {
        inline_keyboard: [
            ...invitation.replyMarkup.inline_keyboard,
            [
                { text: "☕ Підтримати бот", callback_data: "limit:support" },
                { text: "🎁 Отримати бонус", callback_data: "limit:bonus" },
            ],
        ],
    };
}

/** Sends the bounded referral and donation choices after an addition limit is reached. */
export async function sendLimitReachedOptions(env, chatId, userId, limit, dependencies) {
    const invitation = await dependencies.referralInvitation(env, userId);
    await sendMessage(
        env,
        chatId,
        `${dailyLimitReachedText(limit)}\n\n${LIMIT_OPTIONS_TEXT}`,
        limitOptionsKeyboard(invitation)
    );
}

/** Handles the user-owned support actions displayed with the limit message. */
export async function handleLimitOptionsCallback(env, callback, context, dependencies) {
    if (!callback.data.startsWith("limit:")) return false;

    const match = callback.data.match(/^limit:(support|bonus)$/);
    if (!match) {
        await answerCallbackQuery(env, callback.id, "Невірний вибір.");
        return true;
    }

    const { chatId, userId } = context;
    try {
        await answerCallbackQuery(env, callback.id, match[1] === "support" ? "Готую код для підтримки…" : "Перевіряю заявку…");
        if (match[1] === "support") {
            await dependencies.sendDonationInstructions(env, chatId, userId);
        } else {
            await dependencies.submitDonationBonusRequest(env, chatId, userId, dependencies.notifyPendingDonationRequests);
        }
    } catch (error) {
        console.error({ event: "limit_option_action_failed", action: match[1], message: error instanceof Error ? error.message : "Unknown error" });
        await sendMessage(env, chatId, "Не вдалося виконати дію. Спробуй ще раз за хвилину.");
    }
    return true;
}
