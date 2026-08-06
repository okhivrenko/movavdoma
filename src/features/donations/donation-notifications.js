/** Preserves callback formats for pending admin donation-review cards. */
export function adminDonationKeyboard(requestId, suggestedAccessLevel) {
    const suggestedButton = suggestedAccessLevel
        ? [{ text: `Рекомендований рівень ${suggestedAccessLevel}`, callback_data: `bonus:level:${suggestedAccessLevel}:${requestId}` }]
        : [];
    return { inline_keyboard: [
        suggestedButton,
        [
            { text: "Рівень 1", callback_data: `bonus:level:1:${requestId}` },
            { text: "Рівень 2", callback_data: `bonus:level:2:${requestId}` },
            { text: "Рівень 3", callback_data: `bonus:level:3:${requestId}` },
        ],
        [{ text: "Відхилити", callback_data: `bonus:reject:${requestId}` }],
    ].filter((row) => row.length > 0) };
}

export async function notifyPendingDonationRequests(env, getAdminChatId, dependencies) {
    const adminChatId = await getAdminChatId(env);
    if (!adminChatId) { console.warn({ event: "donation_admin_chat_not_found" }); return; }
    const pending = await env.DB.prepare("SELECT id, user_id, support_code, matched_transaction_id, request_source FROM donation_requests WHERE status = 'awaiting_review' AND admin_notified_at IS NULL ORDER BY id ASC").all();
    for (const request of pending.results) {
        const isManualBonus = request.request_source === "manual_bonus";
        const transaction = request.matched_transaction_id ? await env.DB.prepare("SELECT amount_kopiykas FROM bank_transactions WHERE transaction_id = ?").bind(request.matched_transaction_id).first() : null;
        const level = transaction ? dependencies.donationAccessLevel(transaction.amount_kopiykas) : null;
        const paymentStatus = isManualBonus
            ? "\nЗаявка без донату — рішення про рівень за адміністратором."
            : transaction
                ? `\nДонат знайдено: ${dependencies.formatHryvnias(transaction.amount_kopiykas)}.`
                : "\nПлатіж ще не знайдено автоматично — звір його у банці.";
        await dependencies.sendMessage(env, adminChatId, `🎁 Заявка на бонус\nКористувач: ${request.user_id}\nТип: ${isManualBonus ? "без донату" : "підтримка"}${paymentStatus}${level ? `\nРекомендований рівень: ${level} (${dependencies.dailyWordCardLimitForLevel(level)} щоденних карток).` : ""}`, adminDonationKeyboard(request.id, level));
        await env.DB.prepare("UPDATE donation_requests SET admin_notified_at = CURRENT_TIMESTAMP WHERE id = ?").bind(request.id).run();
    }
}

export async function notifyPendingDonationReminder(env, getAdminChatId, dependencies) {
    const summary = await env.DB
        .prepare("SELECT COUNT(*) AS pending_count FROM donation_requests WHERE status = 'awaiting_review'")
        .first();
    const pendingCount = Number(summary?.pending_count ?? 0);
    if (pendingCount <= 0) return false;

    const adminChatId = await getAdminChatId(env);
    if (!adminChatId) {
        console.warn({ event: "donation_admin_chat_not_found" });
        return false;
    }

    await dependencies.sendMessage(
        env,
        adminChatId,
        `🎁 Нагадування: заявок на бонус без рішення — ${pendingCount}.\n\nПеревір картки заявок у цьому чаті й обери рівень або відхили заявку.`
    );
    return true;
}

export async function notifyUnmatchedDonations(env, getAdminChatId, dependencies) {
    const adminChatId = await getAdminChatId(env);
    if (!adminChatId) return;
    const unmatched = await env.DB.prepare(`SELECT transaction_id, amount_kopiykas, comment FROM bank_transactions WHERE matched_request_id IS NULL AND admin_notified_at IS NULL ORDER BY transaction_time ASC`).all();
    for (const transaction of unmatched.results) {
        const comment = transaction.comment ? `\nКоментар: ${transaction.comment}` : "\nБез коментаря.";
        await dependencies.sendMessage(env, adminChatId, `☕ Новий донат без збігу із заявкою: ${dependencies.formatHryvnias(transaction.amount_kopiykas)}.${comment}\n\nЯкщо людина напише тобі, звір платіж і видай бонус через її заявку.`);
        await env.DB.prepare("UPDATE bank_transactions SET admin_notified_at = CURRENT_TIMESTAMP WHERE transaction_id = ?").bind(transaction.transaction_id).run();
    }
}
