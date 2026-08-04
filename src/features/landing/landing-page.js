function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

/** Static public page; it intentionally has no client-side state, forms, or trackers. */
export function landingPage({ brandName, publicWorkerUrl, content }) {
    const brand = escapeHtml(brandName);
    const title = escapeHtml(content.title);
    const description = escapeHtml(content.description);
    const botUrl = escapeHtml(content.botUrl);
    const canonicalUrl = escapeHtml(publicWorkerUrl);

    return `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${description}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${canonicalUrl}/">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="uk_UA">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonicalUrl}/">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <title>${title}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #12243b; background: #f9f2e6; }
    * { box-sizing: border-box; } html { scroll-behavior: smooth; } body { margin: 0; line-height: 1.5; } a { color: inherit; } .wrap { width: min(1120px, calc(100% - 40px)); margin: auto; }
    .hero { overflow: hidden; position: relative; padding: 24px 0 88px; background: #f9f2e6; } .hero::before, .hero::after { content: ""; position: absolute; z-index: 0; border-radius: 50%; background: #e9c75b; opacity: .28; } .hero::before { width: 440px; height: 440px; top: -250px; right: -145px; } .hero::after { width: 260px; height: 260px; bottom: -135px; left: -90px; }
    .nav, .hero-grid, section { position: relative; z-index: 1; } .nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; } .brand { display: inline-flex; align-items: center; gap: 9px; font-size: 1.1rem; font-weight: 800; letter-spacing: -.03em; text-decoration: none; } .brand img { width: 37px; height: 37px; } .brand span { color: #b57b00; } .nav a:not(.brand) { font-weight: 700; text-underline-offset: 4px; }
    .hero-grid { display: grid; grid-template-columns: 1.15fr .85fr; gap: 48px; align-items: center; padding-top: 80px; } .eyebrow { margin: 0 0 16px; color: #8f6200; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; font-size: .78rem; } h1, h2, h3 { line-height: 1.08; letter-spacing: -.045em; } h1 { max-width: 720px; margin: 0; font-size: clamp(2.8rem, 6vw, 5.4rem); } .lead { max-width: 610px; margin: 24px 0 32px; color: #3d5067; font-size: clamp(1.08rem, 2vw, 1.28rem); }
    .button { display: inline-flex; align-items: center; justify-content: center; min-height: 52px; padding: 12px 22px; border-radius: 999px; background: #12243b; color: #fff; font-weight: 800; text-decoration: none; box-shadow: 0 7px 0 #0a1828; transition: transform .15s ease, box-shadow .15s ease; } .button:hover { transform: translateY(2px); box-shadow: 0 5px 0 #0a1828; } .button:focus-visible, a:focus-visible { outline: 3px solid #d59a00; outline-offset: 4px; }
    .phone { width: min(100%, 330px); margin: auto; padding: 12px; border: 9px solid #12243b; border-radius: 40px; background: #fffdf9; box-shadow: 16px 16px 0 #e6bd3d; transform: rotate(3deg); } .phone-top { width: 34%; height: 7px; margin: 0 auto 18px; border-radius: 20px; background: #12243b; } .bubble { margin: 12px 0; padding: 14px; border-radius: 18px; background: #eaf0eb; color: #263a4d; font-size: .92rem; } .bubble.bot { margin-left: 18px; background: #fff0bd; } .bubble strong { display: block; margin-bottom: 4px; } .pill { display: inline-block; margin-top: 8px; padding: 5px 9px; border-radius: 99px; background: #12243b; color: #fff; font-size: .77rem; font-weight: 700; }
    section { padding: 88px 0; } .section-label { color: #8f6200; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; font-size: .78rem; } h2 { max-width: 720px; margin: 10px 0 18px; font-size: clamp(2rem, 4vw, 3.3rem); } .section-copy { max-width: 700px; margin: 0; color: #44556a; font-size: 1.1rem; }
    .steps, .features { display: grid; gap: 16px; margin-top: 36px; } .steps { grid-template-columns: repeat(4, 1fr); } .features { grid-template-columns: repeat(3, 1fr); } .card { padding: 26px; border: 1px solid #e4d9c6; border-radius: 24px; background: #fffdf8; } .number { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: #e9c75b; font-weight: 900; } h3 { margin: 18px 0 8px; font-size: 1.3rem; } .card p { margin: 0; color: #506176; }
    .soft { background: #eaf0eb; } .audience { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: center; } .quote { padding: 28px; border-left: 7px solid #e1ae1a; background: #fffdf8; border-radius: 0 20px 20px 0; font-size: 1.24rem; font-weight: 700; } .trust { border-top: 1px solid #dfd4c2; } .trust a { color: #12243b; font-weight: 800; } .final { text-align: center; background: #12243b; color: #fff; } .final h2 { margin-right: auto; margin-left: auto; } .final p { max-width: 620px; margin: 0 auto 30px; color: #dce5ef; font-size: 1.08rem; } .final .button { background: #e9c75b; color: #12243b; box-shadow: 0 7px 0 #af8410; } footer { padding: 26px 0; color: #526277; font-size: .9rem; background: #f9f2e6; }
    @media (max-width: 760px) { .wrap { width: min(100% - 32px, 620px); } .hero { padding-bottom: 64px; } .hero-grid, .audience { grid-template-columns: 1fr; gap: 32px; padding-top: 56px; } .phone { max-width: 300px; } .steps, .features { grid-template-columns: 1fr; } section { padding: 64px 0; } .nav a:not(.brand) { font-size: .9rem; } } @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } .button { transition: none; } }
  </style>
</head>
<body>
  <header class="hero"><div class="wrap">
    <nav aria-label="Головна навігація"><a class="brand" href="/"><img src="/favicon.svg" width="37" height="37" alt="">Mova<span>Yak</span>VDoma</a><a href="#how-it-works">Як це працює</a></nav>
    <div class="hero-grid"><div><p class="eyebrow">Англійська у звичному місці</p><h1>Вивчай англійські слова легко та щодня — у Telegram</h1><p class="lead">${brand} допомагає додати слово, зрозуміти його значення, побачити живі приклади й повертатися до словника щодня.</p><a class="button" href="${botUrl}" target="_blank" rel="noopener noreferrer">Відкрити бота в Telegram <span aria-hidden="true">→</span></a></div>
    <div class="phone" aria-label="Приклад діалогу з ботом"><div class="phone-top"></div><div class="bubble"><strong>Додати слово: charge</strong>Обери значення, яке тобі потрібне.</div><div class="bubble bot"><strong>charge — плата</strong>There is an extra charge for delivery.<br><span class="pill">Додати до словника</span></div><div class="bubble">Тепер це слово є у твоєму словнику ✨</div></div></div>
  </div></header>
  <main>
    <section><div class="wrap"><p class="section-label">Менше перемикань</p><h2>Не потрібні окремі словник, перекладач і трекер звичок</h2><p class="section-copy">Усе найважливіше для короткої щоденної практики — в одному Telegram-боті. Додавай слова, коли вони трапляються, і повертайся до них у зручному темпі.</p></div></section>
    <section class="soft" id="how-it-works"><div class="wrap"><p class="section-label">Простий ритуал</p><h2>Як це працює</h2><div class="steps"><article class="card"><span class="number">1</span><h3>Відкрий бота</h3><p>Натисни «Відкрити бота в Telegram» і почни з команди <code>/start</code>.</p></article><article class="card"><span class="number">2</span><h3>Натисни «Додати слово»</h3><p>Або просто надішли англійське слово чи фразу в чат.</p></article><article class="card"><span class="number">3</span><h3>Уточни значення за потреби</h3><p>Додай контекст після <code>/</code>, наприклад: <code>charge / payment for a service</code>.</p></article><article class="card"><span class="number">4</span><h3>Отримай картку</h3><p>Бот збереже вибране значення, переклад і два приклади у твій словник.</p></article></div></div></section>
    <section><div class="wrap"><p class="section-label">Уже в боті</p><h2>Інструменти, які підтримують навчання</h2><div class="features"><article class="card"><h3>Твій словник</h3><p>Зберігай слова, переглядай приклади та позначай вивчене.</p></article><article class="card"><h3>Щоденне слово</h3><p>Отримуй нові картки у своєму темпі й відповідно до обраного рівня.</p></article><article class="card"><h3>Переклад тексту</h3><p>Перекладай короткі фрази між українською та англійською без додавання до словника.</p></article><article class="card"><h3>Нагадування</h3><p>Обери зручний час і часовий пояс для щоденної практики.</p></article><article class="card"><h3>Значення без плутанини</h3><p>Кожна картка створюється для одного вибраного значення слова.</p></article><article class="card"><h3>Маленькі кроки</h3><p>Не треба чекати на довге заняття: достатньо одного слова зараз.</p></article></div></div></section>
    <section class="soft"><div class="wrap audience"><div><p class="section-label">Для кого</p><h2>Для тих, хто хоче зробити англійську частиною дня</h2><p class="section-copy">Якщо слова трапляються в роботі, серіалах, книжках чи розмовах — не відкладай їх «на потім». Збережи зараз і повернися тоді, коли зручно.</p></div><p class="quote">«Замість ще одного курсу — спокійна щоденна звичка, яка живе у твоєму Telegram.»</p></div></section>
    <section class="trust"><div class="wrap"><p class="section-label">Приватність</p><h2>Твій словник належить тобі</h2><p class="section-copy">Слова та навчальні налаштування ізольовані для кожного Telegram-користувача. Детально про обробку даних — у <a href="/privacy">політиці приватності</a>.</p></div></section>
    <section class="final"><div class="wrap"><p class="section-label">Почни з одного слова</p><h2>Відкрий MovaYakVDoma у Telegram</h2><p>Без нових застосунків і складного старту. Просто надішли перше слово.</p><a class="button" href="${botUrl}" target="_blank" rel="noopener noreferrer">Перейти до бота <span aria-hidden="true">→</span></a></div></section>
  </main>
  <footer><div class="wrap">© 2026 ${brand}. Англійські слова — ближче до дому.</div></footer>
</body>
</html>`;
}
