// MovaYakVDoma Telegram Bot — Copyright (c) 2026 Oleksii Khivrenko.
// Publicly viewable under the proprietary terms in LICENSE.

import {
    answerCallbackQuery,
    editMessage,
    getBotLink,
    sendMessage,
    telegramApi,
} from "./src/platform/telegram.js";
import {
    closePendingSelection,
    handleVocabularyCallback,
    saveAndSendWord,
    senseKeyboard,
    senseText,
    suggestSenses,
} from "./src/features/vocabulary/vocabulary-cards.js";
import { createMonobankDonationSync } from "./src/platform/monobank-donations.js";
import {
    sendDonationInstructions,
    handleDonationSupportBonusCallback,
    submitDonationBonusRequest as submitDonationBonusRequestFlow,
} from "./src/features/donations/donation-requests.js";
import {
    grantDonationBonus as grantDonationBonusRequest,
    notifyExpiredDonationAccessGrants as notifyExpiredDonationAccessGrantsFlow,
    rejectDonationBonus as rejectDonationBonusRequest,
} from "./src/features/donations/donation-grants.js";
import {
    notifyPendingDonationReminder as notifyDonationReminder,
    notifyPendingDonationRequests as notifyDonationReviews,
    notifyUnmatchedDonations as notifyUnmatchedDonationAlerts,
} from "./src/features/donations/donation-notifications.js";
import { handleDonationCallback } from "./src/features/donations/donation-callbacks.js";
import {
    getAdminChatId,
    getUserAccessLevel,
    grantAccessLevel,
    grantTemporaryAccessLevel,
} from "./src/features/admin/access-levels.js";
import {
    grantManualAccessLevel as grantManualAccessLevelFlow,
    grantManualDailyLimit as grantManualDailyLimitFlow,
    grantTestLevelOne as grantTestLevelOneFlow,
} from "./src/features/admin/admin-access.js";
import { adminHelpText, adminKeyboard, sendAcquisitionSourceSummary } from "./src/features/admin/admin-panel.js";
import { handleAdminCallback } from "./src/features/admin/admin-callbacks.js";
import { handleAdminCommand } from "./src/features/admin/admin-commands.js";
import { messages } from "./src/domain/messages.js";
import { acquisitionAttributionFromStartCommand, acquisitionSourceFromLandingParam, isTelegramStartCommand } from "./src/domain/acquisition.js";
import { referralUserIdFromStartCommand } from "./src/domain/referrals.js";
import { referralInvitation, rewardReferralFromNewUser } from "./src/features/referrals/referrals.js";
import { handleLimitOptionsCallback, sendLimitReachedOptions } from "./src/features/referrals/limit-options.js";
import {
    getDailySettings,
    handleDailySettingsCallback,
    sendDailySettings,
} from "./src/features/daily-words/daily-settings.js";
import {
    getRecentActiveWords,
    getRecentArchivedWords,
    handleExamplesCallback,
    handleWordListCallback,
    LIST_LIMIT,
    sendActiveWordList,
    sendLearnedWordList,
} from "./src/features/vocabulary/word-list.js";
import {
    DEFAULT_DAILY_SETTINGS,
    dailyLimitReachedText,
    formatHryvnias,
    isAdmin,
    parseVocabularyInput,
    wordCountLabel,
} from "./src/domain/helpers.js";
import {
    claimDailyWordAddition as claimDailyWordAdditionFlow,
    getDailyAdditionLimit as getDailyAdditionLimitFlow,
} from "./src/features/daily-words/daily-addition-quota.js";
import {
    dailyWordAdditionLimitForLevel,
    dailyWordCardLimitForLevel,
    donationAccessLevel,
} from "./src/domain/policies.js";
import {
    claimDailyWordCard,
    generateDailyWordCard,
    generateNewDailyWord,
} from "./src/features/daily-words/daily-words.js";
import { handleDailyWordCallback } from "./src/features/daily-words/daily-word-callbacks.js";
import { processDailyWordJob, processDailyWordPrefetch, queueDailyWordPrefetch, queueDailyWordPrefetchCoverage, queueNextDailyWord, requeueDailyWordJobs } from "./src/features/daily-words/daily-word-jobs.js";
import { clearPendingFeedback, startFeedback, submitFeedback, USER_MESSAGE_TYPE } from "./src/features/feedback/feedback.js";
import { removeExpiredLearnedWords as cleanupLearnedWords } from "./src/features/vocabulary/learned-word-cleanup.js";
import { sendDueDailyWords as deliverDueDailyWords, sendNextDailyWord as deliverNextDailyWord, sendPreviousDailyWord as deliverPreviousDailyWord, sendReadyNextDailyWord as deliverReadyNextDailyWord, sendTodayDailyWord as deliverTodayDailyWord } from "./src/features/daily-words/daily-delivery.js";
import {
    ensureTelegramWebhook as ensureTelegramWebhookFlow,
    sendHelp as sendHelpFlow,
} from "./src/platform/worker-support.js";
import {
    handleNavigationMessage,
    mainKeyboard as localizedMainKeyboard,
    shouldClearPendingFeedback,
} from "./src/features/navigation/navigation.js";
import { privacyPolicyPage as renderPrivacyPolicyPage } from "./src/platform/privacy-policy.js";
import { landingPage as renderLandingPage } from "./src/features/landing/landing-page.js";
import { contentFor } from "./src/content/index.js";
import { handleVocabularyTextCommand } from "./src/features/vocabulary/text-commands.js";
import { publicRuntimeConfig } from "./src/platform/runtime-config.js";
import {
    clearPendingTextTranslation,
    handlePendingTextTranslation,
    handleTextTranslationCallback,
    sendTextTranslationMenu,
} from "./src/features/translations/text-translation.js";

