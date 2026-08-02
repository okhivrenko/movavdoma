const SENSES_PER_PAGE = 3;
const MAX_SENSES = 9;
const LIST_LIMIT = 10;
const MAX_OPENAI_ATTEMPTS = 3;
const DAILY_ADD_LIMIT = 10;
const DONATION_TIER_50_KOPIYKAS = 10_000;
const DONATION_TIER_100_KOPIYKAS = 20_000;
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
const ADD_WORD_HINT =
    "Надішли англійське слово або фразу.\n\nЯкщо важливе конкретне значення, додай контекст після |:\ncharge | payment for a service\n\nПриклад без контексту: resilient";

async function telegramApi(env, method, payload) {
    const response = await fetch(
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
        }
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
        throw new Error(`Telegram ${method} failed`);
    }

    return data.result;
}

async function sendMessage(env, chatId, text, replyMarkup) {
    return telegramApi(env, "sendMessage", {
        chat_id: chatId,
        text,
        reply_markup: replyMarkup,
    });
}

async function editMessage(env, chatId, messageId, text, replyMarkup) {
    return telegramApi(env, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        reply_markup: replyMarkup,
    });
}

async function answerCallbackQuery(env, callbackQueryId, text) {
    return telegramApi(env, "answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        text,
    });
}

async function getBotLink(env) {
    const bot = await telegramApi(env, "getMe", {});
    const username = bot?.username;

    if (!/^[A-Za-z0-9_]{5,32}$/.test(username ?? "")) {
        throw new Error("Telegram bot username is unavailable.");
    }

    return `https://t.me/${username}`;
}

function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRetryableOpenAIStatus(status) {
    return status === 429 || status >= 500;
}

function openAIRetryDelay(response, attempt) {
    const retryAfterSeconds = Number(response.headers.get("retry-after"));

    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        return Math.min(retryAfterSeconds * 1000, 2_000);
    }

    return 250 * 2 ** attempt;
}

async function openAIJson(env, name, schema, instructions, input) {
    for (let attempt = 0; attempt < MAX_OPENAI_ATTEMPTS; attempt += 1) {
        let response;

        try {
            response = await fetch(
                "https://api.openai.com/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        model: "gpt-5.4-nano",
                        reasoning_effort: "none",
                        max_completion_tokens: 400,
                        response_format: {
                            type: "json_schema",
                            json_schema: { name, strict: true, schema },
                        },
                        messages: [
                            { role: "developer", content: instructions },
                            { role: "user", content: input },
                        ],
                    }),
                },
            );
        } catch (error) {
            if (attempt === MAX_OPENAI_ATTEMPTS - 1) {
                throw error;
            }

            console.warn({
                event: "openai_retry",
                attempt: attempt + 1,
                reason: "network_error",
            });
            await wait(250 * 2 ** attempt);
            continue;
        }

        if (!response.ok) {
            if (
                !isRetryableOpenAIStatus(response.status) ||
                attempt === MAX_OPENAI_ATTEMPTS - 1
            ) {
                throw new Error(`OpenAI ${response.status}`);
            }

            console.warn({
                event: "openai_retry",
                attempt: attempt + 1,
                status: response.status,
            });
            await wait(openAIRetryDelay(response, attempt));
            continue;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            throw new Error("OpenAI returned an empty response.");
        }

        return JSON.parse(content);
    }

    throw new Error("OpenAI retry attempts exhausted.");
}

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

async function getRecentActiveWords(env, userId) {
    const result = await env.DB
        .prepare(`
      SELECT id, source_text, translation_uk
      FROM words
      WHERE user_id = ? AND is_active = 1
      ORDER BY id DESC
      LIMIT ?
    `)
        .bind(userId, LIST_LIMIT)
        .all();

    return result.results;
}

async function getRecentArchivedWords(env, userId) {
    const result = await env.DB
        .prepare(`
      SELECT id, source_text, translation_uk
      FROM words
      WHERE user_id = ? AND is_active = 0
      ORDER BY id DESC
      LIMIT ?
    `)
        .bind(userId, LIST_LIMIT)
        .all();

    return result.results;
}

