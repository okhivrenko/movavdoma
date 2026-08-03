// MovaVDoma Telegram Bot — Copyright (c) 2026 Oleksii Khivrenko.
// Publicly viewable under the proprietary terms in LICENSE.

import {
    answerCallbackQuery,
    editMessage,
    getBotLink,
    sendMessage,
    telegramApi,
} from "./telegram.js";
import {
    closePendingSelection,
    handleVocabularyCallback,
    saveAndSendWord,
    suggestSenses,
} from "./vocabulary-cards.js";
import { createMonobankDonationSync } from "./monobank-donations.js";
import {
    sendDonationInstructions,
    submitDonationBonusRequest as submitDonationBonusRequestFlow,
} from "./donation-requests.js";
import { grantDonationBonus as grantDonationBonusRequest, rejectDonationBonus as rejectDonationBonusRequest } from "./donation-grants.js";
import { adminDonationKeyboard, notifyPendingDonationRequests as notifyDonationReviews, notifyUnmatchedDonations as notifyUnmatchedDonationAlerts } from "./donation-notifications.js";
import {
    getAdminChatId,
    getUserAccessLevel,
    grantAccessLevel,
    grantTemporaryAccessLevel,
} from "./access-levels.js";
import { ADD_WORD_HINT, messages } from "./messages.js";
import {
    DAILY_LEVEL_OPTIONS,
    DAILY_TIME_OPTIONS,
    dailyLevelKeyboard,
    dailyTimeKeyboard,
    getDailySettings,
    refreshDailySettings,
    sendDailySettings,
} from "./daily-settings.js";
import {
    getRecentActiveWords,
    LIST_LIMIT,
    refreshArchivedMessage,
    refreshListMessage,
    sendActiveWordList,
    sendLearnedWordList,
    sendWordExamples,
} from "./word-list.js";
import {
    dailyScheduleKeyboardLabel,
    DEFAULT_DAILY_SETTINGS,
    dailyLimitReachedText,
    formatHryvnias,
    isAdmin,
    localDateAndTime,
    parseVocabularyInput,
    wordCountLabel,
} from "./helpers.js";
import {
    dailyWordCardLimitForLevel,
    donationAccessLevel,
} from "./policies.js";
import {
    claimDailyWordCard,
    generateDailyWordCard,
    generateNewDailyWord,
} from "./daily-words.js";
import { handleDailyWordCallback } from "./daily-word-callbacks.js";
import { clearPendingFeedback, startFeedback, submitFeedback } from "./feedback.js";
import { removeExpiredLearnedWords as cleanupLearnedWords } from "./learned-word-cleanup.js";
import { sendDueDailyWords as deliverDueDailyWords, sendTodayDailyWord as deliverTodayDailyWord } from "./daily-delivery.js";

// Default daily quota for newly saved words; individual bonuses may raise it.
const DAILY_ADD_LIMIT = 10;
// Daily-card quota is separate from the learning-list quota and depends on access.
const MONOBANK_JAR_SEND_ID = "9vp8W5V9nQ";
const BOT_BRAND_NAME = "MovaVDoma";
// The Worker name is still technical for now. Keep this URL aligned with its
// active workers.dev route; it also lets the cron repair Telegram's webhook
// after an account-subdomain or Worker-name change.
const PUBLIC_WORKER_URL = "https://movavdoma.oleksiikhivrenko.workers.dev";
const PRIVACY_POLICY_URL = `${PUBLIC_WORKER_URL}/privacy`;
const MAX_DAILY_WORD_ATTEMPTS = 3;
const ADMIN_USER_LIST_LIMIT = 50;
const LEARNED_WORD_RETENTION_DAYS = 30;
// Increment only when the persistent reply keyboard changes for users.
const INTERFACE_VERSION = 7;

// User-facing reply/inline keyboards and the admin-only user directory.
// Authorization itself stays in helpers.js so every entry path compares IDs consistently.
function mainKeyboard(showAdmin = false, page = 1, dailySettings = DEFAULT_DAILY_SETTINGS) {
    const firstPage = [
        [{ text: "➕ Додати слово" }, { text: "📚 Мої слова" }],
        [{ text: "📚 Щоденне слово" }, { text: "🎓 Вивчені слова" }],
        [{ text: dailyScheduleKeyboardLabel(dailySettings) }],
        [{ text: "❓ Допомога" }, { text: "➡️ Далі" }],
    ];
    const secondPage = [
        [{ text: "☕ Підтримати бот" }, { text: "🎁 Отримати бонус" }],
        [{ text: "💬 Відгук" }, { text: "📩 Зв’язатися з нами" }],
    ];

    if (showAdmin) {
        secondPage.push([{ text: "🛠 Адмін" }]);
    }

    secondPage.push([{ text: "⬅️ Назад" }]);

    return {
        keyboard: page === 2 ? secondPage : firstPage,
        resize_keyboard: true,
        is_persistent: true,
    };
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

function adminKeyboard() {
    return {
        inline_keyboard: [
            [{ text: "👥 Список користувачів", callback_data: "admin:users" }],
            [{ text: "🔗 Посилання на бота", callback_data: "admin:link" }],
            [{ text: "🎁 Змінити ліміт", callback_data: "admin:grant" }],
            [{ text: "🎚 Змінити рівень", callback_data: "admin:level" }],
            [{ text: "🧪 Тест рівня 1", callback_data: "admin:testlevel" }],
            [{ text: "❓ Команди адміна", callback_data: "admin:help" }],
        ],
    };
}

function adminHelpText() {
    return "🛠 Адмін-панель\n\n• 👥 Список користувачів — усі користувачі, по 50 на сторінці, з ID, лімітами та кількістю активних слів.\n• 🔗 Посилання на бота — показує пряме посилання, яке можна скопіювати або переслати.\n• /grant <userId> <ліміт> — встановити ліміт додавання слів на 1 місяць.\n  Приклад: /grant 123456789 45\n• /level <userId> <0-3> — постійно підвищити рівень доступу. Щоденні картки: 0→5, 1→10, 2→15, 3→20.\n  Приклад: /level 123456789 2\n• /testlevel <userId> — видати тестовий рівень 1 на 1 день.\n  Приклад: /testlevel 123456789\n• 🎁 Заявки на донати приходять окремими картками з кнопками підтвердження.";
}

function compactAdminNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
        return "?";
    }

    return number > 999 ? "999+" : String(Math.floor(number));
}

function adminUserListKeyboard(page, totalPages) {
    const navigation = [];

    if (page > 0) {
        navigation.push({ text: "← Назад", callback_data: `admin:users:${page - 1}` });
    }

    if (page < totalPages - 1) {
        navigation.push({ text: "Далі →", callback_data: `admin:users:${page + 1}` });
    }

    return navigation.length > 0 ? { inline_keyboard: [navigation] } : { inline_keyboard: [] };
}

