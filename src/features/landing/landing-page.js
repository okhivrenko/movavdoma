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
  <link rel="icon" href="/favicon.png" type="image/png">
  <link rel="stylesheet" href="/assets/vendor/pico.min.css">
  <link rel="stylesheet" href="/assets/landing/landing.css">
  <title>${title}</title>
</head>
<body>
  <header class="site-header">
    <nav class="container nav" aria-label="Головна навігація">
      <a class="wordmark" href="/" aria-label="MovaYakVDoma — головна">
        <img src="/assets/landing/book_house.svg" width="54" height="54" alt="">
        <span><strong>Mova<span>Yak</span>VDoma</strong><small>Твій англійський словник</small></span>
      </a>
      <div class="nav-links">
        <a href="#features">Можливості</a>
        <a href="#how-it-works">Як це працює?</a>
        <a href="#audience">Для кого?</a>
        <a href="#faq">FAQ</a>
      </div>
      <a class="nav-cta" href="${botUrl}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">➤</span> Спробувати бота</a>
    </nav>
  </header>

  <main>
    <section class="hero">
      <img class="hero-clouds" src="/assets/landing/clouds.svg" alt="" aria-hidden="true">
      <img class="hero-fields" src="/assets/landing/field_waves.svg" alt="" aria-hidden="true">
      <div class="container hero-grid">
        <div class="hero-copy">
          <p class="eyebrow">Англійська щодня у Telegram</p>
          <h1>Вивчай англійські слова легко та <em>щодня</em></h1>
          <p class="hero-lead">${brand} — твій персональний Telegram-бот для вивчення слів: точний переклад, два приклади, власний словник і зручні нагадування.</p>
          <a class="asset-cta" href="${botUrl}" target="_blank" rel="noopener noreferrer">
            <img src="/assets/landing/telegram_cta.svg" alt="Спробувати бота в Telegram">
          </a>
          <p class="trust-line"><span aria-hidden="true">🛡️</span> Безпечно. Конфіденційно. Тільки для тебе.</p>
        </div>
        <div class="hero-visual" aria-label="Приклад роботи MovaYakVDoma у Telegram">
          <img class="hero-wheat" src="/assets/landing/hero_wheat.svg" alt="" aria-hidden="true">
          <div class="phone">
            <div class="phone-notch"></div>
            <div class="phone-screen">
              <div class="chat-head"><strong>MovaYakVDoma</strong><small>бот</small></div>
              <div class="chat bubble">Привіт! 👋<br>Я твій помічник у вивченні англійських слів.</div>
              <div class="chat user">resilient</div>
              <div class="chat bubble word-card"><strong>resilient 🔊</strong><small>стійкий, витривалий</small><b>Наприклад:</b><span>She showed incredible resilience during tough times.</span><span>Resilient people bounce back stronger.</span></div>
              <div class="bot-menu"><span>＋ Додати слово</span><span>📚 Мої слова</span><span>📅 Щоденне слово</span><span>🎓 Вивчені слова</span><span>⚙️ Налаштування</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="features section" id="features">
      <div class="container">
        <div class="section-heading"><p>Усе в одному чаті</p><h2>Що вміє бот?</h2><span></span></div>
        <div class="feature-grid">
          <article class="feature-card"><div class="feature-icon blue" aria-hidden="true">📖</div><h3>Додавай слова за секунди</h3><p>Просто надішли слово — бот зробить усе інше.</p></article>
          <article class="feature-card"><div class="feature-icon gold" aria-hidden="true">🔤</div><h3>Точний переклад і приклади</h3><p>Переклад і два приклади речень українською.</p></article>
          <article class="feature-card"><div class="feature-icon blue" aria-hidden="true">🗓️</div><h3>Щоденні слова та нагадування</h3><p>Обери час і рівень — бот нагадає про навчання.</p></article>
          <article class="feature-card"><div class="feature-icon gold" aria-hidden="true">🎓</div><h3>Вивчені слова під контролем</h3><p>Позначай вивчене та повертай слова, коли треба.</p></article>
          <article class="feature-card"><div class="feature-icon blue" aria-hidden="true">📈</div><h3>Розумне повторення (скоро)</h3><p>Плануємо систему, яка допомагатиме закріплювати матеріал.</p></article>
          <article class="feature-card"><div class="feature-icon gold" aria-hidden="true">🔒</div><h3>Тільки твої дані</h3><p>Словник ізольований і не доступний іншим користувачам.</p></article>
        </div>
      </div>
    </section>

    <section class="steps section" id="how-it-works">
      <div class="container">
        <div class="section-heading"><p>П'ять простих кроків</p><h2>Як це працює?</h2><span></span></div>
        <ol class="step-list">
          <li><div class="step-icon">➤</div><h3>Запусти бота</h3><p>Натисни кнопку та відкрий бот у Telegram.</p></li>
          <li><div class="step-icon">＋</div><h3>Додай слово</h3><p>Надішли англійське слово або фразу.</p></li>
          <li><div class="step-icon">📘</div><h3>Отримай переклад</h3><p>Бот надасть переклад і приклади вживання.</p></li>
          <li><div class="step-icon">✓</div><h3>Вчи щодня</h3><p>Повертайся до слів або отримуй нагадування.</p></li>
          <li><div class="step-icon">🏅</div><h3>Закріплюй знання</h3><p>Щоденна практика допомагає не забути.</p></li>
        </ol>
      </div>
    </section>

    <section class="audience section" id="audience">
      <div class="container audience-grid">
        <div><p class="eyebrow">Для кого?</p><h2>Для тих, хто хоче зробити англійську частиною дня</h2></div>
        <p>Для роботи, подорожей, навчання чи улюблених серіалів — зберігай нові слова одразу й повертайся до них у власному темпі.</p>
      </div>
    </section>

    <section class="cta-section section">
      <div class="container cta-banner">
        <img src="/assets/landing/book_house.svg" width="150" height="150" alt="Логотип MovaYakVDoma">
        <div><h2>Почни вчити англійські слова <em>вже сьогодні</em></h2><p>${brand} — твій щоденний крок до кращої англійської.</p><a class="primary-cta" href="${botUrl}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">➤</span> Спробувати бота в Telegram</a><small>Безкоштовний старт займає менше хвилини.</small></div>
      </div>
    </section>

    <section class="faq section" id="faq">
      <div class="container faq-wrap">
        <div class="section-heading"><p>Коротко про головне</p><h2>FAQ</h2><span></span></div>
        <details><summary>Чи потрібно встановлювати окремий застосунок?</summary><p>Ні. MovaYakVDoma працює у Telegram — достатньо відкрити бот і надіслати слово.</p></details>
        <details><summary>Що зберігає бот?</summary><p>Твій словник, приклади, навчальний прогрес і налаштування нагадувань. Деталі є у <a href="/privacy">політиці приватності</a>.</p></details>
        <details><summary>Чи можу я додати конкретне значення слова?</summary><p>Так. Додай контекст після <code>/</code>, наприклад: <code>charge / payment for a service</code>.</p></details>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="container footer-grid">
      <a class="wordmark compact" href="/"><img src="/assets/landing/book_house.svg" width="42" height="42" alt=""><span><strong>Mova<span>Yak</span>VDoma</strong><small>Твій англійський словник</small></span></a>
      <nav aria-label="Навігація в підвалі"><a href="#faq">FAQ</a><a href="/privacy">Політика конфіденційності</a><a href="${botUrl}" target="_blank" rel="noopener noreferrer">Telegram</a></nav>
      <p>© 2026 ${brand}<br>Усі права захищені</p>
    </div>
  </footer>
</body>
</html>`;
}