// Default daily quota for newly saved words; individual bonuses may raise it.
const DAILY_ADD_LIMIT = 10;
// Daily-card quota is separate from the learning-list quota and depends on access.
const MAX_DAILY_WORD_ATTEMPTS = 3;
const LEARNED_WORD_RETENTION_DAYS = 30;
// Increment only when the persistent reply keyboard changes for users.
const INTERFACE_VERSION = 12;

// User-facing reply/inline keyboards and the admin-only user directory.
// Authorization itself stays in helpers.js so every entry path compares IDs consistently.
function mainKeyboard(showAdmin = false, page = 1, dailySettings = DEFAULT_DAILY_SETTINGS) {
    return localizedMainKeyboard(showAdmin, page, dailySettings);
}

/** Builds a current reply keyboard without hard-coding a user's schedule. */
async function mainKeyboardForUser(env, userId, page = 1) {
    const settings = await getDailySettings(env, userId);
    return mainKeyboard(isAdmin(env, userId), page, settings ?? DEFAULT_DAILY_SETTINGS);
}

/**
 * Telegram persists reply keyboards until the bot sends another one. On the
 * user's first interaction after a UI release, refresh it once automatically
 * instead of requiring /start or sending a broadcast to every user.
 */
async function refreshInterfaceIfNeeded(env, chatId, userId) {
    const user = await env.DB
        .prepare("SELECT interface_version FROM users WHERE telegram_user_id = ?")
        .bind(userId)
        .first();

    if (Number(user?.interface_version ?? 0) >= INTERFACE_VERSION) {
        return;
    }

    await sendMessage(
        env,
        chatId,
        "✨ Меню оновлено. Можеш користуватися новими кнопками нижче.",
        await mainKeyboardForUser(env, userId)
    );

    await markInterfaceVersion(env, userId);
}

async function markInterfaceVersion(env, userId) {
    await env.DB
        .prepare("UPDATE users SET interface_version = ? WHERE telegram_user_id = ?")
        .bind(INTERFACE_VERSION, userId)
        .run();
}

async function notifyPendingDonationRequests(env) {
    return notifyDonationReviews(env, getAdminChatId, {
        donationAccessLevel, formatHryvnias, dailyWordCardLimitForLevel, sendMessage,
    });
}

