import { sendMessage } from "./telegram.js";

export async function sendHelp(env, chatId, userId, mainKeyboardForUser) {
    await sendMessage(
        env,
        chatId,
        "Як користуватися ботом:\n\n1. Натисни «➕ Додати слово» або просто надішли англійське слово чи фразу. Наприклад: resilient\n2. Якщо потрібне конкретне значення, це необов’язково, але можеш додати його після / (також працюють | та \\):\ncharge / payment for a service\n3. Обери потрібне значення, якщо бот його уточнить.\n4. Відкрий «📚 Мої слова», щоб переглянути свій каталог.\n5. Відкрий «🎓 Вивчені слова», щоб повернути слово до навчання.\n6. Натисни «📚 Щоденне слово», щоб показати сьогоднішню картку, або «⏰ Налаштування», щоб окремо вибрати час, рівень і часовий пояс. У картці натисни «Знаю» або «Вчити».\n7. На другій сторінці меню є підтримка, бонуси, відгук і зв’язок із нами.\n8. Є ідея, запитання чи хочеш створити власного бота? Натисни «📩 Зв’язатися з нами» та надішли повідомлення.",
        await mainKeyboardForUser(env, userId)
    );
}

// Telegram stores a full webhook URL. Claiming this operation keeps repair
// idempotent and retries configuration only after an API failure.
export async function ensureTelegramWebhook(env, publicWorkerUrl, telegramApi) {
    const operationKey = `telegram_webhook:${publicWorkerUrl}`;
    const claim = await env.DB
        .prepare("INSERT OR IGNORE INTO worker_operations (operation_key) VALUES (?)")
        .bind(operationKey)
        .run();
    if (claim.meta.changes === 0) return;

    try {
        await telegramApi(env, "setWebhook", {
            url: publicWorkerUrl,
            secret_token: env.TELEGRAM_WEBHOOK_SECRET,
            allowed_updates: ["message", "callback_query"],
        });
        console.log({ event: "telegram_webhook_configured", url: publicWorkerUrl });
    } catch (error) {
        await env.DB
            .prepare("DELETE FROM worker_operations WHERE operation_key = ?")
            .bind(operationKey)
            .run();
        throw error;
    }
}
