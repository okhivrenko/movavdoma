# Історія декомпозиції `worker.js`

Цей документ реконструює Git-історію від початкового монолітного Worker до
поточного composition root. Він доповнює
[ретроспективу фінального slice](./WORKER_REFACTORING_RETROSPECTIVE_UA.md).

## Вихідна точка і масштаб задачі

| Етап | Commit | Рядків у `worker.js` | Значення |
| --- | --- | ---: | --- |
| Початковий бот | `7956a48` | 628 | Майже вся runtime-логіка була в одному файлі. |
| Пік моноліту | `8b869da` | 3002 | Після додавання vocabulary, daily words, donations, admin та UI. |
| Ранній extraction | `0551dd7` | 2376 | Vocabulary/access helpers почали ставати Worker services. |
| Scheduled/donation extraction | `af294af` | 1910 | Фонові сценарії втратили частину inline orchestration. |
| Feature-first структура | `0904dea` | 1021 | Більшість сценаріїв і callback routing перейшла у `src/features`. |
| i18n foundation | `34b7354` | 1000 | З'явились localized navigation actions. |
| Поточний стан | `21440b6` | 477 | Navigation, privacy та vocabulary text commands винесені. |

Підсумок від піку: **3002 → 477 рядків**, −2525 рядків (−84%). Від
початкового single-file bot до завершеного refactor: **628 → 477** (−24%),
але поточний Worker одночасно підтримує значно більше продуктового функціоналу.

## Хронологія

### 1. Спочатку — delivery в одному файлі (31 липня — 2 серпня)

Коміти від `7956a48 Initial vocabulary bot` до `fae06b7 Improve daily word
controls and limits` додавали функції без стабільних module boundaries:
архівацію/відновлення, daily delivery, quotas, donation bonuses, admin grants,
daily cards і UI. Це швидко доставило продукт, але об'єднало webhook routing,
D1, Telegram/OpenAI I/O, presentation і policies в `worker.js`.

Висновок: для раннього продукту це допустимо, але новий сценарій збільшував
вартість читання, review і regression testing у спільній точці входу.

### 2. Спершу зафіксовано правила безпечного refactor

Перед серією extraction commits було додано ADR `0004`, architecture guide,
test matrix, delivery workflow та implementation status. Це важливо: правило
було не «розділити файл», а переносити лише стабільні, протестовані межі зі
збереженням callback formats, private-chat enforcement, owner-scoped SQL і
`.bind()`.

### 3. Перші module boundaries (3 серпня)

| Напрям | Представницькі commits | Що стало окремим власником |
| --- | --- | --- |
| Pure/shared | `a7d37a0` | messages, helpers, access notices |
| Daily words | `8b869da`, `ac2445c`, `ef8a352`, `c3958ce`, `5b16999` | settings, card generation, callbacks, manual/scheduled delivery |
| Vocabulary | `03216b1`, `b68d466`, `d00ef72` | card creation, sense callbacks, learned-word cleanup |
| Donations | `ac2445c`, `2a68705`, `1d73235`, `e67129d`, `4acedc2`, `9be332f` | Monobank adapter, requests, grants, notifications, expiration |
| Feedback/admin | `1f1decb`, `bd8da41`, `f34766d`, `cdad8e4` | one-message feedback flow, access operations, panel, commands |
| Callback edge | `ac8e5bd`, `5d15253`, `5eaf87b`, `4af6def`, `f8af15e` | namespace-specific callback handlers |

Кожен slice мав один власник і спрямовану залежність
`worker.js → features → domain/platform`, без generic repository, Express чи
класової ієрархії.

### 4. Структурна консолідація і остання миля

`0904dea Organize features and prepare multilingual directions` закріпив
feature-first folder layout і довів Worker до 1021 рядка. Після цього лишились
переважно navigation labels, static privacy HTML і text-command router.

Останні commits закрили саме ці межі:

- `34b7354` — stable `MENU_ACTION` та `src/content/uk/`;
- `203f885` — `handleNavigationMessage`, `shouldClearPendingFeedback` і
  privacy renderer;
- `21440b6` — vocabulary ingestion, `pending_words`, `/delete`, `/archive`,
  `/restore`, `/list` і `/learned` у `text-commands.js`.

## Вимірюваний підсумок історії

Від `7956a48` до `21440b6` Git зафіксував 99 змінених файлів,
5053 доданих і 524 видалених рядків. Це **не** означає, що refactor сам по
собі додав 4529 рядків: у діапазоні також були нові product features,
migrations, tests, release tooling і документація. Для refactor оцінювати
потрібно насамперед зменшення composition root, появу unit-testable owners та
збережені security/data invariants.

Поточний розподіл відповідальностей дає коротший review path:

```text
HTTP/webhook/scheduled edge → worker.js
use case + D1 ownership      → src/features/<area>
pure policies and formatting → src/domain
Telegram/OpenAI/Monobank I/O → src/platform
localized UI copy            → src/content/uk
```

## Що повторити в іншому проєкті

1. Не чекати 3000 рядків: після появи другого незалежного сценарію винести
   перший feature module разом із тестом.
2. Виносити за product responsibility, а не за технічним типом рядка.
3. Для Telegram/D1 спершу зафіксувати security invariants у tests, тоді
   переміщати код без зміни callback contract.
4. Малий commit має мати одну межу: `daily settings`, `donation grant` або
   `callback namespace`, а не «cleanup worker».
5. Закривати temporary duplication у тому самому slice; інакше router знову
   стає неоднозначним.