async function notifyUnmatchedDonations(env) {
    return notifyUnmatchedDonationAlerts(env, getAdminChatId, { formatHryvnias, sendMessage });
}

async function notifyPendingDonationReminder(env) {
    return notifyDonationReminder(env, getAdminChatId, { sendMessage });
}

// Remove only already learned vocabulary after its retention period. Child rows
// are deleted first because examples and reviews reference the vocabulary word.
async function claimDailyWordAddition(env, userId) {
    return claimDailyWordAdditionFlow(env, userId, {
        isAdmin, dailyAddLimit: DAILY_ADD_LIMIT, getUserAccessLevel, dailyWordAdditionLimitForLevel,
    });
}

async function getDailyAdditionLimit(env, userId) {
    return getDailyAdditionLimitFlow(env, userId, {
        isAdmin, dailyAddLimit: DAILY_ADD_LIMIT, getUserAccessLevel, dailyWordAdditionLimitForLevel,
    });
}

const syncMonobankDonations = createMonobankDonationSync({
    notifyPendingDonationRequests,
    notifyUnmatchedDonations,
});

// A public, static policy page is intentionally served before webhook
// authentication so Telegram and users can open it without bot credentials.
function privacyPolicyPage(env) {
    return renderPrivacyPolicyPage({
        brandName: publicRuntimeConfig(env).botBrandName,
        effectiveDate: "5 серпня 2026 року",
        content: contentFor().privacyPolicy,
    });
}

function landingPage(env, scriptNonce, acquisitionSource) {
    const config = publicRuntimeConfig(env);
    return renderLandingPage({
        brandName: config.botBrandName,
        publicWorkerUrl: config.publicWorkerUrl,
        content: contentFor().landing,
        scriptNonce,
        acquisitionSource: acquisitionSource ?? "website",
    });
}

function publicHtmlResponse(page, { scriptNonce } = {}) {
    const analyticsImageSources = scriptNonce
        ? " https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com"
        : "";
    const scriptPolicy = scriptNonce
        ? `; script-src 'self' 'nonce-${scriptNonce}' https://www.googletagmanager.com; connect-src https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://www.googletagmanager.com`
        : "";
    return new Response(page, {
        headers: {
            "content-type": "text/html; charset=UTF-8",
            "content-security-policy": `default-src 'none'; img-src 'self'${analyticsImageSources}; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'${scriptPolicy}`,
            "referrer-policy": "strict-origin-when-cross-origin",
            "strict-transport-security": "max-age=31536000",
            "x-content-type-options": "nosniff",
            "permissions-policy": "camera=(), microphone=(), geolocation=()",
        },
    });
}

