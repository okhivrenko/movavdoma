// Vocabulary Telegram Bot — Copyright (c) 2026 Oleksii Khivrenko.
// Publicly viewable under the proprietary terms in LICENSE.

import {
    answerCallbackQuery,
    editMessage,
    getBotLink,
    sendMessage,
} from "./telegram.js";
import { openAIJson } from "./openai.js";
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
    createSupportCode,
    dailyLimitReachedText,
    formatHryvnias,
    isAdmin,
    localDateAndTime,
    wordCountLabel,
} from "./helpers.js";
import {
    dailyWordCardLimitForLevel,
    donationAccessLevel,
    normalizeAccessLevel,
} from "./policies.js";

const SENSES_PER_PAGE = 3;
const MAX_SENSES = 9;
// Default daily quota for newly saved words; individual bonuses may raise it.
const DAILY_ADD_LIMIT = 10;
// Daily-card quota is separate from the learning-list quota and depends on access.
const MONOBANK_JAR_URL = "https://send.monobank.ua/jar/8sko6A3Cma";
const MONOBANK_JAR_SEND_ID = "8sko6A3Cma";
const MONOBANK_MIN_SYNC_INTERVAL_SECONDS = 60;
const MONOBANK_STATEMENT_OVERLAP_SECONDS = 5 * 60;
const DAILY_TIME_OPTIONS = Array.from(
    { length: 24 },
    (_, hour) => `${String(hour).padStart(2, "0")}:00`
);
const DAILY_LEVEL_OPTIONS = ["A0", "A1", "A2", "B1", "B2", "C1", "C2"];
const MAX_DAILY_WORD_ATTEMPTS = 3;
const ADMIN_USER_LIST_LIMIT = 50;
const LEARNED_WORD_RETENTION_DAYS = 30;
// Increment only when the persistent reply keyboard changes for users.
const INTERFACE_VERSION = 5;
const ADD_WORD_HINT =
    "Надішли англійське слово або фразу.\n\nЯкщо важливе конкретне значення, додай контекст після |:\ncharge | payment for a service\n\nПриклад без контексту: resilient";

// Vocabulary card creation and a short-lived meaning-selection flow.
async function suggestSenses(env, word) {
    const schema = {
        type: "object",
        additionalProperties: false,
        properties: {
            senses: {
                type: "array",
                items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        label_uk: { type: "string" },
                        context_en: { type: "string" },
                    },
                    required: ["label_uk", "context_en"],
                },
            },
        },
        required: ["senses"],
    };

    const result = await openAIJson(
        env,
        "word_senses",
        schema,
        "For an English vocabulary word, return one to nine genuinely different common meanings. Return one item only when the word is unambiguous. label_uk must be a short Ukrainian label suitable for a Telegram button. context_en must be a short English explanation of the exact meaning. Prioritize everyday meanings. Do not return grammatical forms of the same sense.",
        `Word: ${word}`
    );

    return result.senses.slice(0, MAX_SENSES);
}

async function generateWordCard(env, word, context) {
    const schema = {
        type: "object",
        additionalProperties: false,
        properties: {
            translation_uk: { type: "string" },
            examples: {
                type: "array",
                items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        source: { type: "string" },
                        uk: { type: "string" },
                    },
                    required: ["source", "uk"],
                },
            },
        },
        required: ["translation_uk", "examples"],
    };

    const result = await openAIJson(
        env,
        "word_card",
        schema,
        "Create one consistent vocabulary card. Translate the word into Ukrainian strictly for the supplied meaning. Create exactly two natural English sentences, each 8–18 words, using only that same meaning. Translate each sentence fluently into Ukrainian. Never mix meanings of the word.",
        `Word: ${word}\nChosen meaning: ${context}`
    );

    if (!Array.isArray(result.examples) || result.examples.length !== 2) {
        throw new Error("Invalid examples response.");
    }

    return result;
}

async function generateDailyWordCard(env, level) {
    const schema = {
        type: "object",
        additionalProperties: false,
        properties: {
            word: { type: "string" },
            context_en: { type: "string" },
            translation_uk: { type: "string" },
            examples: {
                type: "array",
                items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        source: { type: "string" },
                        uk: { type: "string" },
                    },
                    required: ["source", "uk"],
                },
            },
        },
        required: ["word", "context_en", "translation_uk", "examples"],
    };

    const result = await openAIJson(
        env,
        "daily_word_card",
        schema,
        "Create one useful English vocabulary card for a learner at the requested CEFR level. word must be a single English word or a short common phrase, not a proper noun. context_en must precisely state its meaning. Give a short Ukrainian translation and exactly two natural English example sentences, each 8–18 words, with fluent Ukrainian translations. Both examples must use exactly the stated meaning.",
        `CEFR level: ${level}`
    );

    if (!Array.isArray(result.examples) || result.examples.length !== 2) {
        throw new Error("Invalid daily word examples response.");
    }

    return result;
}

function senseKeyboard(senses, page) {
    const totalPages = Math.ceil(senses.length / SENSES_PER_PAGE);
    const start = page * SENSES_PER_PAGE;
    const currentSenses = senses.slice(start, start + SENSES_PER_PAGE);

    const rows = currentSenses.map((sense, offset) => [
        {
            text: sense.label_uk,
            callback_data: `sense:${start + offset}`,
        },
    ]);

    const navigation = [];

    if (page > 0) {
        navigation.push({
            text: "← Назад",
            callback_data: `page:${page - 1}`,
        });
    }

    if (page < totalPages - 1) {
        navigation.push({
            text: "Ще значення →",
            callback_data: `page:${page + 1}`,
        });
    }

    if (navigation.length > 0) {
        rows.push(navigation);
    }

    return { inline_keyboard: rows };
}

function senseText(word, senses, page) {
    const totalPages = Math.ceil(senses.length / SENSES_PER_PAGE);

    return totalPages > 1
        ? `${word} має кілька значень. Обери потрібне:\nСторінка ${
            page + 1
        } з ${totalPages}`
        : `${word} має кілька значень. Обери потрібне:`;
}

