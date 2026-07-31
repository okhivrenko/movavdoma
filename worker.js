const SENSES_PER_PAGE = 3;
const MAX_SENSES = 9;

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

async function openAIJson(env, name, schema, instructions, input) {
    const response = await fetch(
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
                max_completion_tokens: 700,
                response_format: {
                    type: "json_schema",
                    json_schema: { name, strict: true, schema },
                },
                messages: [
                    { role: "developer", content: instructions },
                    { role: "user", content: input },
                ],
            }),
        }
    );

    if (!response.ok) {
        throw new Error(`OpenAI ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
        throw new Error("OpenAI returned an empty response.");
    }

    return JSON.parse(content);
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
                "Додай слово так:\n/add resilient\n\nАбо уточни значення:\n/add charge | payment for a service\n\nПереглянь слова: /list\nАрхівуй слово зі списку: /delete 1"
            );
            return new Response("ok");
        }

        const addMatch = text.match(/^\/add\s+(.+)$/i);

        if (addMatch) {
            const parts = addMatch[1].split("|");
            const word = parts[0].trim();
            const explicitContext = parts.slice(1).join("|").trim();

            if (!word) {
                await sendMessage(env, chatId, "Напиши слово після /add.");
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
            } catch {
                await sendMessage(
                    env,
                    chatId,
                    "Не вдалося обробити слово. Спробуй ще раз за хвилину."
                );
            }

            return new Response("ok");
        }

        const deleteMatch = text.match(/^\/delete(?:\s+(.+))?$/i);

        if (deleteMatch) {
            const position = Number(deleteMatch[1]);

            if (!Number.isInteger(position) || position < 1 || position > 10) {
                await sendMessage(
                    env,
                    chatId,
                    "Вкажи номер слова зі списку, наприклад: /delete 1"
                );
                return new Response("ok");
            }

            const archived = await env.DB
                .prepare(`
          UPDATE words
          SET is_active = 0
          WHERE id = (
            SELECT id
            FROM words
            WHERE user_id = ? AND is_active = 1
            ORDER BY id DESC
            LIMIT 1 OFFSET ?
          )
          AND user_id = ?
          AND is_active = 1
        `)
                .bind(userId, position - 1, userId)
                .run();

            if (archived.meta.changes === 0) {
                await sendMessage(
                    env,
                    chatId,
                    "Не знайшов активного слова з таким номером. Онови список командою /list."
                );
                return new Response("ok");
            }

            await sendMessage(
                env,
                chatId,
                `✅ Слово №${position} перенесено до архіву.`
            );
            return new Response("ok");
        }

        if (text === "/list") {
            const result = await env.DB
                .prepare(`
          SELECT source_text, translation_uk
          FROM words
          WHERE user_id = ? AND is_active = 1
          ORDER BY id DESC
          LIMIT 10
        `)
                .bind(userId)
                .all();

            const words = result.results;

            await sendMessage(
                env,
                chatId,
                words.length
                    ? `Останні слова:\n${words
                        .map(
                            (word, index) =>
                                `${index + 1}. ${word.source_text} — ${word.translation_uk}`
                        )
                        .join("\n")}`
                    : "У словнику поки немає слів."
            );

            return new Response("ok");
        }

        return new Response("ok");
    },
};
