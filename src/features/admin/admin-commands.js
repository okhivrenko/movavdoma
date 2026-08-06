import { sendMessage } from "../../platform/telegram.js";

export async function handleAdminCommand(env, text, { chatId, userId }, d) {
    const grant = text.match(/^\/grant(?:\s+(.+))?$/i);
    const level = text.match(/^\/level(?:\s+(.+))?$/i);
    const test = text.match(/^\/testlevel(?:\s+(.+))?$/i);
    const sources = /^\/sources$/i.test(text);
    const directMessage = text.match(/^\/message\s+(\d+)\s+([\s\S]+)$/i);
    const messageCommand = /^\/message(?:\s+.*)?$/i.test(text);
    if (!grant && !level && !test && !sources && !messageCommand) return false;
    if (!d.isAdmin(env, userId)) { await sendMessage(env, chatId, "Ця команда доступна лише адміну."); return true; }
    if (sources) {
        await d.sendAcquisitionSourceSummary(env, chatId);
        return true;
    }
    if (messageCommand) {
        if (!directMessage) {
            await sendMessage(env, chatId, "Використай: /message userId текст\nНаприклад: /message 123456789 Привіт! Маємо для тебе оновлення.");
            return true;
        }
        const targetUserId = Number(directMessage[1]);
        const body = directMessage[2].trim();
        if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0 || !body || body.length > 3500) {
            await sendMessage(env, chatId, "ID має бути додатним, а повідомлення — від 1 до 3500 символів.");
            return true;
        }
        try {
            const recipient = await env.DB.prepare("SELECT chat_id FROM users WHERE telegram_user_id = ? AND is_active = 1")
                .bind(targetUserId).first();
            if (!recipient?.chat_id) {
                await sendMessage(env, chatId, "Користувача не знайдено або він більше не активний у боті.");
                return true;
            }
            await sendMessage(env, recipient.chat_id, body);
            console.info({ event: "admin_direct_message_sent", recipientUserId: targetUserId, length: body.length });
            await sendMessage(env, chatId, "✅ Повідомлення надіслано.");
        } catch (error) {
            console.error({ event: "admin_direct_message_failed", recipientUserId: targetUserId, message: error instanceof Error ? error.message : "Unknown error" });
            await sendMessage(env, chatId, "Не вдалося надіслати повідомлення. Можливо, користувач заблокував бота.");
        }
        return true;
    }
    if (grant) {
        const p = grant[1]?.trim().split(/\s+/) ?? [];
        if (p.length !== 2 || !/^\d+$/.test(p[0]) || !/^\d+$/.test(p[1])) { await sendMessage(env, chatId, "Використай: /grant userId ліміт\nНаприклад: /grant 123456789 45"); return true; }
        const id = Number(p[0]), limit = Number(p[1]);
        if (!Number.isSafeInteger(id) || !Number.isSafeInteger(limit) || id <= 0 || limit <= 0) { await sendMessage(env, chatId, "userId і ліміт мають бути додатними цілими числами."); return true; }
        try { const ok = await d.grantManualDailyLimit(env, id, limit); await sendMessage(env, chatId, ok ? `✅ Видано ${limit} ${d.wordCountLabel(limit)} на день користувачу ${id} на 1 місяць.` : "Користувача не знайдено. Він має спершу написати боту /start."); }
        catch (error) { console.error({ event: "manual_grant_failed", message: error instanceof Error ? error.message : "Unknown error" }); await sendMessage(env, chatId, "Не вдалося видати ліміт. Спробуй ще раз за хвилину."); }
        return true;
    }
    if (level) {
        const p = level[1]?.trim().split(/\s+/) ?? [];
        if (p.length !== 2 || !/^\d+$/.test(p[0]) || !/^[0-3]$/.test(p[1])) { await sendMessage(env, chatId, "Використай: /level userId рівень\nРівні: 0→5, 1→10, 2→15, 3→20 щоденних карток.\nНаприклад: /level 123456789 2"); return true; }
        const id = Number(p[0]), accessLevel = Number(p[1]);
        if (!Number.isSafeInteger(id) || id <= 0) { await sendMessage(env, chatId, "userId має бути додатним цілим числом."); return true; }
        try { const access = await d.grantManualAccessLevel(env, id, accessLevel); await sendMessage(env, chatId, !access ? "Користувача не знайдено. Він має спершу написати боту /start." : access.changed ? `✅ Рівень користувача ${id} підвищено до ${access.accessLevel}. Ліміт щоденних карток: ${d.dailyWordCardLimitForLevel(access.accessLevel)}.` : `У користувача ${id} вже рівень ${access.accessLevel} або вищий.`); }
        catch (error) { console.error({ event: "manual_access_level_failed", message: error instanceof Error ? error.message : "Unknown error" }); await sendMessage(env, chatId, "Не вдалося змінити рівень. Спробуй ще раз за хвилину."); }
        return true;
    }
    const id = Number(test[1]?.trim());
    if (!Number.isSafeInteger(id) || id <= 0) { await sendMessage(env, chatId, "Використай: /testlevel userId\nНаприклад: /testlevel 123456789"); return true; }
    try { const access = await d.grantTestLevelOne(env, id); await sendMessage(env, chatId, access ? `✅ Користувачу ${id} видано тестовий рівень ${access.accessLevel} на 1 день.` : "Користувача не знайдено. Він має спершу написати боту /start."); }
    catch (error) { console.error({ event: "test_level_failed", message: error instanceof Error ? error.message : "Unknown error" }); await sendMessage(env, chatId, "Не вдалося видати тестовий рівень. Спробуй ще раз за хвилину."); }
    return true;
}