async function getPendingWord(env, userId) {
    const pending = await env.DB
        .prepare(`
      SELECT source_text, senses_json
      FROM pending_words
      WHERE user_id = ?
    `)
        .bind(userId)
        .first();

    if (!pending) {
        return null;
    }

    try {
        return {
            word: pending.source_text,
            senses: JSON.parse(pending.senses_json),
        };
    } catch {
        return null;
    }
}

async function closePendingSelection(env, userId) {
    const previous = await env.DB
        .prepare(`
      SELECT chat_id, message_id
      FROM pending_words
      WHERE user_id = ?
    `)
        .bind(userId)
        .first();

    if (!previous?.chat_id || !previous?.message_id) {
        return;
    }

    try {
        await editMessage(
            env,
            previous.chat_id,
            previous.message_id,
            "Вибір скасовано: ти почав додавати інше слово.",
            { inline_keyboard: [] }
        );
    } catch {
        // Старе повідомлення могло бути видалене — це не проблема.
    }
}

async function saveAndSendWord(env, chatId, userId, word, context) {
    const card = await generateWordCard(env, word, context);

    const insertedWord = await env.DB
        .prepare(`
      INSERT INTO words (
        user_id,
        source_text,
        source_language,
        translation_uk,
        context_note
      )
      VALUES (?, ?, 'en', ?, ?)
    `)
        .bind(userId, word, card.translation_uk, context)
        .run();

    const wordId = insertedWord.meta.last_row_id;

    for (let index = 0; index < card.examples.length; index += 1) {
        const example = card.examples[index];

        await env.DB
            .prepare(`
        INSERT INTO examples (
          word_id,
          sentence_source,
          sentence_uk,
          position
        )
        VALUES (?, ?, ?, ?)
      `)
            .bind(wordId, example.source, example.uk, index + 1)
            .run();
    }

    await sendMessage(
        env,
        chatId,
        `✅ ${word} — ${card.translation_uk}\n\n1. ${card.examples[0].source}\n${card.examples[0].uk}\n\n2. ${card.examples[1].source}\n${card.examples[1].uk}`
    );
}