function listText(words) {
    if (words.length === 0) {
        return "У словнику поки немає активних слів.";
    }

    return `Останні слова:\n${words
        .map(
            (word, index) =>
                `${index + 1}. ${word.source_text} — ${word.translation_uk}`
        )
        .join("\n")}\n\nНатисни «Вивчив» під словом, яке вже добре знаєш.`;
}

function listKeyboard(words) {
    if (words.length === 0) {
        return undefined;
    }

    return {
        inline_keyboard: words.map((word, index) => [
            {
                text: `💬 Приклади №${index + 1}`,
                callback_data: `examples:${word.id}`,
            },
            {
                text: `✅ Вивчив №${index + 1}`,
                callback_data: `delete:${word.id}`,
            },
        ]),
    };
}

function examplesText(word, examples) {
    const heading = word.translation_uk
        ? `${word.source_text} — ${word.translation_uk}`
        : word.source_text;

    if (examples.length === 0) {
        return `📘 ${heading}\n\nДля цього слова поки немає прикладів.`;
    }

    return `📘 ${heading}\n\n${examples
        .map(
            (example, index) =>
                `${index + 1}. ${example.sentence_source}\n${example.sentence_uk}`
        )
        .join("\n\n")}`;
}

async function sendWordExamples(env, chatId, userId, wordId) {
    const word = await env.DB
        .prepare(`
      SELECT source_text, translation_uk
      FROM words
      WHERE id = ? AND user_id = ? AND is_active = 1
    `)
        .bind(wordId, userId)
        .first();

    if (!word) {
        return false;
    }

    const result = await env.DB
        .prepare(`
      SELECT sentence_source, sentence_uk
      FROM examples
      WHERE word_id = ?
      ORDER BY position ASC
    `)
        .bind(wordId)
        .all();

    await sendMessage(env, chatId, examplesText(word, result.results));
    return true;
}

function archivedText(words) {
    if (words.length === 0) {
        return "Вивчених слів поки немає.";
    }

    return `Вивчені слова:\n${words
        .map(
            (word, index) =>
                `${index + 1}. ${word.source_text} — ${word.translation_uk}`
        )
        .join("\n")}\n\nНатисни «Вивчати» під словом, щоб повернути його до навчання.`;
}

function archivedKeyboard(words) {
    if (words.length === 0) {
        return undefined;
    }

    return {
        inline_keyboard: words.map((word, index) => [
            {
                text: `📖 Вивчати №${index + 1}`,
                callback_data: `restore:${word.id}`,
            },
        ]),
    };
}

async function refreshListMessage(env, chatId, messageId, userId) {
    const words = await getRecentActiveWords(env, userId);
    const text = listText(words);
    const keyboard = listKeyboard(words);

    try {
        await editMessage(env, chatId, messageId, text, keyboard);
    } catch {
        await sendMessage(env, chatId, text, keyboard);
    }
}

async function refreshArchivedMessage(env, chatId, messageId, userId) {
    const words = await getRecentArchivedWords(env, userId);
    const text = archivedText(words);
    const keyboard = archivedKeyboard(words);

    try {
        await editMessage(env, chatId, messageId, text, keyboard);
    } catch {
        await sendMessage(env, chatId, text, keyboard);
    }
}

function wordCountLabel(count) {
    const lastTwoDigits = count % 100;
    const lastDigit = count % 10;

    if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
        return "слів";
    }

    if (lastDigit === 1) {
        return "слово";
    }

    if (lastDigit >= 2 && lastDigit <= 4) {
        return "слова";
    }

    return "слів";
}

function dailyLimitReachedText(limit) {
    return `На сьогодні ліміт — ${limit} ${wordCountLabel(limit)} — уже використано. Нові слова можна буде додати завтра.\n\nЯкщо бот корисний, підтримка допомагає його розвивати й може збільшити персональний ліміт.`;
}

function mainKeyboard(showAdmin = false) {
    const keyboard = [
        [{ text: "➕ Додати слово" }],
        [{ text: "📚 Мої слова" }, { text: "🎓 Вивчені слова" }],
        [{ text: "📚 Щоденне слово" }, { text: "⚙️ Налаштувати" }],
        [{ text: "☕ Підтримати бот" }, { text: "🎁 Отримати бонус" }],
    ];

    if (showAdmin) {
        keyboard.push([{ text: "🛠 Адмін" }]);
    }

    keyboard.push([{ text: "❓ Допомога" }]);

    return {
        keyboard,
        resize_keyboard: true,
        is_persistent: true,
    };
}