async function sendAdminUserList(env, chatId, requestedPage = 0, messageId = null) {
    const count = await env.DB
        .prepare("SELECT COUNT(*) AS total FROM users")
        .first();
    const total = Number(count?.total ?? 0);

    if (total === 0) {
        await sendMessage(env, chatId, "Користувачів поки немає.");
        return;
    }

    const totalPages = Math.ceil(total / ADMIN_USER_LIST_LIMIT);
    const page = Math.min(Math.max(requestedPage, 0), totalPages - 1);
    const result = await env.DB
        .prepare(`
          SELECT
            u.telegram_user_id,
            (SELECT COUNT(*) FROM words w WHERE w.user_id = u.telegram_user_id AND w.is_active = 1) AS active_word_count,
            (SELECT daily_limit FROM user_daily_limits l WHERE l.user_id = u.telegram_user_id AND l.expires_at > CURRENT_TIMESTAMP) AS bonus_daily_limit
            ,MAX(
              COALESCE((SELECT access_level FROM user_access_levels a WHERE a.user_id = u.telegram_user_id), 0),
              COALESCE((SELECT MAX(access_level) FROM user_temporary_access_grants g WHERE g.user_id = u.telegram_user_id AND g.expires_at > CURRENT_TIMESTAMP), 0)
            ) AS access_level
          FROM users u
          ORDER BY u.created_at DESC
          LIMIT ? OFFSET ?
        `)
        .bind(ADMIN_USER_LIST_LIMIT, page * ADMIN_USER_LIST_LIMIT)
        .all();

    const text = result.results
        .map((user, index) => {
            const dailyLimit = isAdmin(env, user.telegram_user_id)
                ? "∞"
                : compactAdminNumber(user.bonus_daily_limit ?? DAILY_ADD_LIMIT);
            const position = page * ADMIN_USER_LIST_LIMIT + index + 1;
            return `${position}. ID ${user.telegram_user_id} · слів: ${compactAdminNumber(user.active_word_count)} · ліміт: ${dailyLimit} · рівень: ${user.access_level}`;
        })
        .join("\n");

    const listText = `👥 Користувачі: ${total}\nСторінка ${page + 1} з ${totalPages}\n\n${text}\n\nЩоб змінити ліміт: /grant userId ліміт`;
    const keyboard = adminUserListKeyboard(page, totalPages);

    if (messageId) {
        await editMessage(env, chatId, messageId, listText, keyboard);
        return;
    }

    await sendMessage(env, chatId, listText, keyboard);
}

async function grantTestLevelOne(env, userId) {
    const user = await env.DB
        .prepare("SELECT chat_id FROM users WHERE telegram_user_id = ?")
        .bind(userId)
        .first();

    if (!user?.chat_id) return null;

    const access = await grantTemporaryAccessLevel(env, userId, 1, "admin_test", "+1 day");
    const dailyAdditionLimit = await getDailyAdditionLimit(env, userId);
    await sendMessage(
        env,
        user.chat_id,
        messages.adminSettingsUpdated(
            dailyAdditionLimit ?? DAILY_ADD_LIMIT,
            dailyWordCardLimitForLevel(access.accessLevel)
        )
    );
    return access;
}

async function notifyPendingDonationRequests(env) {
    return notifyDonationReviews(env, getAdminChatId, {
        donationAccessLevel, formatHryvnias, dailyWordCardLimitForLevel, sendMessage,
    });
}

async function notifyUnmatchedDonations(env) {
    return notifyUnmatchedDonationAlerts(env, getAdminChatId, { formatHryvnias, sendMessage });
}

async function notifyExpiredDonationAccessGrants(env) {
    const expired = await env.DB
        .prepare(`
          SELECT g.id, g.user_id, u.chat_id
          FROM user_temporary_access_grants g
          JOIN users u ON u.telegram_user_id = g.user_id
          WHERE g.source = 'donation'
            AND g.expires_at <= CURRENT_TIMESTAMP
            AND g.expired_notified_at IS NULL
          ORDER BY g.id ASC
        `)
        .all();

    for (const grant of expired.results) {
        const claimed = await env.DB
            .prepare(`
              UPDATE user_temporary_access_grants
              SET expired_notified_at = CURRENT_TIMESTAMP
              WHERE id = ? AND expired_notified_at IS NULL
            `)
            .bind(grant.id)
            .run();

        if (claimed.meta.changes === 0) continue;

        try {
            await sendMessage(
                env,
                grant.chat_id,
                "🎁 Дякуємо, що користуєшся ботом! На жаль, твій бонусний період завершився.\n\nБудемо вдячні за подальшу підтримку: навіть одна кавуська мотивує нас робити бот кращим.\n\nЯкщо маєш зауваження, ідеї або просто хочеш поділитися враженням — натисни «➡️ Далі», а потім «💬 Відгук». Це допомагає нам ставати кращими.",
                await mainKeyboardForUser(env, grant.user_id)
            );
        } catch (error) {
            await env.DB
                .prepare("UPDATE user_temporary_access_grants SET expired_notified_at = NULL WHERE id = ?")
                .bind(grant.id)
                .run();
            throw error;
        }
    }
}

// Remove only already learned vocabulary after its retention period. Child rows
// are deleted first because examples and reviews reference the vocabulary word.
/** Admin-only upgrade. Levels are intentionally monotonic: support is never lost. */
async function grantManualAccessLevel(env, userId, accessLevel) {
    const user = await env.DB
        .prepare("SELECT chat_id FROM users WHERE telegram_user_id = ?")
        .bind(userId)
        .first();

    if (!user?.chat_id) return null;

    const access = await grantAccessLevel(env, userId, accessLevel, "manual");

    if (access.changed) {
        const dailyAdditionLimit = await getDailyAdditionLimit(env, userId);
        await sendMessage(
            env,
            user.chat_id,
            messages.adminSettingsUpdated(
                dailyAdditionLimit ?? DAILY_ADD_LIMIT,
                dailyWordCardLimitForLevel(access.accessLevel)
            )
        );
    }

    return access;
}

async function grantManualDailyLimit(env, userId, dailyLimit) {
    const user = await env.DB
        .prepare("SELECT chat_id FROM users WHERE telegram_user_id = ?")
        .bind(userId)
        .first();

    if (!user?.chat_id) {
        return false;
    }

    await env.DB
        .prepare(`
          INSERT INTO user_daily_limits (user_id, daily_limit, donation_request_id, expires_at)
          VALUES (?, ?, NULL, datetime('now', '+1 month'))
          ON CONFLICT(user_id) DO UPDATE SET
            daily_limit = excluded.daily_limit,
            donation_request_id = NULL,
            expires_at = excluded.expires_at,
            granted_at = CURRENT_TIMESTAMP
        `)
        .bind(userId, dailyLimit)
        .run();

    const accessLevel = await getUserAccessLevel(env, userId);
    await sendMessage(
        env,
        user.chat_id,
        messages.adminSettingsUpdated(
            dailyLimit,
            dailyWordCardLimitForLevel(accessLevel)
        )
    );

    return true;
}