// User-facing reply/inline keyboards and the admin-only user directory.
// Authorization itself stays in helpers.js so every entry path compares IDs consistently.
function mainKeyboard(showAdmin = false, page = 1) {
    const firstPage = [
        [{ text: "➕ Додати слово" }, { text: "📚 Мої слова" }],
        [{ text: "📚 Щоденне слово" }, { text: "⏰ Нагадування" }],
        [{ text: "🎓 Вивчені слова" }],
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
        mainKeyboard(isAdmin(env, userId))
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

// Daily-word settings are split into two consecutive choices: time and level.
// The UI only changes user preferences; scheduled delivery consumes them later.
function dailySettingsMenuKeyboard(user) {
    return {
        inline_keyboard: [
            [{ text: `🕒 Час: ${user.daily_time}`, callback_data: "dailysettings:time" }],
            [{ text: `🎚 Рівень: ${user.daily_level}`, callback_data: "dailysettings:level" }],
            [{
                text: user.daily_enabled ? "🔕 Вимкнути нагадування" : "🔔 Увімкнути нагадування",
                callback_data: "daily:off",
            }],
        ],
    };
}

function dailyTimeKeyboard() {
    const rows = [];

    for (let index = 0; index < DAILY_TIME_OPTIONS.length; index += 4) {
        rows.push(
            DAILY_TIME_OPTIONS.slice(index, index + 4).map((dailyTime) => ({
                text: dailyTime,
                callback_data: `dailytime:${dailyTime}`,
            }))
        );
    }

    return { inline_keyboard: rows };
}

function dailyLevelKeyboard() {
    return {
        inline_keyboard: [
            DAILY_LEVEL_OPTIONS.slice(0, 4).map((level) => ({
                text: level,
                callback_data: `dailylevel:${level}`,
            })),
            DAILY_LEVEL_OPTIONS.slice(4).map((level) => ({
                text: level,
                callback_data: `dailylevel:${level}`,
            })),
        ],
    };
}

async function getDailySettings(env, userId) {
    return env.DB
        .prepare("SELECT daily_time, daily_enabled, daily_level FROM users WHERE telegram_user_id = ?")
        .bind(userId)
        .first();
}

function dailySettingsText(user) {
    const status = user?.daily_enabled
        ? `увімкнене о ${user.daily_time}`
        : "вимкнене";

    return `Щоденне слово зараз ${status}. Рівень: ${user?.daily_level ?? "B1"}.\n\nОбери, що налаштувати:`;
}

async function sendDailySettings(env, chatId, userId) {
    const user = await getDailySettings(env, userId);

    await sendMessage(
        env,
        chatId,
        dailySettingsText(user),
        dailySettingsMenuKeyboard(user ?? { daily_time: "09:00", daily_enabled: 1, daily_level: "B1" })
    );
}

async function refreshDailySettings(env, chatId, messageId, userId) {
    const user = await getDailySettings(env, userId);
    const settings = user ?? { daily_time: "09:00", daily_enabled: 1, daily_level: "B1" };

    await editMessage(
        env,
        chatId,
        messageId,
        dailySettingsText(settings),
        dailySettingsMenuKeyboard(settings)
    );
}

// Donation requests are reviewed by the admin before any personal limit changes.
// The unique support code links a payment comment to a single user request.
async function getOrCreateDonationRequest(env, userId) {
    const existing = await getOpenDonationRequest(env, userId);

    if (existing) {
        return existing;
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const supportCode = createSupportCode();
        const inserted = await env.DB
            .prepare(`
              INSERT OR IGNORE INTO donation_requests (user_id, support_code)
              VALUES (?, ?)
            `)
            .bind(userId, supportCode)
            .run();

        if (inserted.meta.changes > 0) {
            return { id: inserted.meta.last_row_id, support_code: supportCode, status: "awaiting_payment" };
        }
    }

    throw new Error("Unable to generate a unique donation code.");
}

async function getOpenDonationRequest(env, userId) {
    return env.DB
        .prepare(`
          SELECT id, support_code, status
          FROM donation_requests
          WHERE user_id = ? AND status IN ('awaiting_payment', 'awaiting_review')
          ORDER BY id DESC
          LIMIT 1
        `)
        .bind(userId)
        .first();
}

function supportKeyboard() {
    return {
        inline_keyboard: [
            [{ text: "☕ Відкрити банку", url: MONOBANK_JAR_URL }],
        ],
    };
}

async function sendDonationInstructions(env, chatId, userId) {
    const request = await getOrCreateDonationRequest(env, userId);

    await sendMessage(
        env,
        chatId,
        `Дякую за підтримку! Відкрий банку й, будь ласка, додай цей код у коментар до платежу:\n\n${request.support_code}\n\nПісля переказу натисни «🎁 Отримати бонус». Код допоможе мені точно знайти твій донат.`,
        supportKeyboard()
    );
}

async function getAdminChatId(env) {
    if (!env.ADMIN_TELEGRAM_USER_ID) {
        return null;
    }

    const admin = await env.DB
        .prepare("SELECT chat_id FROM users WHERE telegram_user_id = ?")
        .bind(env.ADMIN_TELEGRAM_USER_ID)
        .first();

    return admin?.chat_id ?? null;
}

async function getUserAccessLevel(env, userId) {
    if (isAdmin(env, userId)) return 3;

    const [permanent, temporary] = await Promise.all([
        env.DB
            .prepare("SELECT access_level FROM user_access_levels WHERE user_id = ?")
            .bind(userId)
            .first(),
        env.DB
            .prepare("SELECT MAX(access_level) AS access_level FROM user_temporary_access_grants WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP")
            .bind(userId)
            .first(),
    ]);

    return Math.max(
        normalizeAccessLevel(permanent?.access_level),
        normalizeAccessLevel(temporary?.access_level)
    );
}

async function grantAccessLevel(env, userId, accessLevel, source, donationRequestId = null) {
    const level = normalizeAccessLevel(accessLevel);
    const previousLevel = await getUserAccessLevel(env, userId);

    if (level <= previousLevel && !isAdmin(env, userId)) {
        return { changed: false, accessLevel: previousLevel };
    }

    await env.DB
        .prepare(`
          INSERT INTO user_access_levels (user_id, access_level, donation_request_id, source)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            access_level = MAX(user_access_levels.access_level, excluded.access_level),
            donation_request_id = excluded.donation_request_id,
            source = excluded.source,
            updated_at = CURRENT_TIMESTAMP
        `)
        .bind(userId, level, donationRequestId, source)
        .run();

    return { changed: level > previousLevel, accessLevel: Math.max(level, previousLevel) };
}

/** Temporary access never changes a user's permanent base level. */
async function grantTemporaryAccessLevel(env, userId, accessLevel, source, duration, donationRequestId = null) {
    const previousLevel = await getUserAccessLevel(env, userId);

    await env.DB
        .prepare(`
          INSERT INTO user_temporary_access_grants (
            user_id, access_level, donation_request_id, source, expires_at
          )
          VALUES (?, ?, ?, ?, datetime('now', ?))
        `)
        .bind(userId, normalizeAccessLevel(accessLevel), donationRequestId, source, duration)
        .run();

    const currentLevel = await getUserAccessLevel(env, userId);
    return { changed: currentLevel > previousLevel, accessLevel: currentLevel };
}

async function grantTestLevelOne(env, userId) {
    const user = await env.DB
        .prepare("SELECT chat_id FROM users WHERE telegram_user_id = ?")
        .bind(userId)
        .first();

    if (!user?.chat_id) return null;

    const access = await grantTemporaryAccessLevel(env, userId, 1, "admin_test", "+1 day");
    await sendMessage(
        env,
        user.chat_id,
        `🧪 Для тесту тобі увімкнено рівень ${access.accessLevel} на 1 день. Ліміт нових щоденних карток: ${dailyWordCardLimitForLevel(access.accessLevel)}.`
    );
    return access;
}

function adminDonationKeyboard(requestId, suggestedAccessLevel) {
    const suggestedButton = suggestedAccessLevel
        ? [{ text: `Рекомендований рівень ${suggestedAccessLevel}`, callback_data: `bonus:level:${suggestedAccessLevel}:${requestId}` }]
        : [];

    return {
        inline_keyboard: [
            suggestedButton,
            [
                { text: "Рівень 1", callback_data: `bonus:level:1:${requestId}` },
                { text: "Рівень 2", callback_data: `bonus:level:2:${requestId}` },
                { text: "Рівень 3", callback_data: `bonus:level:3:${requestId}` },
            ],
            [
                { text: "Відхилити", callback_data: `bonus:reject:${requestId}` },
            ],
        ].filter((row) => row.length > 0),
    };
}

async function notifyPendingDonationRequests(env) {
    const adminChatId = await getAdminChatId(env);

    if (!adminChatId) {
        console.warn({ event: "donation_admin_chat_not_found" });
        return;
    }

    const pending = await env.DB
        .prepare(`
          SELECT id, user_id, support_code, matched_transaction_id
          FROM donation_requests
          WHERE status = 'awaiting_review' AND admin_notified_at IS NULL
          ORDER BY id ASC
        `)
        .all();

    for (const request of pending.results) {
        const transaction = request.matched_transaction_id
            ? await env.DB
                  .prepare("SELECT amount_kopiykas FROM bank_transactions WHERE transaction_id = ?")
                  .bind(request.matched_transaction_id)
                  .first()
            : null;
        const amount = transaction
            ? `\nДонат знайдено: ${formatHryvnias(transaction.amount_kopiykas)}.`
            : "\nПлатіж ще не знайдено автоматично — звір його у банці.";
        const suggestedAccessLevel = transaction
            ? donationAccessLevel(transaction.amount_kopiykas)
            : null;

        await sendMessage(
            env,
            adminChatId,
            `🎁 Заявка на бонус\nКористувач: ${request.user_id}\nКод: ${request.support_code}${amount}${suggestedAccessLevel ? `\nРекомендований рівень: ${suggestedAccessLevel} (${dailyWordCardLimitForLevel(suggestedAccessLevel)} щоденних карток).` : ""}`,
            adminDonationKeyboard(request.id, suggestedAccessLevel)
        );

        await env.DB
            .prepare("UPDATE donation_requests SET admin_notified_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(request.id)
            .run();
    }
}

async function notifyUnmatchedDonations(env) {
    const adminChatId = await getAdminChatId(env);

    if (!adminChatId) {
        return;
    }

    const unmatched = await env.DB
        .prepare(`
          SELECT transaction_id, amount_kopiykas, comment
          FROM bank_transactions
          WHERE matched_request_id IS NULL AND admin_notified_at IS NULL
          ORDER BY transaction_time ASC
        `)
        .all();

    for (const transaction of unmatched.results) {
        const comment = transaction.comment ? `\nКоментар: ${transaction.comment}` : "\nБез коментаря.";

        await sendMessage(
            env,
            adminChatId,
            `☕ Новий донат без збігу із заявкою: ${formatHryvnias(transaction.amount_kopiykas)}.${comment}\n\nЯкщо людина напише тобі, звір платіж і видай бонус через її заявку.`
        );

        await env.DB
            .prepare("UPDATE bank_transactions SET admin_notified_at = CURRENT_TIMESTAMP WHERE transaction_id = ?")
            .bind(transaction.transaction_id)
            .run();
    }
}

async function submitDonationBonusRequest(env, chatId, userId) {
    const request = await getOpenDonationRequest(env, userId);

    if (!request) {
        await sendMessage(
            env,
            chatId,
            "Спершу натисни «☕ Підтримати бот»: я дам код, який треба додати в коментар до платежу."
        );
        return;
    }

    if (request.status === "awaiting_payment") {
        await env.DB
            .prepare(`
              UPDATE donation_requests
              SET status = 'awaiting_review', requested_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `)
            .bind(request.id)
            .run();
    }

    await sendMessage(
        env,
        chatId,
        "🎁 Заявку на бонус прийнято! Ми постараємося підготувати для тебе щось цікаве найближчим часом."
    );

    await notifyPendingDonationRequests(env);
}

async function grantDonationBonus(env, requestId, accessLevel) {
    const request = await env.DB
        .prepare(`
          SELECT id, user_id, status, matched_transaction_id
          FROM donation_requests
          WHERE id = ?
        `)
        .bind(requestId)
        .first();

    if (!request || request.status !== "awaiting_review") {
        return null;
    }

    const granted = await env.DB
        .prepare(`
          UPDATE donation_requests
          SET status = 'granted', granted_daily_limit = NULL, granted_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'awaiting_review'
        `)
        .bind(request.id)
        .run();

    if (granted.meta.changes === 0) {
        return null;
    }

    const access = await grantTemporaryAccessLevel(
        env,
        request.user_id,
        accessLevel,
        "donation",
        "+1 month",
        request.id
    );

    const user = await env.DB
        .prepare("SELECT chat_id FROM users WHERE telegram_user_id = ?")
        .bind(request.user_id)
        .first();

    if (user?.chat_id) {
        await sendMessage(
            env,
            user.chat_id,
            `🎁 Дякуємо за підтримку! Твій рівень доступу: ${access.accessLevel}. Наступний місяць можна відкривати до ${dailyWordCardLimitForLevel(access.accessLevel)} нових щоденних карток на день.`
        );
    }

    return { request, access };
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
                mainKeyboard(isAdmin(env, grant.user_id))
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
async function removeExpiredLearnedWords(env) {
    const cutoff = `-${LEARNED_WORD_RETENTION_DAYS} days`;
    const expiredWordIds = `
      SELECT id FROM words
      WHERE is_active = 0 AND learned_at IS NOT NULL
        AND learned_at < datetime('now', ?)
    `;
    const results = await env.DB.batch([
        env.DB.prepare(`DELETE FROM examples WHERE word_id IN (${expiredWordIds})`).bind(cutoff),
        env.DB.prepare(`DELETE FROM reviews WHERE word_id IN (${expiredWordIds})`).bind(cutoff),
        env.DB.prepare(`DELETE FROM words WHERE id IN (${expiredWordIds})`).bind(cutoff),
    ]);

    const deleted = results[2]?.meta?.changes ?? 0;
    if (deleted > 0) {
        console.log({ event: "expired_learned_words_removed", deleted });
    }
}

async function startFeedback(env, chatId, userId, prompt = "💬 Напиши одним повідомленням свій відгук, ідею або зауваження. Я передам його команді.") {
    await env.DB
        .prepare("UPDATE users SET feedback_pending = 1 WHERE telegram_user_id = ?")
        .bind(userId)
        .run();
    await sendMessage(env, chatId, prompt);
}

async function clearPendingFeedback(env, userId) {
    await env.DB
        .prepare("UPDATE users SET feedback_pending = 0 WHERE telegram_user_id = ? AND feedback_pending = 1")
        .bind(userId)
        .run();
}

async function submitFeedback(env, chatId, userId, feedback) {
    const adminChatId = await getAdminChatId(env);
    if (!adminChatId) {
        throw new Error("Feedback admin chat is unavailable.");
    }

    await sendMessage(env, adminChatId, `💬 Новий відгук\nКористувач: ${userId}\n\n${feedback}`);
    await clearPendingFeedback(env, userId);
    await sendMessage(env, chatId, "Дякуємо за відгук! Завдяки таким повідомленням ми стаємо кращими.");
}

/** Admin-only upgrade. Levels are intentionally monotonic: support is never lost. */
async function grantManualAccessLevel(env, userId, accessLevel) {
    const user = await env.DB
        .prepare("SELECT chat_id FROM users WHERE telegram_user_id = ?")
        .bind(userId)
        .first();

    if (!user?.chat_id) return null;

    const access = await grantAccessLevel(env, userId, accessLevel, "manual");

    if (access.changed) {
        await sendMessage(
            env,
            user.chat_id,
            `🎁 Привіт! Твій рівень доступу підвищено до ${access.accessLevel}. Тепер можна відкривати ${dailyWordCardLimitForLevel(access.accessLevel)} нових щоденних карток на день.`
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

    await sendMessage(
        env,
        user.chat_id,
        `🎁 Привіт! Для тебе надійшов бонус. Твій ліміт слів на день збільшено до ${dailyLimit} ${wordCountLabel(dailyLimit)} на наступний місяць.`
    );

    return true;
}

async function rejectDonationBonus(env, requestId) {
    const request = await env.DB
        .prepare(`
          SELECT id, user_id, status
          FROM donation_requests
          WHERE id = ?
        `)
        .bind(requestId)
        .first();

    if (!request || request.status !== "awaiting_review") {
        return null;
    }

    const rejected = await env.DB
        .prepare("UPDATE donation_requests SET status = 'rejected' WHERE id = ? AND status = 'awaiting_review'")
        .bind(request.id)
        .run();

    if (rejected.meta.changes === 0) {
        return null;
    }

    const user = await env.DB
        .prepare("SELECT chat_id FROM users WHERE telegram_user_id = ?")
        .bind(request.user_id)
        .first();

    if (user?.chat_id) {
        await sendMessage(
            env,
            user.chat_id,
            "Не вдалося підтвердити донат для бонусу. Натисни «☕ Підтримати бот», отримай новий код і додай його в коментар платежу."
        );
    }

    return request;
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

async function claimDailyWordCard(env, userId, localDate) {
    if (isAdmin(env, userId)) {
        return true;
    }

    const limit = dailyWordCardLimitForLevel(await getUserAccessLevel(env, userId));

    const claimed = await env.DB
        .prepare(`
          INSERT INTO daily_word_card_views (user_id, local_date, views)
          VALUES (?, ?, 1)
          ON CONFLICT(user_id, local_date) DO UPDATE
          SET views = views + 1
          WHERE views < ?
        `)
        .bind(userId, localDate, limit)
        .run();

    return claimed.meta.changes > 0;
}

async function claimMonobankSync(env, nowSeconds) {
    const claimed = await env.DB
        .prepare(`
          UPDATE monobank_sync_state
          SET last_attempt_at = ?
          WHERE id = 1 AND last_attempt_at <= ?
        `)
        .bind(nowSeconds, nowSeconds - MONOBANK_MIN_SYNC_INTERVAL_SECONDS)
        .run();

    return claimed.meta.changes > 0;
}

async function getMonobankJarId(env) {
    const state = await env.DB
        .prepare("SELECT jar_id FROM monobank_sync_state WHERE id = 1")
        .first();

    if (state?.jar_id) {
        return state.jar_id;
    }

    const response = await fetch("https://api.monobank.ua/personal/client-info", {
        headers: { "X-Token": env.MONOBANK_API_TOKEN },
    });

    if (!response.ok) {
        throw new Error(`Monobank client info ${response.status}`);
    }

    const clientInfo = await response.json();
    const jar = clientInfo.jars?.find(
        (candidate) => candidate.sendId === MONOBANK_JAR_SEND_ID
    );

    if (!jar?.id) {
        throw new Error("Monobank jar was not found for configured public link.");
    }

    await env.DB
        .prepare("UPDATE monobank_sync_state SET jar_id = ? WHERE id = 1")
        .bind(jar.id)
        .run();

    return jar.id;
}

async function findDonationRequestByComment(env, comment) {
    if (!comment) {
        return null;
    }

    return env.DB
        .prepare(`
          SELECT id
          FROM donation_requests
          WHERE status IN ('awaiting_payment', 'awaiting_review')
            AND instr(upper(?), support_code) > 0
          ORDER BY id DESC
          LIMIT 1
        `)
        .bind(comment)
        .first();
}

async function saveMonobankTransactions(env, transactions) {
    for (const transaction of transactions) {
        if (
            !transaction?.id ||
            !Number.isInteger(transaction.amount) ||
            transaction.amount <= 0 ||
            transaction.currencyCode !== 980
        ) {
            continue;
        }

        const request = await findDonationRequestByComment(
            env,
            transaction.comment ?? ""
        );
        const inserted = await env.DB
            .prepare(`
              INSERT OR IGNORE INTO bank_transactions (
                transaction_id,
                amount_kopiykas,
                transaction_time,
                comment,
                matched_request_id
              )
              VALUES (?, ?, ?, ?, ?)
            `)
            .bind(
                transaction.id,
                transaction.amount,
                transaction.time ?? 0,
                transaction.comment ?? "",
                request?.id ?? null
            )
            .run();

        if (inserted.meta.changes > 0 && request) {
            await env.DB
                .prepare(`
                  UPDATE donation_requests
                  SET status = 'awaiting_review',
                      matched_transaction_id = ?
                  WHERE id = ? AND status IN ('awaiting_payment', 'awaiting_review')
                `)
                .bind(transaction.id, request.id)
                .run();
        }
    }
}

async function syncMonobankDonations(env, scheduledTime) {
    if (!env.MONOBANK_API_TOKEN) {
        return;
    }

    const nowSeconds = Math.floor(scheduledTime / 1000);

    if (!(await claimMonobankSync(env, nowSeconds))) {
        return;
    }

    const jarId = await getMonobankJarId(env);
    const state = await env.DB
        .prepare("SELECT last_successful_sync_at FROM monobank_sync_state WHERE id = 1")
        .first();
    const from = Math.max(
        state?.last_successful_sync_at
            ? state.last_successful_sync_at - MONOBANK_STATEMENT_OVERLAP_SECONDS
            : nowSeconds - MONOBANK_STATEMENT_OVERLAP_SECONDS,
        nowSeconds - 2_682_000
    );
    const response = await fetch(
        `https://api.monobank.ua/personal/statement/${encodeURIComponent(jarId)}/${from}/${nowSeconds}`,
        { headers: { "X-Token": env.MONOBANK_API_TOKEN } }
    );

    if (!response.ok) {
        throw new Error(`Monobank statement ${response.status}`);
    }

    const transactions = await response.json();

    if (!Array.isArray(transactions)) {
        throw new Error("Monobank statement response is invalid.");
    }

    await saveMonobankTransactions(env, transactions);
    await env.DB
        .prepare("UPDATE monobank_sync_state SET last_successful_sync_at = ? WHERE id = 1")
        .bind(nowSeconds)
        .run();
    await notifyPendingDonationRequests(env);
    await notifyUnmatchedDonations(env);
}

// Daily cards remain pending until the user explicitly knows or saves the word.
// After either choice, the button can generate another card while quota remains.
function dailyWordKeyboard(pendingId) {
    return {
        inline_keyboard: [[
            { text: "✅ Знаю", callback_data: `daily:know:${pendingId}` },
            { text: "📖 Вчити", callback_data: `daily:learn:${pendingId}` },
        ]],
    };
}

function dailyWordText(card, level) {
    return `📚 Нове слово · ${level}\n\n${card.word} — ${card.translation_uk}\n\n1. ${card.examples[0].source}\n${card.examples[0].uk}\n\n2. ${card.examples[1].source}\n${card.examples[1].uk}\n\nЯкщо хочеш додати його до свого списку, натисни «Вчити».`;
}

async function generateNewDailyWord(env, userId, level) {
    for (let attempt = 0; attempt < MAX_DAILY_WORD_ATTEMPTS; attempt += 1) {
        const card = await generateDailyWordCard(env, level);
        const existing = await env.DB
            .prepare(`
              SELECT 1 FROM words WHERE user_id = ? AND lower(source_text) = lower(?)
              UNION ALL
              SELECT 1 FROM pending_daily_words WHERE user_id = ? AND lower(source_text) = lower(?)
              LIMIT 1
            `)
            .bind(userId, card.word.trim(), userId, card.word.trim())
            .first();

        if (!existing) {
            return card;
        }
    }

    throw new Error("Could not generate a new daily word.");
}

async function savePendingDailyWord(env, userId, card, localDate) {
    await env.DB
        .prepare("DELETE FROM pending_daily_words WHERE user_id = ? AND local_date <> ?")
        .bind(userId, localDate)
        .run();

    const inserted = await env.DB
        .prepare(`
          INSERT INTO pending_daily_words (
            user_id, source_text, translation_uk, context_note, examples_json, local_date
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .bind(
            userId,
            card.word.trim(),
            card.translation_uk,
            card.context_en,
            JSON.stringify(card.examples),
            localDate
        )
        .run();

    return inserted.meta.last_row_id;
}

async function getPendingDailyWord(env, userId, localDate) {
    const pending = await env.DB
        .prepare(`
          SELECT id, source_text, translation_uk, context_note, examples_json
          FROM pending_daily_words
          WHERE user_id = ? AND local_date = ?
          LIMIT 1
        `)
        .bind(userId, localDate)
        .first();

    if (!pending) {
        return null;
    }

    try {
        const examples = JSON.parse(pending.examples_json);

        if (!Array.isArray(examples) || examples.length !== 2) {
            return null;
        }

        return {
            id: pending.id,
            card: {
                word: pending.source_text,
                translation_uk: pending.translation_uk,
                context_en: pending.context_note,
                examples,
            },
        };
    } catch {
        return null;
    }
}

async function hasPendingDailyWord(env, userId, pendingId) {
    return Boolean(await env.DB
        .prepare("SELECT 1 FROM pending_daily_words WHERE id = ? AND user_id = ?")
        .bind(pendingId, userId)
        .first());
}

async function sendTodayDailyWord(env, chatId, userId) {
    const user = await env.DB
        .prepare(`
          SELECT timezone, daily_level
          FROM users
          WHERE telegram_user_id = ?
        `)
        .bind(userId)
        .first();
    const localTime = localDateAndTime(user?.timezone ?? "Europe/Warsaw", Date.now());

    if (!localTime) {
        throw new Error("Unable to calculate local date for daily word.");
    }

    const pending = await getPendingDailyWord(env, userId, localTime.date);

    if (pending) {
        await sendMessage(
            env,
            chatId,
            dailyWordText(pending.card, user?.daily_level ?? "B1"),
            dailyWordKeyboard(pending.id)
        );
        return;
    }

    if (!(await claimDailyWordCard(env, userId, localTime.date))) {
        const limit = dailyWordCardLimitForLevel(await getUserAccessLevel(env, userId));
        await sendMessage(
            env,
            chatId,
            `На сьогодні вже показано ${limit} нових карток. Завтра можна буде відкрити ще.`
        );
        return;
    }

    let pendingId = null;

    try {
        const level = user?.daily_level ?? "B1";
        const card = await generateNewDailyWord(env, userId, level);
        pendingId = await savePendingDailyWord(env, userId, card, localTime.date);
        await sendMessage(env, chatId, dailyWordText(card, level), dailyWordKeyboard(pendingId));
    } catch (error) {
        if (pendingId) {
            await env.DB
                .prepare("DELETE FROM pending_daily_words WHERE id = ? AND user_id = ?")
                .bind(pendingId, userId)
                .run();
        }

        throw error;
    }
}

async function savePendingDailyWordToLearning(env, userId, pendingId) {
    const pending = await env.DB
        .prepare(`
          SELECT source_text, translation_uk, context_note, examples_json
          FROM pending_daily_words
          WHERE id = ? AND user_id = ?
        `)
        .bind(pendingId, userId)
        .first();

    if (!pending) {
        return false;
    }

    const examples = JSON.parse(pending.examples_json);
    if (!Array.isArray(examples) || examples.length !== 2) {
        throw new Error("Invalid pending daily word.");
    }

    const insertedWord = await env.DB
        .prepare(`
          INSERT INTO words (user_id, source_text, source_language, translation_uk, context_note)
          VALUES (?, ?, 'en', ?, ?)
        `)
        .bind(userId, pending.source_text, pending.translation_uk, pending.context_note)
        .run();

    for (let index = 0; index < examples.length; index += 1) {
        await env.DB
            .prepare(`
              INSERT INTO examples (word_id, sentence_source, sentence_uk, position)
              VALUES (?, ?, ?, ?)
            `)
            .bind(insertedWord.meta.last_row_id, examples[index].source, examples[index].uk, index + 1)
            .run();
    }

    await env.DB
        .prepare("DELETE FROM pending_daily_words WHERE id = ? AND user_id = ?")
        .bind(pendingId, userId)
        .run();

    return true;
}

async function sendDueDailyWords(env, scheduledTime) {
    const users = await env.DB
        .prepare(`
          SELECT telegram_user_id, chat_id, timezone, daily_time, daily_level, last_delivery_local_date
          FROM users
          WHERE is_active = 1 AND daily_enabled = 1
        `)
        .all();

    for (const user of users.results) {
        const localTime = localDateAndTime(user.timezone, scheduledTime);

        if (!localTime || localTime.time !== user.daily_time) {
            continue;
        }

        if (user.last_delivery_local_date === localTime.date) {
            continue;
        }

        // Do not replace a card the user has not answered yet. A manual card
        // and the scheduled reminder share the same daily-card experience.
        if (await getPendingDailyWord(env, user.telegram_user_id, localTime.date)) {
            await env.DB
                .prepare("UPDATE users SET last_delivery_local_date = ? WHERE telegram_user_id = ?")
                .bind(localTime.date, user.telegram_user_id)
                .run();
            continue;
        }

        if (!(await claimDailyWordCard(env, user.telegram_user_id, localTime.date))) {
            continue;
        }

        let claimedDelivery = false;
        let pendingId = null;

        try {
            const card = await generateNewDailyWord(
                env,
                user.telegram_user_id,
                user.daily_level
            );

            const claimed = await env.DB
                .prepare(`
                  UPDATE users
                  SET last_delivery_local_date = ?
                  WHERE telegram_user_id = ?
                    AND (last_delivery_local_date IS NULL OR last_delivery_local_date <> ?)
                `)
                .bind(localTime.date, user.telegram_user_id, localTime.date)
                .run();

            if (claimed.meta.changes === 0) {
                continue;
            }

            claimedDelivery = true;

            pendingId = await savePendingDailyWord(
                env,
                user.telegram_user_id,
                card,
                localTime.date
            );
            await sendMessage(
                env,
                user.chat_id,
                dailyWordText(card, user.daily_level),
                dailyWordKeyboard(pendingId)
            );
        } catch (error) {
            console.error({
                event: "daily_word_delivery_failed",
                userId: user.telegram_user_id,
                message: error instanceof Error ? error.message : "Unknown error",
            });

            if (claimedDelivery) {
                await env.DB
                    .prepare(`
                      UPDATE users
                      SET last_delivery_local_date = NULL
                      WHERE telegram_user_id = ? AND last_delivery_local_date = ?
                    `)
                    .bind(user.telegram_user_id, localTime.date)
                    .run();
            }

            if (pendingId) {
                await env.DB
                    .prepare("DELETE FROM pending_daily_words WHERE id = ? AND user_id = ?")
                    .bind(pendingId, user.telegram_user_id)
                    .run();
            }
        }
    }
}

async function sendHelp(env, chatId, userId) {
    await sendMessage(
        env,
        chatId,
        "Як користуватися ботом:\n\n1. Натисни «➕ Додати слово» або просто надішли англійське слово чи фразу.\n2. Якщо знаєш потрібне значення, напиши його після |:\ncharge | payment for a service\n3. Обери потрібне значення, якщо бот його уточнить.\n4. Відкрий «📚 Мої слова», щоб переглянути свій каталог.\n5. Відкрий «🎓 Вивчені слова», щоб повернути слово до навчання.\n6. Натисни «📚 Щоденне слово», щоб показати сьогоднішню картку, або «⏰ Нагадування», щоб окремо вибрати час і рівень. У картці натисни «Знаю» або «Вчити».\n7. На другій сторінці меню є підтримка, бонуси, відгук і зв’язок із нами.\n8. Є ідея, запитання чи хочеш створити власного бота? Натисни «📩 Зв’язатися з нами» та надішли повідомлення.\n\nНаприклад: resilient",
        mainKeyboard(isAdmin(env, userId))
    );
}

// Telegram webhook and scheduled delivery entry points. Callback actions are
// validated in the router before any user-owned data is read or changed.
export default {
    async fetch(request, env) {
        if (request.method !== "POST") {
            return new Response("Vocabulary bot is running.");
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
                        const rejected = await rejectDonationBonus(env, requestId);

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

                    const granted = await grantDonationBonus(env, requestId, accessLevel);

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

            if (callback.data.startsWith("daily:know:") || callback.data.startsWith("daily:learn:")) {
                const match = callback.data.match(/^daily:(know|learn):(\d+)$/);

                if (!match) {
                    await answerCallbackQuery(env, callback.id, "Невірний вибір.");
                    return new Response("ok");
                }

                const action = match[1];
                const pendingId = Number(match[2]);

                try {
                    if (action === "learn") {
                        if (!(await hasPendingDailyWord(env, userId, pendingId))) {
                            await answerCallbackQuery(env, callback.id, "Ця картка вже оброблена.");
                            return new Response("ok");
                        }

                        if (!(await claimDailyWordAddition(env, userId))) {
                            const dailyLimit = await getDailyAdditionLimit(env, userId);
                            await answerCallbackQuery(env, callback.id, "Денний ліміт вичерпано.");
                            await sendMessage(env, chatId, dailyLimitReachedText(dailyLimit));
                            return new Response("ok");
                        }
                    }

                    const changed = action === "learn"
                        ? await savePendingDailyWordToLearning(env, userId, pendingId)
                        : (await env.DB
                            .prepare("DELETE FROM pending_daily_words WHERE id = ? AND user_id = ?")
                            .bind(pendingId, userId)
                            .run()).meta.changes > 0;

                    if (!changed) {
                        await answerCallbackQuery(env, callback.id, "Ця картка вже оброблена.");
                        return new Response("ok");
                    }

                    await answerCallbackQuery(
                        env,
                        callback.id,
                        action === "learn" ? "Додано до списку для вивчення." : "Чудово, не додаю до списку."
                    );
                    await editMessage(
                        env,
                        chatId,
                        messageId,
                        action === "learn"
                            ? "📖 Слово додано до «📚 Мої слова»."
                            : "✅ Чудово! Це слово не додано до твого списку.",
                        { inline_keyboard: [] }
                    );
                } catch (error) {
                    console.error({
                        event: "daily_word_action_failed",
                        message: error instanceof Error ? error.message : "Unknown error",
                    });
                    await answerCallbackQuery(env, callback.id, "Не вдалося зберегти вибір.");
                }

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
                const wordId = Number(
                    callback.data.replace(/^(?:delete|archive):/, "")
                );

                if (!Number.isInteger(wordId) || wordId <= 0) {
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

                await refreshListMessage(env, chatId, messageId, userId);
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

            const pending = await getPendingWord(env, userId);

            if (!pending) {
                await answerCallbackQuery(
                    env,
                    callback.id,
                    "Цей вибір уже неактуальний. Додай слово ще раз."
                );
                return new Response("ok");
            }

            if (callback.data.startsWith("page:")) {
                const page = Number(callback.data.replace("page:", ""));
                const totalPages = Math.ceil(
                    pending.senses.length / SENSES_PER_PAGE
                );

                if (!Number.isInteger(page) || page < 0 || page >= totalPages) {
                    await answerCallbackQuery(env, callback.id, "Невірна сторінка.");
                    return new Response("ok");
                }

                await answerCallbackQuery(env, callback.id, "");

                const nextText = senseText(pending.word, pending.senses, page);
                const nextKeyboard = senseKeyboard(pending.senses, page);

                try {
                    await editMessage(
                        env,
                        chatId,
                        messageId,
                        nextText,
                        nextKeyboard
                    );
                } catch {
                    await sendMessage(
                        env,
                        chatId,
                        nextText,
                        nextKeyboard
                    );
                }

                return new Response("ok");
            }

            if (callback.data.startsWith("sense:")) {
                const senseIndex = Number(callback.data.replace("sense:", ""));
                const selectedSense = pending.senses[senseIndex];

                if (!selectedSense) {
                    await answerCallbackQuery(env, callback.id, "Невірний вибір.");
                    return new Response("ok");
                }

                await answerCallbackQuery(env, callback.id, "Створюю картку…");

                try {
                    await editMessage(
                        env,
                        chatId,
                        messageId,
                        `✅ Обране значення: ${selectedSense.label_uk}`,
                        { inline_keyboard: [] }
                    );

                    await saveAndSendWord(
                        env,
                        chatId,
                        userId,
                        pending.word,
                        selectedSense.context_en
                    );

                    await env.DB
                        .prepare("DELETE FROM pending_words WHERE user_id = ?")
                        .bind(userId)
                        .run();
                } catch {
                    await sendMessage(
                        env,
                        chatId,
                        "Не вдалося створити картку. Спробуй вибрати значення ще раз."
                    );
                }
            }

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
        INSERT INTO users (telegram_user_id, chat_id)
        VALUES (?, ?)
        ON CONFLICT(telegram_user_id)
        DO UPDATE SET chat_id = excluded.chat_id, is_active = 1
      `)
            .bind(userId, chatId)
            .run();

        if (text !== "/start" && text !== "/menu") {
            await refreshInterfaceIfNeeded(env, chatId, userId);
        }

        // Any command or menu action abandons a feedback draft, so a later
        // vocabulary word cannot accidentally be forwarded as feedback.
        if (text !== "💬 Відгук" && (text.startsWith("/") || [
            "➕ Додати слово", "📚 Мої слова", "🎓 Вивчені слова",
            "⚙️ Налаштувати", "⚙️ Налаштувати щоденне слово", "⏰ Нагадування", "⏰ Щоденне слово", "📚 Щоденне слово",
            "☕ Підтримати бот", "🎁 Отримати бонус", "📩 Зв’язатися з нами", "🛠 Адмін", "❓ Допомога",
            "➡️ Далі", "⬅️ Назад",
        ].includes(text))) {
            await clearPendingFeedback(env, userId);
        }

        if (text === "/start") {
            await sendMessage(
                env,
                chatId,
                "Привіт! Я допоможу запам’ятовувати англійські слова.\n\nПросто надішли мені слово або фразу. Якщо знаєш потрібне значення, додай його після |:\ncharge | payment for a service",
                mainKeyboard(isAdmin(env, userId))
            );
            await markInterfaceVersion(env, userId);
            return new Response("ok");
        }

        if (text === "/menu") {
            await sendMessage(env, chatId, "Ось меню:", mainKeyboard(isAdmin(env, userId)));
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
            await sendMessage(env, chatId, "Додаткові можливості:", mainKeyboard(isAdmin(env, userId), 2));
            return new Response("ok");
        }

        if (text === "⬅️ Назад") {
            await sendMessage(env, chatId, "Основне меню:", mainKeyboard(isAdmin(env, userId), 1));
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
            text === "⏰ Щоденне слово"
        ) {
            await sendDailySettings(env, chatId, userId);
            return new Response("ok");
        }

        if (text === "📚 Щоденне слово") {
            try {
                await sendTodayDailyWord(env, chatId, userId);
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
                await submitDonationBonusRequest(env, chatId, userId);
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
                await submitFeedback(env, chatId, userId, text.slice(0, 3500));
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
            const parts = addInput.split("|");
            const word = parts[0].trim();
            const explicitContext = parts.slice(1).join("|").trim();

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
        if (controller.cron === "0 3 * * *") {
            try {
                await removeExpiredLearnedWords(env);
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
            await sendDueDailyWords(env, controller.scheduledTime);
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