// Telegram webhook and scheduled delivery entry points. Callback actions are
// validated in the router before any user-owned data is read or changed.
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.protocol === "http:") {
            url.protocol = "https:";
            return Response.redirect(url, 301);
        }
        if (request.method === "GET" && url.pathname === "/") {
            const scriptNonce = crypto.randomUUID();
            return publicHtmlResponse(landingPage(env, scriptNonce, acquisitionSourceFromLandingParam(url.searchParams.get("source"))), { scriptNonce });
        }
        if (request.method === "GET" && url.pathname === "/privacy") {
            return publicHtmlResponse(privacyPolicyPage(env));
        }

        if (request.method !== "POST") {
            return new Response(`${publicRuntimeConfig(env).botBrandName} is running.`);
        }

        const webhookSecret = request.headers.get(
            "X-Telegram-Bot-Api-Secret-Token"
        );

        if (webhookSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
            return new Response("Unauthorized", { status: 401 });
        }

        let update;
        try {
            update = await request.json();
        } catch {
            return new Response("Invalid request", { status: 400 });
        }

        const processed = await env.DB
            .prepare(
                "INSERT OR IGNORE INTO processed_updates (update_id) VALUES (?)"
            )
            .bind(update.update_id)
            .run();

        if (processed.meta.changes === 0) {
            return new Response("ok");
        }

        const callback = update.callback_query;

        if (callback?.data) {
            const chatId = callback.message?.chat?.id;
            const chatType = callback.message?.chat?.type;
            const messageId = callback.message?.message_id;
            const userId = callback.from?.id;

            if (!chatId || !messageId || !userId || chatType !== "private") {
                return new Response("ok");
            }

            // Button-only interactions still carry the Telegram profile. Fill only
            // missing fields so an absent username can never erase known data.
            await env.DB.prepare(`
                UPDATE users SET
                  last_seen_at = CURRENT_TIMESTAMP,
                  telegram_username = CASE
                    WHEN NULLIF(TRIM(telegram_username), '') IS NULL THEN ?
                    ELSE telegram_username
                  END,
                  telegram_first_name = CASE
                    WHEN NULLIF(TRIM(telegram_first_name), '') IS NULL THEN ?
                    ELSE telegram_first_name
                  END
                WHERE telegram_user_id = ?
            `)
                .bind(callback.from.username ?? null, callback.from.first_name ?? null, userId)
                .run();
            await refreshInterfaceIfNeeded(env, chatId, userId);

            if (await handleAdminCallback(env, callback, { chatId, messageId, userId }, {
                isAdmin,
                dailyAddLimit: DAILY_ADD_LIMIT,
                getBotLink,
            })) {
                return new Response("ok");
            }

            if (await handleDonationCallback(env, callback, { chatId, messageId, userId }, {
                isAdmin,
                grantDonationBonus: grantDonationBonusRequest,
                rejectDonationBonus: rejectDonationBonusRequest,
                grantTemporaryAccessLevel,
            })) {
                return new Response("ok");
            }

            if (await handleDonationSupportBonusCallback(env, callback, { chatId, userId }, {
                notifyPendingDonationRequests,
            })) {
                return new Response("ok");
            }

            if (await handleLimitOptionsCallback(env, callback, { chatId, userId }, {
                sendDonationInstructions,
                submitDonationBonusRequest: submitDonationBonusRequestFlow,
                notifyPendingDonationRequests,
            })) {
                return new Response("ok");
            }

            if (await handleExamplesCallback(env, callback, { chatId, userId })) {
                return new Response("ok");
            }

            if (await handleDailySettingsCallback(env, callback, { chatId, messageId, userId }, { queueDailyWordPrefetch })) {
                return new Response("ok");
            }

            if (await handleTextTranslationCallback(env, callback, { chatId, messageId, userId })) {
                return new Response("ok");
            }

            if (await handleDailyWordCallback(env, callback, { chatId, messageId, userId }, {
                claimDailyWordAddition,
                getDailyAdditionLimit,
                sendLimitReachedOptions: (targetEnv, targetChatId, targetUserId, limit) => sendLimitReachedOptions(targetEnv, targetChatId, targetUserId, limit, {
                    referralInvitation: (referralEnv, referralUserId) => referralInvitation(referralEnv, referralUserId, { getBotLink }),
                }),
                queueNextDailyWord,
                sendReadyNextDailyWord: (targetEnv, targetChatId, targetUserId, pendingId, targetMessageId) => deliverReadyNextDailyWord(targetEnv, targetChatId, targetUserId, pendingId, {
                    claimDailyWordCard,
                    access: { isAdmin, getUserAccessLevel, dailyWordCardLimitForLevel },
                    dailyWordCardLimitForLevel,
                    getUserAccessLevel,
                    queueDailyWordPrefetch,
                }, targetMessageId),
                sendNextDailyWord: (targetEnv, targetChatId, targetUserId, pendingId, targetMessageId) => deliverNextDailyWord(targetEnv, targetChatId, targetUserId, pendingId, {
                    claimDailyWordCard,
                    access: { isAdmin, getUserAccessLevel, dailyWordCardLimitForLevel },
                    dailyWordCardLimitForLevel,
                    getUserAccessLevel,
                    generateNewDailyWord,
                    generateDailyWordCard,
                    maxAttempts: MAX_DAILY_WORD_ATTEMPTS,
                    queueDailyWordPrefetch,
                }, targetMessageId),
                sendPreviousDailyWord: (targetEnv, targetChatId, targetUserId, pendingId, targetMessageId) => deliverPreviousDailyWord(targetEnv, targetChatId, targetUserId, pendingId, targetMessageId),
            })) {
                return new Response("ok");
            }

            if (await handleWordListCallback(env, callback, { chatId, messageId, userId })) {
                return new Response("ok");
            }

            await handleVocabularyCallback(env, callback, { chatId, messageId, userId });

            return new Response("ok");
        }

        const message = update.message;

        if (
            !message?.chat?.id ||
            !message?.from?.id ||
            !message.text ||
            message.chat.type !== "private"
        ) {
            return new Response("ok");
        }

        const chatId = message.chat.id;
        const userId = message.from.id;
        const text = message.text.trim();
        const acquisition = acquisitionAttributionFromStartCommand(text);
        const referralUserId = referralUserIdFromStartCommand(text);
        const existingUser = (referralUserId || acquisition?.campaign)
            ? await env.DB.prepare("SELECT telegram_user_id FROM users WHERE telegram_user_id = ?").bind(userId).first()
            : null;
        if (acquisition) {
            console.info({ event: "telegram_acquisition_source_received", source: acquisition.reportSource });
        }

        await env.DB
            .prepare(`
        INSERT INTO users (telegram_user_id, chat_id, timezone, daily_time, daily_level, telegram_username, telegram_first_name, acquisition_source, acquisition_campaign, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(telegram_user_id)
        DO UPDATE SET chat_id = excluded.chat_id, is_active = 1,
          telegram_username = excluded.telegram_username,
          telegram_first_name = excluded.telegram_first_name,
          last_seen_at = CURRENT_TIMESTAMP
      `)
            .bind(
                userId,
                chatId,
                DEFAULT_DAILY_SETTINGS.timezone,
                DEFAULT_DAILY_SETTINGS.daily_time,
                DEFAULT_DAILY_SETTINGS.daily_level,
                message.from.username ?? null,
                message.from.first_name ?? null,
                acquisition?.source ?? null,
                null
            )
            .run();

        if (acquisition?.campaign && !existingUser) {
            await env.DB.prepare(`
                INSERT OR IGNORE INTO user_acquisition_campaigns (user_id, campaign)
                VALUES (?, ?)
            `).bind(userId, acquisition.campaign).run();
        }

        if (referralUserId && !existingUser) {
            try {
                const rewarded = await rewardReferralFromNewUser(env, referralUserId, userId);
                console.info({ event: "referral_start_processed", rewarded });
            } catch (error) {
                console.error({ event: "referral_reward_failed", message: error instanceof Error ? error.message : "Unknown error" });
            }
        }

        if (!isTelegramStartCommand(text) && text !== "/menu") {
            await refreshInterfaceIfNeeded(env, chatId, userId);
        }

        // Any command or menu action abandons a feedback draft, so a later
        // vocabulary word cannot accidentally be forwarded as feedback.
        if (shouldClearPendingFeedback(text)) {
            await clearPendingFeedback(env, userId);
            await clearPendingTextTranslation(env, userId);
        }

        if (await handleNavigationMessage(env, text, { chatId, userId }, {
            isAdmin,
            keyboardForUser: mainKeyboardForUser,
            markInterfaceVersion,
            sendMessage,
            sendActiveWordList,
            sendLearnedWordList,
            sendDailySettings,
            sendTextTranslationMenu,
            sendTodayDailyWord: (targetEnv, targetChatId, targetUserId) => deliverTodayDailyWord(targetEnv, targetChatId, targetUserId, {
                claimDailyWordCard,
                access: { isAdmin, getUserAccessLevel, dailyWordCardLimitForLevel },
                dailyWordCardLimitForLevel,
                getUserAccessLevel,
                generateNewDailyWord,
                generateDailyWordCard,
                maxAttempts: MAX_DAILY_WORD_ATTEMPTS,
                queueDailyWordPrefetch,
            }),
            sendDonationInstructions,
            submitDonationBonusRequest: submitDonationBonusRequestFlow,
            notifyPendingDonationRequests,
            startFeedback,
            adminHelpText,
            adminKeyboard,
            sendHelp: sendHelpFlow,
            privacyPolicyUrl: `${publicRuntimeConfig(env).publicWorkerUrl}/privacy`,
            addWordHint: contentFor().vocabulary.addWordHint,
            welcome: messages.welcome,
            getDailySettings,
            queueDailyWordPrefetch,
            contactPrompt: messages.contactPrompt,
            getBotLink,
            referralInvitation: (targetEnv, targetUserId) => referralInvitation(targetEnv, targetUserId, { getBotLink }),
            logError(event, error) {
                console.error({ event, message: error instanceof Error ? error.message : "Unknown error" });
            },
        })) {
            return new Response("ok");
        }

        const feedbackState = await env.DB
            .prepare("SELECT feedback_pending, feedback_kind FROM users WHERE telegram_user_id = ?")
            .bind(userId)
            .first();

        if (feedbackState?.feedback_pending === 1 && !text.startsWith("/")) {
            try {
                const type = feedbackState.feedback_kind === USER_MESSAGE_TYPE.CONTACT
                    ? USER_MESSAGE_TYPE.CONTACT
                    : USER_MESSAGE_TYPE.FEEDBACK;
                await submitFeedback(env, chatId, userId, text.slice(0, 3500), getAdminChatId, type);
            } catch (error) {
                console.error({ event: "feedback_delivery_failed", message: error instanceof Error ? error.message : "Unknown error" });
                await sendMessage(env, chatId, "Не вдалося передати відгук. Спробуй надіслати його ще раз за хвилину.");
            }
            return new Response("ok");
        }
        if (await handlePendingTextTranslation(env, chatId, userId, text)) {
            return new Response("ok");
        }
        if (await handleVocabularyTextCommand(env, text, { chatId, userId }, {
            sendMessage,
            parseVocabularyInput,
            claimDailyWordAddition,
            getDailyAdditionLimit,
            dailyLimitReachedText,
            sendLimitReachedOptions: (targetEnv, targetChatId, targetUserId, limit) => sendLimitReachedOptions(targetEnv, targetChatId, targetUserId, limit, {
                referralInvitation: (referralEnv, referralUserId) => referralInvitation(referralEnv, referralUserId, { getBotLink }),
            }),
            closePendingSelection,
            saveAndSendWord,
            suggestSenses,
            senseText,
            senseKeyboard,
            wordCountLabel,
            listLimit: LIST_LIMIT,
            getRecentActiveWords,
            getRecentArchivedWords,
            sendActiveWordList,
            sendLearnedWordList,
        })) {
            return new Response("ok");
        }

        if (await handleAdminCommand(env, text, { chatId, userId }, {
            isAdmin,
            wordCountLabel,
            dailyWordCardLimitForLevel,
            grantManualDailyLimit: (targetEnv, targetUserId, dailyLimit) => grantManualDailyLimitFlow(targetEnv, targetUserId, dailyLimit, { getUserAccessLevel, dailyWordCardLimitForLevel, adminSettingsUpdated: messages.adminSettingsUpdated }),
            grantManualAccessLevel: (targetEnv, targetUserId, accessLevel) => grantManualAccessLevelFlow(targetEnv, targetUserId, accessLevel, { grantAccessLevel, getDailyAdditionLimit, dailyAddLimit: DAILY_ADD_LIMIT, dailyWordCardLimitForLevel, adminSettingsUpdated: messages.adminSettingsUpdated }),
            grantTestLevelOne: (targetEnv, targetUserId) => grantTestLevelOneFlow(targetEnv, targetUserId, { grantTemporaryAccessLevel, getDailyAdditionLimit, dailyAddLimit: DAILY_ADD_LIMIT, dailyWordCardLimitForLevel, adminSettingsUpdated: messages.adminSettingsUpdated }),
            sendAcquisitionSourceSummary,
        })) {
            return new Response("ok");
        }

        if (text.startsWith("/")) {
            await sendHelpFlow(env, chatId, userId, mainKeyboardForUser);
            return new Response("ok");
        }

        return new Response("ok");
    },

    async queue(batch, env) {
        for (const message of batch.messages) {
            try {
                if (message.body.kind === "daily-word-prefetch") {
                    const result = await processDailyWordPrefetch(env, message.body.userId, {
                        fillDailyWordPrefetches: (targetEnv, targetUserId, level) => import("./src/features/daily-words/daily-words.js").then(({ fillDailyWordPrefetches }) => fillDailyWordPrefetches(targetEnv, targetUserId, level, generateDailyWordCard, MAX_DAILY_WORD_ATTEMPTS)),
                    });
                    if (result === "retry") message.retry({ delaySeconds: 60 }); else message.ack();
                    continue;
                }
                if (message.body.kind !== "daily-word-interactive" || !Number.isInteger(message.body.jobId)) {
                    console.warn({ event: "daily_word_queue_message_ignored", kind: message.body?.kind ?? "missing" });
                    message.ack();
                    continue;
                }
                const result = await processDailyWordJob(env, message.body.jobId, {
                    sendNextDailyWord: (targetEnv, targetChatId, targetUserId, pendingId, targetMessageId) => deliverNextDailyWord(targetEnv, targetChatId, targetUserId, pendingId, {
                        claimDailyWordCard,
                        access: { isAdmin, getUserAccessLevel, dailyWordCardLimitForLevel },
                        dailyWordCardLimitForLevel,
                        getUserAccessLevel,
                        generateNewDailyWord,
                        generateDailyWordCard,
                        maxAttempts: MAX_DAILY_WORD_ATTEMPTS,
                        queueDailyWordPrefetch,
                    }, targetMessageId),
                });
                if (result === "retry-fast") message.retry({ delaySeconds: 1 });
                else if (result === "retry") message.retry({ delaySeconds: 15 });
                else message.ack();
            } catch (error) {
                console.error({ event: "daily_word_queue_message_failed", message: error instanceof Error ? error.message : "Unknown error" });
                message.retry({ delaySeconds: 15 });
            }
        }
    },

    async scheduled(controller, env) {
        try {
            await ensureTelegramWebhookFlow(env, publicRuntimeConfig(env).publicWorkerUrl, telegramApi);
        } catch (error) {
            console.error({
                event: "telegram_webhook_configuration_failed",
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }

        if (controller.cron === "0 3 * * *") {
            try {
                await cleanupLearnedWords(env, LEARNED_WORD_RETENTION_DAYS);
            } catch (error) {
                console.error({
                    event: "learned_word_cleanup_failed",
                    message: error instanceof Error ? error.message : "Unknown error",
                });
            }
            try {
                await notifyPendingDonationReminder(env);
            } catch (error) {
                console.error({
                    event: "pending_bonus_reminder_failed",
                    message: error instanceof Error ? error.message : "Unknown error",
                });
            }
        }

        try {
            await notifyExpiredDonationAccessGrantsFlow(env, mainKeyboardForUser);
        } catch (error) {
            console.error({
                event: "expired_donation_access_notification_failed",
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }

        try {
            await requeueDailyWordJobs(env);
        } catch (error) {
            console.error({ event: "daily_word_job_requeue_failed", message: error instanceof Error ? error.message : "Unknown error" });
        }
        try {
            await deliverDueDailyWords(env, controller.scheduledTime, {
                claimDailyWordCard,
                access: { isAdmin, getUserAccessLevel, dailyWordCardLimitForLevel },
                generateNewDailyWord,
                generateDailyWordCard,
                maxAttempts: MAX_DAILY_WORD_ATTEMPTS,
                queueDailyWordPrefetch,
            });
        } catch (error) {
            console.error({
                event: "daily_word_schedule_failed",
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }

        try {
            await queueDailyWordPrefetchCoverage(env);
        } catch (error) {
            console.error({ event: "daily_word_prefetch_coverage_failed", message: error instanceof Error ? error.message : "Unknown error" });
        }

        try {
            await syncMonobankDonations(env, controller.scheduledTime);
        } catch (error) {
            console.error({
                event: "monobank_donation_sync_failed",
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    },
};