// This UPSERT is the quota enforcement point: it atomically claims a daily slot
// before a new word is generated or saved, preventing normal double additions.
async function claimDailyWordAddition(env, userId) {
    if (isAdmin(env, userId)) {
        return true;
    }

    const user = await env.DB
        .prepare("SELECT timezone FROM users WHERE telegram_user_id = ?")
        .bind(userId)
        .first();
    const limit = await env.DB
        .prepare("SELECT daily_limit FROM user_daily_limits WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP")
        .bind(userId)
        .first();
    const localTime = localDateAndTime(
        user?.timezone ?? "Europe/Warsaw",
        Date.now()
    );

    if (!localTime) {
        throw new Error("Unable to calculate daily addition date.");
    }

    const claimed = await env.DB
        .prepare(`
          INSERT INTO daily_word_additions (user_id, local_date, additions)
          VALUES (?, ?, 1)
          ON CONFLICT(user_id, local_date) DO UPDATE
          SET additions = additions + 1
          WHERE additions < ?
        `)
        .bind(userId, localTime.date, limit?.daily_limit ?? DAILY_ADD_LIMIT)
        .run();

    return claimed.meta.changes > 0;
}

async function getDailyAdditionLimit(env, userId) {
    if (isAdmin(env, userId)) {
        return null;
    }

    const limit = await env.DB
        .prepare("SELECT daily_limit FROM user_daily_limits WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP")
        .bind(userId)
        .first();

    return limit?.daily_limit ?? DAILY_ADD_LIMIT;
}

const syncMonobankDonations = createMonobankDonationSync({
    jarSendId: MONOBANK_JAR_SEND_ID,
    notifyPendingDonationRequests,
    notifyUnmatchedDonations,
});

async function sendHelp(env, chatId, userId) {
    await sendMessage(
        env,
        chatId,
        "Як користуватися ботом:\n\n1. Натисни «➕ Додати слово» або просто надішли англійське слово чи фразу. Наприклад: resilient\n2. Якщо потрібне конкретне значення, це необов’язково, але можеш додати його після / (також працюють | та \\):\ncharge / payment for a service\n3. Обери потрібне значення, якщо бот його уточнить.\n4. Відкрий «📚 Мої слова», щоб переглянути свій каталог.\n5. Відкрий «🎓 Вивчені слова», щоб повернути слово до навчання.\n6. Натисни «📚 Щоденне слово», щоб показати сьогоднішню картку, або «⏰ Розклад і рівень», щоб окремо вибрати час і рівень. У картці натисни «Знаю» або «Вчити».\n7. На другій сторінці меню є підтримка, бонуси, відгук і зв’язок із нами.\n8. Є ідея, запитання чи хочеш створити власного бота? Натисни «📩 Зв’язатися з нами» та надішли повідомлення.",
        await mainKeyboardForUser(env, userId)
    );
}

// A public, static policy page is intentionally served before webhook
// authentication so Telegram and users can open it without bot credentials.
function privacyPolicyPage() {
    return `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Privacy Policy - ${BOT_BRAND_NAME}</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #16243a; background: #f6f8fb; }
    body { margin: 0; padding: 32px 16px; }
    main { max-width: 760px; margin: 0 auto; padding: 42px; background: #fff; border: 1px solid #dce4ef; border-radius: 20px; box-shadow: 0 12px 35px rgba(31, 52, 81, .08); }
    h1 { margin: 0 0 8px; font-size: 32px; } h2 { margin-top: 32px; font-size: 21px; } p, li { color: #40516a; line-height: 1.6; } .date { color: #66758b; margin-top: 0; } strong { color: #16243a; } code { padding: 2px 5px; background: #edf2f8; border-radius: 4px; }
  </style>
</head>
<body><main>
  <h1>Privacy Policy for ${BOT_BRAND_NAME}</h1>
  <p class="date">Дата набуття чинності: 2 серпня 2026 року</p>
  <p>${BOT_BRAND_NAME} - Telegram-бот для вивчення лексики. Нижче описано, які дані бот обробляє, навіщо це потрібно та як із нами зв'язатися.</p>

  <h2>1. Які дані обробляються</h2>
  <ul><li>Telegram user ID і chat ID;</li><li>слова, фрази, необов'язковий контекст і повідомлення feedback;</li><li>налаштування навчання: рівень, час нагадування, статуси слів і ліміти;</li><li>створені переклади, приклади та прогрес навчання;</li><li>технічні записи для захисту від повторних Telegram-оновлень і роботи нагадувань;</li><li>для заявки на бонус: код підтримки, статус заявки й відомості з виписки банки Monobank - сума, час і коментар до платежу.</li></ul>
  <p>Бот не запитує і не зберігає номери карток, CVV або паролі Telegram.</p>

  <h2>2. Навіщо це потрібно</h2>
  <p>Дані використовуються лише для створення карток слів, збереження словника й прогресу, надсилання увімкнених нагадувань, керування бонусами, обробки feedback і безпечної роботи бота.</p>

  <h2>3. Сторонні сервіси</h2>
  <ul><li><strong>Telegram</strong> доставляє повідомлення між вами та ботом.</li><li><strong>Cloudflare</strong> розміщує бот і базу даних D1.</li><li><strong>OpenAI</strong> отримує слово або фразу та необов'язковий контекст для створення перекладу, значень і прикладів.</li><li><strong>Monobank</strong> використовується лише для перевірки донату до підключеної банки.</li></ul>
  <p>Повідомлення через «📩 Зв'язатися з нами» та «💬 Відгук» пересилаються адміну бота. Дані не продаються й не використовуються для реклами.</p>

  <h2>4. Строк зберігання</h2>
  <p>Активні слова зберігаються, доки ви не попросите видалити дані. Вивчені слова автоматично видаляються через 30 днів після позначення як вивчені разом із прикладами та історією повторень. Технічні записи зберігаються лише настільки, наскільки це потрібно для роботи, безпеки й підтримки бота.</p>

  <h2>5. Ваші права та запити</h2>
  <p>Нагадування можна вимкнути у «⏰ Розклад і рівень». Щоб попросити доступ, виправлення або видалення даних, натисніть «📩 Зв'язатися з нами» й надішліть <code>Delete my data</code> або <code>Видалити мої дані</code>. Для захисту даних ми можемо попросити підтвердити запит із того ж Telegram-акаунта.</p>

  <h2>6. Безпека та зміни</h2>
  <p>Бот використовує HTTPS і обмежує адміністративні дії налаштованим адміністратором. Не надсилайте боту паролі, дані картки або іншу чутливу інформацію. Політика може оновлюватися разом зі змінами функцій або практик обробки даних.</p>

  <h2>7. Контакт</h2>
  <p>З питань приватності використовуйте кнопку «📩 Зв'язатися з нами» у боті.</p>
</main></body></html>`;
}

