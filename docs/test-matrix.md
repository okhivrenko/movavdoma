# MovaYakVDoma — test matrix

This matrix is the regression contract for product requirements. A row is
**covered** only when its named automated test exists and runs in `npm test`.
Rows marked **next** are intentional, visible gaps; they must be implemented
before a refactor changes that feature.

| Area | Requirement | Automated contract | Status |
| --- | --- | --- | --- |
| Webhook | Privacy page is public; webhook rejects a missing/wrong secret | `worker-http.test.js` | covered |
| Webhook | Duplicate Telegram updates cause no second side effect | `worker-http.test.js` | covered |
| Webhook | Group chats are ignored | `worker-http.test.js` | covered |
| Onboarding | `/start` persists the user and shows their saved time and CEFR level | `worker-http.test.js` | covered |
| Menu | First page has add/list, daily/learned, schedule and help/next | `worker-http.test.js` | covered |
| Input | Plain word; `/`, `|`, and `\\` context separators work | `helpers.test.js` | covered |
| Word card | One selected sense and exactly two examples are saved | Worker integration contract | next |
| Word quota | Addition quota is claimed before OpenAI and blocks at the limit | Worker+D1 contract | next |
| Active words | Users see only their own active words, ten per page | `word-list.test.js` + ownership contract | partial |
| Active words | Examples and learned controls are two blocks of five; paging works | `word-list.test.js` | covered |
| Learned words | Restore buttons/page work; cleanup removes only learned words after 30 days | Worker+D1 + scheduled contract | next |
| Daily settings | Time and level are selected in separate steps; reminder can be toggled | `worker-http.test.js`, `daily-settings.test.js` | covered |
| Daily words | Pending card is reused; `know` discards; `learn` saves it | Worker+D1 contract | next |
| Daily quota | New daily-card limits are 5/10/15/20 by effective access level | `policies.test.js` + Worker+D1 contract | partial |
| Access | Access values are normalized and donation tiers map correctly | `policies.test.js` | covered |
| Admin | Non-admins cannot run admin callbacks or commands | Worker authorization contract | next |
| Admin | User list is paginated at 50 and does not leak cross-user data | Worker+D1 contract | next |
| Donation | Code is stable per open request; matching is idempotent | Worker+D1 contract | next |
| Donation | Grant expires in one month and sends one feedback invitation | scheduled Worker+D1 contract | next |
| Feedback | Only the next plain-text feedback message is forwarded, then cleared | Worker+D1 contract | next |
| Scheduler | Per-local-date delivery is idempotent and respects time/disable state | scheduled Worker+D1 contract | next |

## Test rule for future work

Before changing any row, first add or update its automated contract. Network
clients are mocked; no test may use a real Telegram, OpenAI, Monobank, or D1
credential. When a feature needs D1 semantics, use a local test database or a
purpose-built in-memory adapter rather than production data.