function adminKeyboard() {
    return {
        inline_keyboard: [
            [{ text: "👥 Список користувачів", callback_data: "admin:users" }],
            [{ text: "🔗 Посилання на бота", callback_data: "admin:link" }],
            [{ text: "🎁 Змінити ліміт", callback_data: "admin:grant" }],
            [{ text: "❓ Команди адміна", callback_data: "admin:help" }],
        ],
    };
}

function adminHelpText() {
    return "🛠 Адмін-панель\n\n• 👥 Список користувачів — усі користувачі, по 50 на сторінці, з ID, лімітами та кількістю активних слів.\n• 🔗 Посилання на бота — показує пряме посилання, яке можна скопіювати або переслати.\n• /grant <userId> <ліміт> — встановити денний ліміт на 1 місяць.\n  Приклад: /grant 123456789 45\n• 🎁 Заявки на донати приходять окремими картками з кнопками підтвердження.";
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
            return `${position}. ID ${user.telegram_user_id} · слів: ${compactAdminNumber(user.active_word_count)} · ліміт: ${dailyLimit}`;
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

function localDateAndTime(timezone, timestamp) {
    try {
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        }).formatToParts(new Date(timestamp));
        const values = Object.fromEntries(
            parts
                .filter((part) => part.type !== "literal")
                .map((part) => [part.type, part.value])
        );

        return {
            date: `${values.year}-${values.month}-${values.day}`,
            time: `${values.hour}:${values.minute}`,
        };
    } catch {
        return null;
    }
}

function isAdmin(env, userId) {
    return String(userId) === env.ADMIN_TELEGRAM_USER_ID;
}

