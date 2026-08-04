# План лендингу MovaYakVDoma

## Мета

Створити швидкий, безпечний і SEO-готовий український лендинг, який пояснює
цінність MovaYakVDoma та веде відвідувача до офіційного Telegram-бота.

## Позиціонування

**MovaYakVDoma — персональний помічник для англійських слів у Telegram.**
Додати слово, зрозуміти значення, побачити приклади, повторювати щодня і
відстежувати свій словник можна в одному знайомому місці — без набору окремих
застосунків.

### Продуктове бачення

Ми перетворюємо вивчення мов із «ще одного курсу, який треба пройти» на
невелику щоденну звичку. Telegram є точкою входу; надалі продукт може ставати
персональнішим і багатомовним, але перший сайт продає лише доступні сьогодні
можливості.

## Візуальний напрям

- Використати надані авторські референси як основу: кремовий фон, темно-синій
  текст, теплий жовтий акцент, м'які ботанічні форми.
- Логотип і ілюстрації — декор або підтримка змісту; ключові твердження мають
  бути HTML-текстом.
- Не використовувати дрібний текст усередині зображень, агресивні анімації чи
  шаблонні стокові фото.

## Структура першої версії

1. **Hero:** «Вивчай англійські слова легко та щодня — у Telegram»; основний
   CTA «Відкрити бота в Telegram».
2. **Проблема → рішення:** не треба окремого словника, перекладача й трекера.
3. **Як це працює:** додай слово → обери значення → отримай переклад і два
   приклади → повертайся до щоденного навчання.
4. **Можливості:** персональний словник, приклади, вивчені слова, щоденне
   слово, переклад тексту, нагадування.
5. **Для кого:** для людей, які хочуть вчити англійську маленькими кроками.
6. **Privacy / довіра:** посилання на чинну політику приватності й прозоре
   твердження, що словник користувача ізольований.
7. **Фінальний CTA:** повторний перехід до офіційного Telegram-бота.

## Операційна модель

Основна команда працює як продуктове тріо:

- **Product Lead** відповідає за «що, для кого і чому»;
- **Senior Product Designer** відповідає за те, як людина розуміє продукт і
  взаємодіє зі сторінкою;
- **Senior Frontend / Design Engineer** відповідає за безпечну й якісну
  реалізацію.
- **Senior React Engineer** не активується для поточного framework-free
  landing page. Він стає DRI React-реалізації лише якщо окремий ADR обґрунтує
  React/Next.js; тоді обов'язково застосовується pinned Vercel skill.
- **Database Engineer / Data Architect** не потрібен для статичної сторінки без
  збереження даних. Він обов'язковий, якщо landing додає схему, форми зі
  збереженням, міграції, аналітичне сховище або production-data backfill.

Content Design, UX Research, SEO/Growth і Social Content є спеціалізованими
зонами відповідальності. Одна людина або агент може виконувати кілька ролей,
але кожен результат має одного DRI.

**Application & Backend Architect** консультує продуктове тріо щодо системних
меж, Cloudflare-архітектури, безпеки, data contracts і довгострокової
підтримуваності. Для простого лендингу він перевіряє рішення, а для
кросзастосункової, schema або backend-зміни стає DRI архітектури до початку
реалізації.

**Application Security Engineer**, **Platform/DevOps/SRE Engineer**, **QA
Automation & Quality Engineer** і **Accessibility Specialist** формують
незалежні assurance gates. Вони долучаються під час планування, а не лише після
завершення коду: Security перевіряє загрози, QA — доказ якості, Accessibility —
доступність основного journey, SRE — готовність production і відновлення.

## Ролі та послідовність

