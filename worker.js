const SENSES_PER_PAGE = 3;
const MAX_SENSES = 9;
const LIST_LIMIT = 10;
const MAX_OPENAI_ATTEMPTS = 3;
const DAILY_ADD_LIMIT = 20;
const DAILY_TIME_OPTIONS = Array.from(
    { length: 24 },
    (_, hour) => `${String(hour).padStart(2, "0")}:00`
);
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
                        model: "gpt-5-nano",
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

function mainKeyboard() {
    return {
        keyboard: [
            [{ text: "➕ Додати слово" }],
            [{ text: "📚 Мої слова" }, { text: "🎓 Вивчені слова" }],
            [{ text: "⏰ Щоденне слово" }],
            [{ text: "❓ Допомога" }],
        ],
        resize_keyboard: true,
        is_persistent: true,
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

async function sendDailySettings(env, chatId, userId) {
    const user = await env.DB
        .prepare("SELECT daily_time FROM users WHERE telegram_user_id = ?")
        .bind(userId)
        .first();

    await sendMessage(
        env,
        chatId,
        `Щоденне слово зараз приходитиме о ${user?.daily_time ?? "09:00"}.\n\nОбери зручну годину:`,
        dailyTimeKeyboard()
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

async function claimDailyWordAddition(env, userId) {
    if (isAdmin(env, userId)) {
        return true;
    }

    const user = await env.DB
        .prepare("SELECT timezone FROM users WHERE telegram_user_id = ?")
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
        .bind(userId, localTime.date, DAILY_ADD_LIMIT)
        .run();

    return claimed.meta.changes > 0;
}

async function getRandomActiveWord(env, userId) {
    return env.DB
        .prepare(`
          SELECT id, source_text, translation_uk
          FROM words
          WHERE user_id = ? AND is_active = 1
          ORDER BY RANDOM()
          LIMIT 1
        `)
        .bind(userId)
        .first();
}

async function getWordExamples(env, wordId) {
    const result = await env.DB
        .prepare(`
          SELECT sentence_source, sentence_uk
          FROM examples
          WHERE word_id = ?
          ORDER BY position ASC
        `)
        .bind(wordId)
        .all();

    return result.results;
}

async function sendDueDailyWords(env, scheduledTime) {
    const users = await env.DB
        .prepare(`
          SELECT telegram_user_id, chat_id, timezone, daily_time
          FROM users
          WHERE is_active = 1
        `)
        .all();

    for (const user of users.results) {
        const localTime = localDateAndTime(user.timezone, scheduledTime);

        if (!localTime || localTime.time !== user.daily_time) {
            continue;
        }

        let claimedDelivery = false;

        try {
            const word = await getRandomActiveWord(env, user.telegram_user_id);

            if (!word) {
                continue;
            }

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

            const examples = await getWordExamples(env, word.id);
            await sendMessage(
                env,
                user.chat_id,
                `📚 Слово дня\n\n${examplesText(word, examples)}`
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

async function sendHelp(env, chatId) {
    await sendMessage(
        env,
        chatId,
        "Як користуватися ботом:\n\n1. Натисни «➕ Додати слово» або просто надішли англійське слово чи фразу.\n2. Якщо знаєш потрібне значення, напиши його після |:\ncharge | payment for a service\n3. Обери потрібне значення, якщо бот його уточнить.\n4. Відкрий «📚 Мої слова», щоб переглянути свій каталог.\n5. Відкрий «🎓 Вивчені слова», щоб повернути слово до навчання.\n\nНаприклад: resilient",
        mainKeyboard()
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
            const messageId = callback.message?.message_id;
            const userId = callback.from?.id;

            if (!chatId || !messageId || !userId) {
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

            if (callback.data.startsWith("dailytime:")) {
                const dailyTime = callback.data.replace("dailytime:", "");

                if (!DAILY_TIME_OPTIONS.includes(dailyTime)) {
                    await answerCallbackQuery(env, callback.id, "Невірний час.");
                    return new Response("ok");
                }

                await env.DB
                    .prepare(`
                      UPDATE users
                      SET daily_time = ?
                      WHERE telegram_user_id = ?
                    `)
                    .bind(dailyTime, userId)
                    .run();

                await answerCallbackQuery(env, callback.id, "Час збережено.");
                await editMessage(
                    env,
                    chatId,
                    messageId,
                    `✅ Готово! Щоденне слово приходитиме о ${dailyTime}.`,
                    { inline_keyboard: [] }
                );
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
                mainKeyboard()
            );
            return new Response("ok");
        }

        if (text === "/menu") {
            await sendMessage(env, chatId, "Ось меню:", mainKeyboard());
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

        if (text === "⏰ Щоденне слово") {
            await sendDailySettings(env, chatId, userId);
            return new Response("ok");
        }

        if (text === "❓ Допомога") {
            await sendHelp(env, chatId);
            return new Response("ok");
        }

        if (text === "/help") {
            await sendHelp(env, chatId);
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
                await sendMessage(
                    env,
                    chatId,
                    `На сьогодні вже додано ${DAILY_ADD_LIMIT} слів. Спробуй завтра.`
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
            await sendHelp(env, chatId);
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
            throw error;
        }
    },
};