// Telegram stores a full webhook URL, so changing a workers.dev subdomain
// otherwise leaves the bot pointing to its old host. An operation key makes
// this idempotent: the configured URL is sent once and retried only on error.
async function ensureTelegramWebhook(env) {
    const operationKey = `telegram_webhook:${PUBLIC_WORKER_URL}`;
    const claim = await env.DB
        .prepare("INSERT OR IGNORE INTO worker_operations (operation_key) VALUES (?)")
        .bind(operationKey)
        .run();

    if (claim.meta.changes === 0) {
        return;
    }

    try {
        await telegramApi(env, "setWebhook", {
            url: PUBLIC_WORKER_URL,
            secret_token: env.TELEGRAM_WEBHOOK_SECRET,
            allowed_updates: ["message", "callback_query"],
        });
        console.log({ event: "telegram_webhook_configured", url: PUBLIC_WORKER_URL });
    } catch (error) {
        await env.DB
            .prepare("DELETE FROM worker_operations WHERE operation_key = ?")
            .bind(operationKey)
            .run();
        throw error;
    }
}

// Telegram webhook and scheduled delivery entry points. Callback actions are
// validated in the router before any user-owned data is read or changed.
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/privacy") {
            return new Response(privacyPolicyPage(), {
                headers: {
                    "content-type": "text/html; charset=UTF-8",
                    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
                    "x-content-type-options": "nosniff",
                },
            });
        }

        if (request.method !== "POST") {
            return new Response(`${BOT_BRAND_NAME} is running.`);
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

            await refreshInterfaceIfNeeded(env, chatId, userId);

            if (callback.data.startsWith("admin:")) {
                if (!isAdmin(env, userId)) {
                    await answerCallbackQuery(env, callback.id, "Ця дія доступна лише адміну.");
                    return new Response("ok");
                }

                const usersMatch = callback.data.match(/^admin:users(?::(\d+))?$/);

                if (usersMatch) {
                    const page = Number(usersMatch[1] ?? 0);

                    if (!Number.isInteger(page) || page < 0) {
                        await answerCallbackQuery(env, callback.id, "Невірна сторінка.");
                        return new Response("ok");
                    }

                    await answerCallbackQuery(env, callback.id, "Готую список користувачів.");
                    await sendAdminUserList(
                        env,
                        chatId,
                        page,
                        usersMatch[1] ? messageId : null
                    );
                    return new Response("ok");
                }

                if (callback.data === "admin:grant") {
                    await answerCallbackQuery(env, callback.id, "Показую формат команди.");
                    await sendMessage(
                        env,
                        chatId,
                        "Щоб змінити ліміт користувача, надішли:\n/grant userId ліміт\n\nНаприклад: /grant 123456789 45"
                    );
                    return new Response("ok");
                }

                if (callback.data === "admin:level") {
                    await answerCallbackQuery(env, callback.id, "Показую формат команди.");
                    await sendMessage(
                        env,
                        chatId,
                        "Щоб підвищити рівень доступу, надішли:\n/level userId рівень\n\nРівні: 0→5, 1→10, 2→15, 3→20 щоденних карток.\nПриклад: /level 123456789 2"
                    );
                    return new Response("ok");
                }

                if (callback.data === "admin:testlevel") {
                    await answerCallbackQuery(env, callback.id, "Показую формат команди.");
                    await sendMessage(
                        env,
                        chatId,
                        "Щоб видати тестовий рівень 1 на 1 день, надішли:\n/testlevel userId\n\nНаприклад: /testlevel 123456789"
                    );
                    return new Response("ok");
                }

                if (callback.data === "admin:link") {
                    try {
                        const botLink = await getBotLink(env);
                        await answerCallbackQuery(env, callback.id, "Показую посилання.");
                        await sendMessage(
                            env,
                            chatId,
                            `🔗 Посилання на бота:\n${botLink}`,
                            { inline_keyboard: [[{ text: "Відкрити бота", url: botLink }]] }
                        );
                    } catch (error) {
                        console.error({
                            event: "admin_bot_link_failed",
                            message: error instanceof Error ? error.message : "Unknown error",
                        });
                        await answerCallbackQuery(env, callback.id, "Не вдалося отримати посилання.");
                    }
                    return new Response("ok");
                }

                if (callback.data === "admin:help") {
                    await answerCallbackQuery(env, callback.id, "Показую команди.");
                    await sendMessage(env, chatId, adminHelpText());
                    return new Response("ok");
                }

                await answerCallbackQuery(env, callback.id, "Невідома адмінська дія.");
                return new Response("ok");
            }

            if (callback.data.startsWith("bonus:")) {
                if (!isAdmin(env, userId)) {
                    await answerCallbackQuery(env, callback.id, "Ця дія доступна лише адміну.");
                    return new Response("ok");
                }

                // Keep pending admin cards sent before the level update actionable.
                const match = callback.data.match(/^bonus:(?:level:([1-3])|(15|25|40|30|50|100)|(reject)):(\d+)$/);

                if (!match) {
                    await answerCallbackQuery(env, callback.id, "Невірна заявка.");
                    return new Response("ok");
                }

                const accessLevel = match[1]
                    ? Number(match[1])
                    : ({ 15: 1, 25: 2, 40: 3, 30: 1, 50: 2, 100: 3 }[match[2]] ?? null);
                const requestId = Number(match[4]);

                if (!Number.isInteger(requestId) || requestId <= 0) {
                    await answerCallbackQuery(env, callback.id, "Невірна заявка.");
                    return new Response("ok");
                }

                try {
                    if (match[3] === "reject") {
                        const rejected = await rejectDonationBonusRequest(env, requestId);

                        if (!rejected) {
                            await answerCallbackQuery(env, callback.id, "Заявку вже оброблено.");
                            return new Response("ok");
                        }

                        await answerCallbackQuery(env, callback.id, "Заявку відхилено.");
                        await editMessage(
                            env,
                            chatId,
                            messageId,
                            `❌ Заявку #${requestId} відхилено.`,
                            { inline_keyboard: [] }
                        );
                        return new Response("ok");
                    }

                    const granted = await grantDonationBonusRequest(env, requestId, accessLevel, grantTemporaryAccessLevel);

                    if (!granted) {
                        await answerCallbackQuery(env, callback.id, "Заявку вже оброблено.");
                        return new Response("ok");
                    }

                    await answerCallbackQuery(env, callback.id, "Бонус надано.");
                    await editMessage(
                        env,
                        chatId,
                        messageId,
                        `✅ Заявка #${requestId}: надано рівень ${granted.access.accessLevel} на 1 місяць; щоденні картки: ${dailyWordCardLimitForLevel(granted.access.accessLevel)} на день.`,
                        { inline_keyboard: [] }
                    );
                } catch (error) {
                    console.error({
                        event: "donation_bonus_action_failed",
                        message: error instanceof Error ? error.message : "Unknown error",
                    });
                    await answerCallbackQuery(env, callback.id, "Не вдалося обробити заявку.");
                }

                return new Response("ok");
            }

            if (callback.data.startsWith("examples:")) {
                const wordId = Number(callback.data.replace("examples:", ""));

                if (!Number.isInteger(wordId) || wordId <= 0) {
                    await answerCallbackQuery(env, callback.id, "Невірний вибір.");
                    return new Response("ok");
                }

                let sent;

                try {
                    sent = await sendWordExamples(env, chatId, userId, wordId);
                } catch (error) {
                    console.error({
                        event: "show_examples_failed",
                        message:
                            error instanceof Error
                                ? error.message
                                : "Unknown error",
                    });
                    await answerCallbackQuery(
                        env,
                        callback.id,
                        "Не вдалося показати приклади."
                    );
                    return new Response("ok");
                }

                await answerCallbackQuery(
                    env,
                    callback.id,
                    sent
                        ? "Показую приклади."
                        : "Це слово вже недоступне."
                );
                return new Response("ok");
            }

            if (callback.data === "dailysettings:time") {
                await answerCallbackQuery(env, callback.id, "Обери час.");
                await editMessage(
                    env,
                    chatId,
                    messageId,
                    "🕒 Обери час щоденного слова:",
                    dailyTimeKeyboard()
                );
                return new Response("ok");
            }

            if (callback.data === "dailysettings:level") {
                await answerCallbackQuery(env, callback.id, "Обери рівень.");
                await editMessage(
                    env,
                    chatId,
                    messageId,
                    "🎚 Обери рівень нових слів:",
                    dailyLevelKeyboard()
                );
                return new Response("ok");
            }

            if (callback.data === "daily:off") {
                await env.DB
                    .prepare("UPDATE users SET daily_enabled = CASE WHEN daily_enabled = 1 THEN 0 ELSE 1 END WHERE telegram_user_id = ?")
                    .bind(userId)
                    .run();
                await answerCallbackQuery(env, callback.id, "Налаштування оновлено.");
                await refreshDailySettings(env, chatId, messageId, userId);
                return new Response("ok");
            }

            if (callback.data.startsWith("dailylevel:")) {
                const level = callback.data.replace("dailylevel:", "");

                if (!DAILY_LEVEL_OPTIONS.includes(level)) {
                    await answerCallbackQuery(env, callback.id, "Невірний рівень.");
                    return new Response("ok");
                }

                await env.DB
                    .prepare("UPDATE users SET daily_level = ? WHERE telegram_user_id = ?")
                    .bind(level, userId)
                    .run();
                await answerCallbackQuery(env, callback.id, "Рівень збережено.");
                await refreshDailySettings(env, chatId, messageId, userId);
                return new Response("ok");
            }

            if (await handleDailyWordCallback(env, callback, { chatId, messageId, userId }, {
                claimDailyWordAddition,
                getDailyAdditionLimit,
            })) {
                return new Response("ok");
            }

            if (callback.data.startsWith("dailytime:")) {
                const dailyTime = callback.data.replace("dailytime:", "");

                if (!DAILY_TIME_OPTIONS.includes(dailyTime)) {
                    await answerCallbackQuery(env, callback.id, "Невірний час.");
                    return new Response("ok");
                }

                await env.DB
                    .prepare(`
                      UPDATE users
                      SET daily_time = ?, daily_enabled = 1
                      WHERE telegram_user_id = ?
                    `)
                    .bind(dailyTime, userId)
                    .run();

                await answerCallbackQuery(env, callback.id, "Час збережено.");
                await refreshDailySettings(env, chatId, messageId, userId);
                return new Response("ok");
            }

            if (
                callback.data.startsWith("delete:") ||
                callback.data.startsWith("archive:")
            ) {
                // New list buttons keep their page in callback data so a user
                // stays on the same page after marking a word as learned.
                // The optional page also preserves compatibility with older
                // already-sent buttons that contain only the word ID.
                const archiveMatch = callback.data.match(/^(?:delete|archive):(\d+)(?::(\d+))?$/);
                const wordId = Number(archiveMatch?.[1]);
                const page = Number(archiveMatch?.[2] ?? 0);

                if (!Number.isInteger(wordId) || wordId <= 0 || !Number.isInteger(page) || page < 0) {
                    await answerCallbackQuery(env, callback.id, "Невірний вибір.");
                    return new Response("ok");
                }

                const archived = await env.DB
                    .prepare(`
              UPDATE words
              SET is_active = 0, learned_at = CURRENT_TIMESTAMP
              WHERE id = ? AND user_id = ? AND is_active = 1
            `)
                    .bind(wordId, userId)
                    .run();

                await answerCallbackQuery(
                    env,
                    callback.id,
                    archived.meta.changes > 0
                        ? "Слово позначено як вивчене."
                        : "Це слово вже позначене як вивчене."
                );

                await refreshListMessage(env, chatId, messageId, userId, page);
                return new Response("ok");
            }

            if (callback.data.startsWith("active-page:")) {
                const page = Number(callback.data.replace("active-page:", ""));

                if (!Number.isInteger(page) || page < 0) {
                    await answerCallbackQuery(env, callback.id, "Невірна сторінка.");
                    return new Response("ok");
                }

                await answerCallbackQuery(env, callback.id);
                await refreshListMessage(env, chatId, messageId, userId, page);
                return new Response("ok");
            }

            if (callback.data.startsWith("learned-page:")) {
                const page = Number(callback.data.replace("learned-page:", ""));

                if (!Number.isInteger(page) || page < 0) {
                    await answerCallbackQuery(env, callback.id, "Невірна сторінка.");
                    return new Response("ok");
                }

                await answerCallbackQuery(env, callback.id);
                await refreshArchivedMessage(env, chatId, messageId, userId, page);
                return new Response("ok");
            }

            if (callback.data.startsWith("restore:")) {
                const restoreMatch = callback.data.match(/^restore:(\d+)(?::(\d+))?$/);
                const wordId = Number(restoreMatch?.[1]);
                const page = Number(restoreMatch?.[2] ?? 0);

                if (!Number.isInteger(wordId) || wordId <= 0 || !Number.isInteger(page) || page < 0) {
                    await answerCallbackQuery(env, callback.id, "Невірний вибір.");
                    return new Response("ok");
                }

                const restored = await env.DB
                    .prepare(`
              UPDATE words
              SET is_active = 1, learned_at = NULL
              WHERE id = ? AND user_id = ? AND is_active = 0
            `)
                    .bind(wordId, userId)
                    .run();

                await answerCallbackQuery(
                    env,
                    callback.id,
                    restored.meta.changes > 0
                        ? "Слово повернено до навчання."
                        : "Це слово вже у списку для навчання."
                );

                await refreshArchivedMessage(env, chatId, messageId, userId, page);
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

        await env.DB
            .prepare(`
        INSERT INTO users (telegram_user_id, chat_id, daily_time, daily_level)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(telegram_user_id)
        DO UPDATE SET chat_id = excluded.chat_id, is_active = 1
      `)
            .bind(
                userId,
                chatId,
                DEFAULT_DAILY_SETTINGS.daily_time,
                DEFAULT_DAILY_SETTINGS.daily_level
            )
            .run();

        if (text !== "/start" && text !== "/menu") {
            await refreshInterfaceIfNeeded(env, chatId, userId);
        }

        // Any command or menu action abandons a feedback draft, so a later
        // vocabulary word cannot accidentally be forwarded as feedback.
        if (text !== "💬 Відгук" && (text.startsWith("/") || text.startsWith("⏰ Розклад і рівень") || [
            "➕ Додати слово", "📚 Мої слова", "🎓 Вивчені слова",
            "⚙️ Налаштувати", "⚙️ Налаштувати щоденне слово", "⏰ Нагадування", "⏰ Розклад і рівень", "⏰ Щоденне слово", "📚 Щоденне слово",
            "☕ Підтримати бот", "🎁 Отримати бонус", "📩 Зв’язатися з нами", "🛠 Адмін", "❓ Допомога",
            "➡️ Далі", "⬅️ Назад",
        ].includes(text))) {
            await clearPendingFeedback(env, userId);
        }

        if (text === "/start") {
            const settings = await getDailySettings(env, userId) ?? DEFAULT_DAILY_SETTINGS;
            await sendMessage(
                env,
                chatId,
                messages.welcome(settings),
                mainKeyboard(isAdmin(env, userId), 1, settings)
            );
            await markInterfaceVersion(env, userId);
            return new Response("ok");
        }

        if (text === "/menu") {
            await sendMessage(env, chatId, "Ось меню:", await mainKeyboardForUser(env, userId));
            await markInterfaceVersion(env, userId);
            return new Response("ok");
        }

        if (text === "➕ Додати слово") {
            await sendMessage(
                env,
                chatId,
                ADD_WORD_HINT
            );
            return new Response("ok");
        }

        if (text === "➡️ Далі") {
            await sendMessage(env, chatId, "Додаткові можливості:", await mainKeyboardForUser(env, userId, 2));
            return new Response("ok");
        }

        if (text === "⬅️ Назад") {
            await sendMessage(env, chatId, "Основне меню:", await mainKeyboardForUser(env, userId));
            return new Response("ok");
        }

        if (text === "📚 Мої слова") {
            await sendActiveWordList(env, chatId, userId);
            return new Response("ok");
        }

        if (text === "🎓 Вивчені слова") {
            await sendLearnedWordList(env, chatId, userId);
            return new Response("ok");
        }

        if (
            text === "⚙️ Налаштувати" ||
            text === "⚙️ Налаштувати щоденне слово" ||
            text === "⏰ Нагадування" ||
            text.startsWith("⏰ Розклад і рівень") ||
            text === "⏰ Щоденне слово"
        ) {
            await sendDailySettings(env, chatId, userId);
            return new Response("ok");
        }

        if (text === "📚 Щоденне слово") {
            try {
                await deliverTodayDailyWord(env, chatId, userId, {
                    claimDailyWordCard,
                    access: { isAdmin, getUserAccessLevel, dailyWordCardLimitForLevel },
                    dailyWordCardLimitForLevel,
                    getUserAccessLevel,
                    generateNewDailyWord,
                    generateDailyWordCard,
                    maxAttempts: MAX_DAILY_WORD_ATTEMPTS,
                });
            } catch (error) {
                console.error({
                    event: "manual_daily_word_failed",
                    message: error instanceof Error ? error.message : "Unknown error",
                });
                await sendMessage(
                    env,
                    chatId,
                    "Не вдалося показати щоденне слово. Спробуй ще раз за хвилину."
                );
            }
            return new Response("ok");
        }

        if (text === "☕ Підтримати бот") {
            try {
                await sendDonationInstructions(env, chatId, userId);
            } catch (error) {
                console.error({
                    event: "donation_instructions_failed",
                    message: error instanceof Error ? error.message : "Unknown error",
                });
                await sendMessage(
                    env,
                    chatId,
                    "Не вдалося підготувати код для донату. Спробуй ще раз за хвилину."
                );
            }
            return new Response("ok");
        }

        if (text === "🎁 Отримати бонус") {
            try {
                await submitDonationBonusRequestFlow(env, chatId, userId, notifyPendingDonationRequests);
            } catch (error) {
                console.error({
                    event: "donation_bonus_request_failed",
                    message: error instanceof Error ? error.message : "Unknown error",
                });
                await sendMessage(
                    env,
                    chatId,
                    "Не вдалося надіслати заявку на бонус. Спробуй ще раз за хвилину."
                );
            }
            return new Response("ok");
        }

        if (text === "💬 Відгук") {
            await startFeedback(env, chatId, userId);
            return new Response("ok");
        }

        if (text === "📩 Зв’язатися з нами") {
            await startFeedback(
                env,
                chatId,
                userId,
                "📩 Є ідея, запитання чи хочеш створити власного бота? Надішли повідомлення, і ми все обговоримо."
            );
            return new Response("ok");
        }

        if (text === "🛠 Адмін") {
            if (!isAdmin(env, userId)) {
                await sendMessage(env, chatId, "Ця дія доступна лише адміну.");
                return new Response("ok");
            }

            await sendMessage(env, chatId, adminHelpText(), adminKeyboard());
            return new Response("ok");
        }

        if (text === "❓ Допомога") {
            await sendHelp(env, chatId, userId);
            return new Response("ok");
        }

        if (text === "/help") {
            await sendHelp(env, chatId, userId);
            return new Response("ok");
        }

        if (text === "/privacy") {
            await sendMessage(
                env,
                chatId,
                `🔒 Політика конфіденційності: ${PRIVACY_POLICY_URL}`,
                await mainKeyboardForUser(env, userId)
            );
            return new Response("ok");
        }

        const grantMatch = text.match(/^\/grant(?:\s+(.+))?$/i);

        if (grantMatch) {
            if (!isAdmin(env, userId)) {
                await sendMessage(env, chatId, "Ця команда доступна лише адміну.");
                return new Response("ok");
            }

            const parts = grantMatch[1]?.trim().split(/\s+/) ?? [];

            if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) {
                await sendMessage(
                    env,
                    chatId,
                    "Використай: /grant userId ліміт\nНаприклад: /grant 123456789 45"
                );
                return new Response("ok");
            }

            const targetUserId = Number(parts[0]);
            const dailyLimit = Number(parts[1]);

            if (
                !Number.isSafeInteger(targetUserId) ||
                !Number.isSafeInteger(dailyLimit) ||
                targetUserId <= 0 ||
                dailyLimit <= 0
            ) {
                await sendMessage(
                    env,
                    chatId,
                    "userId і ліміт мають бути додатними цілими числами."
                );
                return new Response("ok");
            }

            try {
                const granted = await grantManualDailyLimit(
                    env,
                    targetUserId,
                    dailyLimit
                );

                await sendMessage(
                    env,
                    chatId,
                    granted
                        ? `✅ Видано ${dailyLimit} ${wordCountLabel(dailyLimit)} на день користувачу ${targetUserId} на 1 місяць.`
                        : "Користувача не знайдено. Він має спершу написати боту /start."
                );
            } catch (error) {
                console.error({
                    event: "manual_grant_failed",
                    message: error instanceof Error ? error.message : "Unknown error",
                });
                await sendMessage(
                    env,
                    chatId,
                    "Не вдалося видати ліміт. Спробуй ще раз за хвилину."
                );
            }

            return new Response("ok");
        }

        const levelMatch = text.match(/^\/level(?:\s+(.+))?$/i);

        if (levelMatch) {
            if (!isAdmin(env, userId)) {
                await sendMessage(env, chatId, "Ця команда доступна лише адміну.");
                return new Response("ok");
            }

            const parts = levelMatch[1]?.trim().split(/\s+/) ?? [];

            if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || !/^[0-3]$/.test(parts[1])) {
                await sendMessage(
                    env,
                    chatId,
                    "Використай: /level userId рівень\nРівні: 0→5, 1→10, 2→15, 3→20 щоденних карток.\nНаприклад: /level 123456789 2"
                );
                return new Response("ok");
            }

            const targetUserId = Number(parts[0]);
            const accessLevel = Number(parts[1]);

            if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
                await sendMessage(env, chatId, "userId має бути додатним цілим числом.");
                return new Response("ok");
            }

            try {
                const access = await grantManualAccessLevel(env, targetUserId, accessLevel);
                await sendMessage(
                    env,
                    chatId,
                    !access
                        ? "Користувача не знайдено. Він має спершу написати боту /start."
                        : access.changed
                          ? `✅ Рівень користувача ${targetUserId} підвищено до ${access.accessLevel}. Ліміт щоденних карток: ${dailyWordCardLimitForLevel(access.accessLevel)}.`
                          : `У користувача ${targetUserId} вже рівень ${access.accessLevel} або вищий.`
                );
            } catch (error) {
                console.error({
                    event: "manual_access_level_failed",
                    message: error instanceof Error ? error.message : "Unknown error",
                });
                await sendMessage(env, chatId, "Не вдалося змінити рівень. Спробуй ще раз за хвилину.");
            }

            return new Response("ok");
        }

        const testLevelMatch = text.match(/^\/testlevel(?:\s+(.+))?$/i);

        if (testLevelMatch) {
            if (!isAdmin(env, userId)) {
                await sendMessage(env, chatId, "Ця команда доступна лише адміну.");
                return new Response("ok");
            }

            const targetUserId = Number(testLevelMatch[1]?.trim());
            if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0) {
                await sendMessage(env, chatId, "Використай: /testlevel userId\nНаприклад: /testlevel 123456789");
                return new Response("ok");
            }

            try {
                const access = await grantTestLevelOne(env, targetUserId);
                await sendMessage(
                    env,
                    chatId,
                    access
                        ? `✅ Користувачу ${targetUserId} видано тестовий рівень ${access.accessLevel} на 1 день.`
                        : "Користувача не знайдено. Він має спершу написати боту /start."
                );
            } catch (error) {
                console.error({ event: "test_level_failed", message: error instanceof Error ? error.message : "Unknown error" });
                await sendMessage(env, chatId, "Не вдалося видати тестовий рівень. Спробуй ще раз за хвилину.");
            }
            return new Response("ok");
        }

        const feedbackState = await env.DB
            .prepare("SELECT feedback_pending FROM users WHERE telegram_user_id = ?")
            .bind(userId)
            .first();

        if (feedbackState?.feedback_pending === 1 && !text.startsWith("/")) {
            try {
                await submitFeedback(env, chatId, userId, text.slice(0, 3500), getAdminChatId);
            } catch (error) {
                console.error({ event: "feedback_delivery_failed", message: error instanceof Error ? error.message : "Unknown error" });
                await sendMessage(env, chatId, "Не вдалося передати відгук. Спробуй надіслати його ще раз за хвилину.");
            }
            return new Response("ok");
        }

        if (text === "/add") {
            await sendMessage(
                env,
                chatId,
                ADD_WORD_HINT
            );
            return new Response("ok");
        }

        const addMatch = text.match(/^\/add\s+(.+)$/i);
        const addInput = addMatch
            ? addMatch[1]
            : text.startsWith("/")
              ? null
              : text;

        if (addInput) {
            const { word, explicitContext } = parseVocabularyInput(addInput);

            if (!word) {
                await sendMessage(env, chatId, "Напиши слово після /add.");
                return new Response("ok");
            }

            if (!/[A-Za-z]/.test(word)) {
                await sendMessage(
                    env,
                    chatId,
                    ADD_WORD_HINT
                );
                return new Response("ok");
            }

            if (word.length > 80 || explicitContext.length > 250) {
                await sendMessage(
                    env,
                    chatId,
                    "Слово має бути до 80 символів, а контекст — до 250."
                );
                return new Response("ok");
            }

            let canAddWord;

            try {
                canAddWord = await claimDailyWordAddition(env, userId);
            } catch (error) {
                console.error({
                    event: "daily_addition_limit_check_failed",
                    message:
                        error instanceof Error ? error.message : "Unknown error",
                });
                await sendMessage(
                    env,
                    chatId,
                    "Не вдалося перевірити денний ліміт. Спробуй ще раз за хвилину."
                );
                return new Response("ok");
            }

            if (!canAddWord) {
                const dailyLimit = await getDailyAdditionLimit(env, userId);
                await sendMessage(
                    env,
                    chatId,
                    dailyLimitReachedText(dailyLimit)
                );
                return new Response("ok");
            }

            await closePendingSelection(env, userId);

            try {
                if (explicitContext) {
                    await saveAndSendWord(env, chatId, userId, word, explicitContext);
                    return new Response("ok");
                }

                const senses = await suggestSenses(env, word);

                if (senses.length === 1) {
                    await saveAndSendWord(
                        env,
                        chatId,
                        userId,
                        word,
                        senses[0].context_en
                    );
                    return new Response("ok");
                }

                const selectionMessage = await sendMessage(
                    env,
                    chatId,
                    senseText(word, senses, 0),
                    senseKeyboard(senses, 0)
                );

                await env.DB
                    .prepare(`
            INSERT INTO pending_words (
              user_id,
              source_text,
              senses_json,
              chat_id,
              message_id
            )
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id)
            DO UPDATE SET
              source_text = excluded.source_text,
              senses_json = excluded.senses_json,
              chat_id = excluded.chat_id,
              message_id = excluded.message_id,
              created_at = CURRENT_TIMESTAMP
          `)
                    .bind(
                        userId,
                        word,
                        JSON.stringify(senses),
                        chatId,
                        selectionMessage.message_id
                    )
                    .run();
            } catch (error) {
                console.error({
                    event: "add_word_failed",
                    message:
                        error instanceof Error ? error.message : "Unknown error",
                });
                await sendMessage(
                    env,
                    chatId,
                    "Не вдалося обробити слово. Спробуй ще раз за хвилину."
                );
            }

            return new Response("ok");
        }

        const archiveMatch = text.match(/^\/(?:archive|delete)(?:\s+(.+))?$/i);

        if (archiveMatch) {
            const selection = archiveMatch[1]?.trim().toLowerCase();

            if (!selection) {
                await sendMessage(
                    env,
                    chatId,
                    "Вкажи номер або діапазон зі списку: /delete 1 чи /delete 5-10. Для всіх слів: /delete all"
                );
                return new Response("ok");
            }

            if (selection === "all") {
                const archived = await env.DB
                    .prepare(`
              UPDATE words
              SET is_active = 0, learned_at = CURRENT_TIMESTAMP
              WHERE user_id = ? AND is_active = 1
            `)
                    .bind(userId)
                    .run();

                if (archived.meta.changes === 0) {
                    await sendMessage(
                        env,
                        chatId,
                        "Немає активних слів, які можна позначити як вивчені."
                    );
                    return new Response("ok");
                }

                await sendMessage(
                    env,
                    chatId,
                    `✅ Позначено як вивчені: ${archived.meta.changes} ${wordCountLabel(
                        archived.meta.changes
                    )}.`
                );
                return new Response("ok");
            }

            const rangeMatch = selection.match(/^(\d+)(?:\s*-\s*(\d+))?$/);

            if (!rangeMatch) {
                await sendMessage(
                    env,
                    chatId,
                    "Невірний формат. Використай /delete 1, /delete 5-10 або /delete all."
                );
                return new Response("ok");
            }

            const start = Number(rangeMatch[1]);
            const end = Number(rangeMatch[2] ?? rangeMatch[1]);

            if (
                !Number.isInteger(start) ||
                !Number.isInteger(end) ||
                start < 1 ||
                end < start ||
                end > LIST_LIMIT
            ) {
                await sendMessage(
                    env,
                    chatId,
                    "Можна видалити позиції від 1 до 10 із поточного /list."
                );
                return new Response("ok");
            }

            const words = await getRecentActiveWords(env, userId);

            if (end > words.length) {
                await sendMessage(
                    env,
                    chatId,
                    `У поточному списку лише ${words.length} ${wordCountLabel(
                        words.length
                    )}. Онови його командою /list.`
                );
                return new Response("ok");
            }

            const wordIds = words
                .slice(start - 1, end)
                .map((word) => word.id);
            const placeholders = wordIds.map(() => "?").join(", ");
            const archived = await env.DB
                .prepare(`
              UPDATE words
              SET is_active = 0, learned_at = CURRENT_TIMESTAMP
              WHERE user_id = ? AND is_active = 1 AND id IN (${placeholders})
            `)
                .bind(userId, ...wordIds)
                .run();

            if (archived.meta.changes === 0) {
                await sendMessage(
                    env,
                    chatId,
                    "Не знайшов активних слів за цими позиціями. Онови список командою /list."
                );
                return new Response("ok");
            }

            await sendMessage(
                env,
                chatId,
                `✅ Позначено як вивчені: ${archived.meta.changes} ${wordCountLabel(
                    archived.meta.changes
                )}.`
            );
            return new Response("ok");
        }

        const restoreMatch = text.match(/^\/restore(?:\s+(.+))?$/i);

        if (restoreMatch) {
            const selection = restoreMatch[1]?.trim().toLowerCase();

            if (!selection) {
                await sendMessage(
                    env,
                    chatId,
                    "Вкажи номер або діапазон з /archived: /restore 1 чи /restore 5-10. Для всіх слів: /restore all"
                );
                return new Response("ok");
            }

            if (selection === "all") {
                const restored = await env.DB
                    .prepare(`
              UPDATE words
              SET is_active = 1, learned_at = NULL
              WHERE user_id = ? AND is_active = 0
            `)
                    .bind(userId)
                    .run();

                if (restored.meta.changes === 0) {
                    await sendMessage(
                        env,
                        chatId,
                        "Немає вивчених слів для повернення до навчання."
                    );
                    return new Response("ok");
                }

                await sendMessage(
                    env,
                    chatId,
                    `✅ Повернено до навчання ${restored.meta.changes} ${wordCountLabel(
                        restored.meta.changes
                    )}.`
                );
                return new Response("ok");
            }

            const rangeMatch = selection.match(/^(\d+)(?:\s*-\s*(\d+))?$/);

            if (!rangeMatch) {
                await sendMessage(
                    env,
                    chatId,
                    "Невірний формат. Використай /restore 1, /restore 5-10 або /restore all."
                );
                return new Response("ok");
            }

            const start = Number(rangeMatch[1]);
            const end = Number(rangeMatch[2] ?? rangeMatch[1]);

            if (
                !Number.isInteger(start) ||
                !Number.isInteger(end) ||
                start < 1 ||
                end < start ||
                end > LIST_LIMIT
            ) {
                await sendMessage(
                    env,
                    chatId,
                    "Можна повернути позиції від 1 до 10 із поточного /archived."
                );
                return new Response("ok");
            }

            const words = await getRecentArchivedWords(env, userId);

            if (end > words.length) {
                await sendMessage(
                    env,
                    chatId,
                    `У списку вивчених лише ${words.length} ${wordCountLabel(
                        words.length
                    )}. Онови його командою /learned.`
                );
                return new Response("ok");
            }

            const wordIds = words
                .slice(start - 1, end)
                .map((word) => word.id);
            const placeholders = wordIds.map(() => "?").join(", ");
            const restored = await env.DB
                .prepare(`
              UPDATE words
              SET is_active = 1, learned_at = NULL
              WHERE user_id = ? AND is_active = 0 AND id IN (${placeholders})
            `)
                .bind(userId, ...wordIds)
                .run();

            if (restored.meta.changes === 0) {
                await sendMessage(
                    env,
                    chatId,
                    "Не знайшов вивчених слів за цими позиціями. Онови список командою /learned."
                );
                return new Response("ok");
            }

            await sendMessage(
                env,
                chatId,
                `✅ Повернено до навчання ${restored.meta.changes} ${wordCountLabel(
                    restored.meta.changes
                )}.`
            );
            return new Response("ok");
        }

        if (text === "/list") {
            await sendActiveWordList(env, chatId, userId);

            return new Response("ok");
        }

        if (text === "/archived" || text === "/learned") {
            await sendLearnedWordList(env, chatId, userId);

            return new Response("ok");
        }

        if (text.startsWith("/")) {
            await sendHelp(env, chatId, userId);
            return new Response("ok");
        }

        return new Response("ok");
    },

    async scheduled(controller, env) {
        try {
            await ensureTelegramWebhook(env);
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
        }

        try {
            await notifyExpiredDonationAccessGrants(env);
        } catch (error) {
            console.error({
                event: "expired_donation_access_notification_failed",
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }

        try {
            await deliverDueDailyWords(env, controller.scheduledTime, {
                claimDailyWordCard,
                access: { isAdmin, getUserAccessLevel, dailyWordCardLimitForLevel },
                generateNewDailyWord,
                generateDailyWordCard,
                maxAttempts: MAX_DAILY_WORD_ATTEMPTS,
            });
        } catch (error) {
            console.error({
                event: "daily_word_schedule_failed",
                message: error instanceof Error ? error.message : "Unknown error",
            });
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