| Етап | DRI | Результат | Обов'язкове рев'ю |
| --- | --- | --- | --- |
| 1. Product brief | Product Lead | аудиторія, проблема, live-функції, обіцянка, scope, KPI | Product Designer, Content, SEO/Growth |
| 2. Research brief | UX Researcher | ключові припущення, метод, учасники, evidence plan | Product Lead, Product Designer |
| 3. Search brief | SEO & Growth Specialist | search intent, query cluster, metadata та measurement plan | Content Designer, Product Lead |
| 4. Content model | Content Designer | hero, narrative, feature copy, CTA, trust і FAQ | Product Lead, SEO/Growth |
| 5. UX and UI | Senior Product Designer | journey, responsive wireframes, visual system, accessible interaction | Content, Frontend Engineer |
| 6. Prototype validation | UX Researcher | 3–5 sessions, findings, risks і recommended changes | Product trio, Content |
| 7. Architecture review | Application & Backend Architect | route boundary, data flow, security model, operational impact і rollback | Security, Senior JS, Frontend, SRE |
| 8. Security and quality plan | Application Security + QA | threat model, negative paths, regression matrix і release evidence | Architect, Product Lead, Engineers |
| 9. Build | Senior Frontend / Design Engineer | семантична адаптивна сторінка у Worker та automated tests | Product Designer, Content, Senior JS |
| 10. Accessibility assurance | Accessibility Specialist | keyboard, screen reader, contrast, reflow, motion і content review | Product Designer, Content, QA |
| 11. Technical release review | Senior JavaScript Engineer + QA + Security | route isolation, CSP, headers, regression, performance і residual risk | Architect, Frontend, SRE |
| 12. Social launch brief | Social Content Strategist | preview assets, campaign copy, channel CTA та UTM links | Product Lead, Content, SEO/Growth |
| 13. Production readiness | Platform/DevOps/SRE Engineer | CI/CD, deploy plan, observability, smoke checks, rollback і recovery | Architect, Security, QA |
| 14. Release and learn | Product Lead | Cloudflare deploy authorization, canonical URL, baseline metrics і iteration decision | всі ролі |

## Технічне рішення

Першу версію додати як публічний маршрут `/` чинного Cloudflare Worker.
Webhook залишиться доступним лише через `POST` і перевірку Telegram secret;
`/privacy` збережеться. Сторінка залишається server-rendered HTML. Google
Analytics працює в Advanced Consent Mode: тег видимий для Google Tag Assistant,
analytics storage за замовчуванням `denied`, а без згоди надсилаються лише
вимірювання без cookies. Відмова не обмежує роботу сторінки.

## SEO та вимірювання

- Search brief від 4 серпня 2026 року: основний кластер — «вивчення англійських
  слів», «Telegram-бот для вивчення англійської», «англійські слова щодня»;
  підтримувальні наміри — власний словник, переклад із прикладами та щоденні
  нагадування. Термінологія використовується природно у видимому тексті, title
  і description без keyword stuffing.
- Продуктова перевірка: провести 3–5 коротких тестів сторінки з представниками
  цільової аудиторії та перетворити спостереження на окремий backlog.
- У релізі: унікальні title/description, canonical/hreflang, Open Graph і
  Twitter metadata, семантичні headings, sitemap/robots та правдиві `WebSite`
  і `SoftwareApplication` JSON-LD без непідтверджених рейтингів.
- Після релізу: відокремлювати органічні та кампанійні переходи, перевіряти
  Search Console і Core Web Vitals та формувати backlog з фактичних даних.
  Google Analytics отримує cookieless measurements до згоди, а повні page views
  і Telegram CTA clicks — після згоди; вибір можна змінити через футер.

## Definition of done

- Усі обіцянки на сторінці відповідають чинному боту.
- CTA відкриває офіційний Telegram-бот і протестований на мобільному пристрої.
- Є адаптивність, клавіатурна навігація, контраст, альтернативи зображенням і
  відсутній критичний content shift.
- Перевірено HTML, Worker tests, authorization-negative paths, CSP/security
  headers, accessibility, Lighthouse/Core Web Vitals і SEO metadata.
- Є production readiness evidence: актуальні bindings і secrets, deploy та
  rollback plan, observability, smoke checks і recovery owner.
- Після рев'ю зміна комітиться, пушиться й розгортається у Cloudflare.