function formatHryvnias(amountKopiykas) {
    return new Intl.NumberFormat("uk-UA", {
        style: "currency",
        currency: "UAH",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(amountKopiykas / 100);
}

function createSupportCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const values = new Uint32Array(5);
    crypto.getRandomValues(values);

    return `V-${Array.from(values, (value) => alphabet[value % alphabet.length]).join("")}`;
}

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

function donationDailyLimit(amountKopiykas) {
    if (amountKopiykas > DONATION_TIER_100_KOPIYKAS) {
        return 40;
    }

    if (amountKopiykas >= DONATION_TIER_50_KOPIYKAS) {
        return 25;
    }

    return 15;
}

function adminDonationKeyboard(requestId, suggestedLimit) {
    const suggestedButton = suggestedLimit
        ? [{ text: `Видати ${suggestedLimit}/день на місяць`, callback_data: `bonus:${suggestedLimit}:${requestId}` }]
        : [];

    return {
        inline_keyboard: [
            suggestedButton,
            [
                { text: "15/день", callback_data: `bonus:15:${requestId}` },
                { text: "25/день", callback_data: `bonus:25:${requestId}` },
                { text: "40/день", callback_data: `bonus:40:${requestId}` },
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
        const suggestedLimit = transaction
            ? donationDailyLimit(transaction.amount_kopiykas)
            : null;

        await sendMessage(
            env,
            adminChatId,
            `🎁 Заявка на бонус\nКористувач: ${request.user_id}\nКод: ${request.support_code}${amount}${suggestedLimit ? `\nРекомендація: ${suggestedLimit} слів/день на 1 місяць.` : ""}`,
            adminDonationKeyboard(request.id, suggestedLimit)
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
        "🎁 Заявку на бонус прийнято. Я перевірю донат і надам бонус найближчим часом. Бонус діє 1 місяць: менше 100 грн — 15 слів/день, від 100 до 200 грн включно — 25 слів/день, понад 200 грн — 40 слів/день."
    );

    await notifyPendingDonationRequests(env);
}

async function grantDonationBonus(env, requestId, dailyLimit) {
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

    const granted = await env.DB
        .prepare(`
          UPDATE donation_requests
          SET status = 'granted', granted_daily_limit = ?, granted_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'awaiting_review'
        `)
        .bind(dailyLimit, request.id)
        .run();

    if (granted.meta.changes === 0) {
        return null;
    }

    await env.DB
        .prepare(`
          INSERT INTO user_daily_limits (user_id, daily_limit, donation_request_id)
          VALUES (?, ?, ?, datetime('now', '+1 month'))
          ON CONFLICT(user_id) DO UPDATE SET
            daily_limit = excluded.daily_limit,
            donation_request_id = excluded.donation_request_id,
            expires_at = excluded.expires_at,
            granted_at = CURRENT_TIMESTAMP
        `)
        .bind(request.user_id, dailyLimit, request.id)
        .run();

    const user = await env.DB
        .prepare("SELECT chat_id FROM users WHERE telegram_user_id = ?")
        .bind(request.user_id)
        .first();

    if (user?.chat_id) {
        await sendMessage(
            env,
            user.chat_id,
            `🎁 Дякую за підтримку! Твій денний ліміт — ${dailyLimit} ${wordCountLabel(dailyLimit)} на наступний місяць.`
        );
    }

    return request;
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

function dailyWordKeyboard(pendingId) {
    return {
        inline_keyboard: [[
            { text: "✅ Знаю", callback_data: `daily:know:${pendingId}` },
            { text: "📖 Вчити", callback_data: `daily:learn:${pendingId}` },
        ]],
    };
}

function dailyWordText(card, level) {
    return `📚 Нове слово дня · ${level}\n\n${card.word} — ${card.translation_uk}\n\n1. ${card.examples[0].source}\n${card.examples[0].uk}\n\n2. ${card.examples[1].source}\n${card.examples[1].uk}\n\nЯкщо хочеш додати його до свого списку, натисни «Вчити».`;
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
          SELECT timezone, daily_level, last_delivery_local_date
          FROM users
          WHERE telegram_user_id = ?
        `)
        .bind(userId)
        .first();
    const localTime = localDateAndTime(user?.timezone ?? "Europe/Warsaw", Date.now());

    if (!localTime) {
        throw new Error("Unable to calculate local date for daily word.");
    }

    if (user?.last_delivery_local_date === localTime.date) {
        const pending = await getPendingDailyWord(env, userId, localTime.date);

        if (!pending) {
            await sendMessage(env, chatId, "Сьогоднішню картку вже оброблено. Завтра буде нове слово.");
            return;
        }

        await sendMessage(
            env,
            chatId,
            dailyWordText(pending.card, user?.daily_level ?? "B1"),
            dailyWordKeyboard(pending.id)
        );
        return;
    }

    const claimed = await env.DB
        .prepare(`
          UPDATE users
          SET last_delivery_local_date = ?
          WHERE telegram_user_id = ?
            AND (last_delivery_local_date IS NULL OR last_delivery_local_date <> ?)
        `)
        .bind(localTime.date, userId, localTime.date)
        .run();

    if (claimed.meta.changes === 0) {
        const pending = await getPendingDailyWord(env, userId, localTime.date);

        if (pending) {
            await sendMessage(
                env,
                chatId,
                dailyWordText(pending.card, user?.daily_level ?? "B1"),
                dailyWordKeyboard(pending.id)
            );
        } else {
            await sendMessage(env, chatId, "Сьогоднішня картка вже готується. Спробуй ще раз за кілька секунд.");
        }
        return;
    }

    let pendingId = null;

    try {
        const level = user?.daily_level ?? "B1";
        const card = await generateNewDailyWord(env, userId, level);
        pendingId = await savePendingDailyWord(env, userId, card, localTime.date);
        await sendMessage(env, chatId, dailyWordText(card, level), dailyWordKeyboard(pendingId));
    } catch (error) {
        await env.DB
            .prepare("UPDATE users SET last_delivery_local_date = NULL WHERE telegram_user_id = ? AND last_delivery_local_date = ?")
            .bind(userId, localTime.date)
            .run();

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
          SELECT telegram_user_id, chat_id, timezone, daily_time, daily_level
          FROM users
          WHERE is_active = 1 AND daily_enabled = 1
        `)
        .all();

    for (const user of users.results) {
        const localTime = localDateAndTime(user.timezone, scheduledTime);

        if (!localTime || localTime.time !== user.daily_time) {
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

async function sendActiveWordList(env, chatId, userId) {
    const words = await getRecentActiveWords(env, userId);
    await sendMessage(env, chatId, listText(words), listKeyboard(words));
}

async function sendLearnedWordList(env, chatId, userId) {
    const words = await getRecentArchivedWords(env, userId);
    await sendMessage(env, chatId, archivedText(words), archivedKeyboard(words));
}

async function sendHelp(env, chatId, userId) {
    await sendMessage(
        env,
        chatId,
        "Як користуватися ботом:\n\n1. Натисни «➕ Додати слово» або просто надішли англійське слово чи фразу.\n2. Якщо знаєш потрібне значення, напиши його після |:\ncharge | payment for a service\n3. Обери потрібне значення, якщо бот його уточнить.\n4. Відкрий «📚 Мої слова», щоб переглянути свій каталог.\n5. Відкрий «🎓 Вивчені слова», щоб повернути слово до навчання.\n6. Натисни «📚 Щоденне слово», щоб показати сьогоднішню картку, або «⚙️ Налаштувати», щоб окремо вибрати час і рівень. У картці натисни «Знаю» або «Вчити».\n7. Щоб підтримати бот, натисни «☕ Підтримати бот», додай виданий код у коментар платежу, а потім — «🎁 Отримати бонус».\n\nНаприклад: resilient",
        mainKeyboard(isAdmin(env, userId))
    );
}

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

                // Keep pending admin cards sent before the tier update actionable.
                const match = callback.data.match(/^bonus:(15|25|40|30|50|100|reject):(\d+)$/);

                if (!match) {
                    await answerCallbackQuery(env, callback.id, "Невірна заявка.");
                    return new Response("ok");
                }

                const action = match[1];
                const requestId = Number(match[2]);

                if (!Number.isInteger(requestId) || requestId <= 0) {
                    await answerCallbackQuery(env, callback.id, "Невірна заявка.");
                    return new Response("ok");
                }

                try {
                    if (action === "reject") {
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

                    const dailyLimit = Number(action);
                    const granted = await grantDonationBonus(env, requestId, dailyLimit);

                    if (!granted) {
                        await answerCallbackQuery(env, callback.id, "Заявку вже оброблено.");
                        return new Response("ok");
                    }

                    await answerCallbackQuery(env, callback.id, "Бонус надано.");
                    await editMessage(
                        env,
                        chatId,
                        messageId,
                        `✅ Заявка #${requestId}: ${dailyLimit} ${wordCountLabel(dailyLimit)} на день, діє 1 місяць.`,
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
              SET is_active = 0
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

            if (callback.data.startsWith("restore:")) {
                const wordId = Number(callback.data.replace("restore:", ""));

                if (!Number.isInteger(wordId) || wordId <= 0) {
                    await answerCallbackQuery(env, callback.id, "Невірний вибір.");
                    return new Response("ok");
                }

                const restored = await env.DB
                    .prepare(`
              UPDATE words
              SET is_active = 1
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

                await refreshArchivedMessage(env, chatId, messageId, userId);
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

        if (text === "/start") {
            await sendMessage(
                env,
                chatId,
                "Привіт! Я допоможу запам’ятовувати англійські слова.\n\nПросто надішли мені слово або фразу. Якщо знаєш потрібне значення, додай його після |:\ncharge | payment for a service",
                mainKeyboard(isAdmin(env, userId))
            );
            return new Response("ok");
        }

        if (text === "/menu") {
            await sendMessage(env, chatId, "Ось меню:", mainKeyboard(isAdmin(env, userId)));
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

        if (text === "📚 Мої слова") {
            await sendActiveWordList(env, chatId, userId);
            return new Response("ok");
        }

        if (text === "🎓 Вивчені слова") {
            await sendLearnedWordList(env, chatId, userId);
            return new Response("ok");
        }

        if (text === "⚙️ Налаштувати" || text === "⏰ Щоденне слово") {
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
              SET is_active = 0
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
              SET is_active = 0
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
              SET is_active = 1
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
              SET is_active = 1
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
