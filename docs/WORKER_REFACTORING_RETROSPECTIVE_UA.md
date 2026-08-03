# Ретроспектива: декомпозиція `worker.js`

Дата: 3 серпня 2026. Коміти: `203f885`, `21440b6`.

## Результат

`worker.js` зменшено з 1000 до 477 рядків (−523, або 52%). Він лишився
Cloudflare composition root: публічний HTTP route, webhook authentication,
ідемпотентність `processed_updates`, private-chat gate, створення залежностей
і виклики message/callback/scheduled сценаріїв.

Винесено або фактично підключено такі межі:

| Відповідальність | Власник |
| --- | --- |
| Reply keyboard, legacy Ukrainian labels, menu actions і feedback cancellation | `src/features/navigation/navigation.js` |
| Рендеринг HTML policy та її український зміст | `src/platform/privacy-policy.js`, `src/content/uk/privacy-policy.js` |
| Додавання слова, quota claim, selection значення, `pending_words` | `src/features/vocabulary/text-commands.js` |
| `/delete`, `/archive`, `/restore`, `/list`, `/learned` | `src/features/vocabulary/text-commands.js` |
| Vocabulary UI copy | `src/content/uk/vocabulary.js` |

Не змінювалися callback formats, D1 schema, quota policy, privacy headers,
private-chat restriction, ownership predicates або parameterized `.bind()`
queries. Новий модуль text commands отримує всі I/O та policy залежності
явно; це робить його unit-testable без Worker runtime.

## Перевірка і реліз

- 51 Node tests пройшов;
- `npm run check` пройшов: syntax, tests, migration check і Worker dry-run;
- `git diff --check` пройшов;
- production D1 journal: `No migrations to apply`;
- зміни запушено в `main` і Worker задеплоєно; public health endpoint відповів
  HTTP 200.

Локальний `.gitignore` був користувацькою зміною і не входив до комітів.

## Витрати токенів: що відомо

Платформа не надала точного лічильника input/output tokens для цієї сесії:
`get_goal` повернув `goal: null` і не містив budget report. Тому точне число
не можна чесно вивести з Git diff або часу виконання.

Якісна оцінка: витрата була **вищою за потрібну** для такого refactor. Основні
джерела — повторне читання великих фрагментів `worker.js`, надто великі
виводи команд і кілька циклів виправлення patch-контексту. Кодова робота
була відносно малою: за двома комітами +242/−600 рядків у 9 файлах, з них
найбільша частина — видалення дубльованої логіки.

## Як зробити аналогічний refactor значно економнішим

1. Перед редагуванням побудувати коротку карту router-а: `rg -n` для routes,
   commands і callback namespaces, а не друкувати весь entry file.
2. Взяти готові feature modules як контракт. Тут navigation і privacy вже
   існували; одразу підключити їх одним малим patch-ом і покрити одним
   composition test.
3. Для кожного наступного slice спочатку створити feature handler і focused
   tests, потім замінити **один суцільний блок** у router-і. Не залишати
   перехідних дублікатів.
4. Передавати dependency object лише на межі feature. Не повторювати policy,
   parser або UI copy у `worker.js`.
5. Запускати вузькі тести після кожного patch-а, а `npm run check` лише після
   завершеного slice. Це швидше знаходить regression і зменшує повторний
   контекст.
6. Зберігати потрібні уривки в робочому контексті або використовувати точні
   `sed -n` діапазони; не перезчитувати файл на сотні рядків.
7. Вести простий реєстр slice-ів: owner, invariants, tests, source range.
   Для цього проєкту він міг би бути таким:

```text
navigation     labels → MENU_ACTION; feedback cancellation; worker.test
privacy        GET /privacy + headers; render unit/worker test
vocabulary add quota before OpenAI; pending_words; feature tests
archive        owner-scoped commands; LIST_LIMIT; feature tests
```

## Мінімальний token-efficient playbook для нового схожого проєкту

1. Прочитати тільки `AGENTS.md`, architecture, product context, router,
   matching feature і matching tests.
2. Зафіксувати baseline одним `npm run check`.
3. Створити `src/features/<area>/text-commands.js` з explicit dependencies
   та `*.test.js`.
4. Написати 3–5 boundary tests: authorization/owner, malformed input, quota,
   success, legacy compatibility.
5. Одним patch-ом замінити старий router block на виклик handler-а.
6. Запустити focused tests, потім `npm run check`, `git diff --check`.
7. Commit, push і deploy лише якщо routing або runtime behavior змінилися.

Цей порядок мінімізує і токени, і ризик: він тримає обсяг контексту малим,
не створює тимчасового паралельного коду та забезпечує перевірку саме на межі,
де найімовірніший regression.
