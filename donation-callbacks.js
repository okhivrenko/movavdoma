import { answerCallbackQuery, editMessage } from "./telegram.js";
import { dailyWordCardLimitForLevel } from "./policies.js";

/** Handles stable `bonus:` callbacks after the Worker has checked private chat. */
export async function handleDonationCallback(env, callback, context, dependencies) {
    if (!callback.data.startsWith("bonus:")) return false;
    const { chatId, messageId, userId } = context;
    if (!dependencies.isAdmin(env, userId)) {
        await answerCallbackQuery(env, callback.id, "Ця дія доступна лише адміну.");
        return true;
    }

    // Keep cards sent before the level update actionable.
    const match = callback.data.match(/^bonus:(?:level:([1-3])|(15|25|40|30|50|100)|(reject)):(\d+)$/);
    if (!match) {
        await answerCallbackQuery(env, callback.id, "Невірна заявка.");
        return true;
    }

    const accessLevel = match[1]
        ? Number(match[1])
        : ({ 15: 1, 25: 2, 40: 3, 30: 1, 50: 2, 100: 3 }[match[2]] ?? null);
    const requestId = Number(match[4]);
    if (!Number.isInteger(requestId) || requestId <= 0) {
        await answerCallbackQuery(env, callback.id, "Невірна заявка.");
        return true;
    }

    try {
        if (match[3] === "reject") {
            const rejected = await dependencies.rejectDonationBonus(env, requestId);
            if (!rejected) {
                await answerCallbackQuery(env, callback.id, "Заявку вже оброблено.");
                return true;
            }
            await answerCallbackQuery(env, callback.id, "Заявку відхилено.");
            await editMessage(env, chatId, messageId, `❌ Заявку #${requestId} відхилено.`, { inline_keyboard: [] });
            return true;
        }

        const granted = await dependencies.grantDonationBonus(
            env, requestId, accessLevel, dependencies.grantTemporaryAccessLevel
        );
        if (!granted) {
            await answerCallbackQuery(env, callback.id, "Заявку вже оброблено.");
            return true;
        }
        await answerCallbackQuery(env, callback.id, "Бонус надано.");
        await editMessage(
            env, chatId, messageId,
            `✅ Заявка #${requestId}: надано рівень ${granted.access.accessLevel} на 1 місяць; щоденні картки: ${dailyWordCardLimitForLevel(granted.access.accessLevel)} на день.`,
            { inline_keyboard: [] }
        );
    } catch (error) {
        console.error({ event: "donation_bonus_action_failed", message: error instanceof Error ? error.message : "Unknown error" });
        await answerCallbackQuery(env, callback.id, "Не вдалося обробити заявку.");
    }
    return true;
}
