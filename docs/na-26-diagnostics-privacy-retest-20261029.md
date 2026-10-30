# NA-26 — приватність діагностичних логів

29.10.2026. Виправлено локально за дозволом користувача. Деплой виконує користувач. Ручна перевірка DEFERRED до завершення всіх погоджених NA-корекцій.

## Зміни та межі

- Frontend `utils/api/apiClient.ts`: request_error більше не передає request/response body для жодного маршруту. Залишені Axios code, backend errorCode, HTTP status, method, URL та origin/meta, які проходять спільну проєкцію. CREDENTIAL_ROUTES і логіка refresh/recovery не змінювались; оригінальна помилка доходить до UI без змін.
- `logging/sanitizeDiagnostic.ts`: одна політика для eventLog, Crashlytics breadcrumbs/attributes, рекламної діагностики і DEV context audit. Рекурсивно прибирає тіла, credentials, приватний AI-контент; непрозорі рядки, free-form message та невідомі текстові поля замінюються на [omitted]. JSON-рядки проходять ту саму політику. Дозволені технічні рядкові поля — code/status/requestId/component/stage/placement тощо; числа й прапорці зберігаються поза приватними контейнерами. Нові технічні поля мають додаватися явно, без приватного вмісту.
- URL: прибираються host/query/fragment, URL credentials, encoded/небезпечні шляхи; лишається маршрут. Stack: лише координати рядка/колонки, без першого рядка повідомлення й шляху. Довільні getters/toJSON не викликаються; stack, доступний тільки через getter, може бути опущений. Цикли, надмірна вкладеність та великі діагностичні структури не блокують основну операцію. Це межі обробки логів, не таймаути запитів чи збереження.
- `eventLog`: очищення і копія до dedupe/черги; origin більше не дописується в об’єкт виклику. Retry та прив’язка користувача NA-15 збережені. Помилка /logs не включає текст HTTP-відповіді.
- Backend `src/logs/sanitizeDiagnostic.ts` містить ідентичну політику для незалежного деплою; SHA256 обох файлів звірено. При подальшій зміні тримати копії синхронними.
- `LogsService.ingestBatch` очищає також дані старих клієнтів перед DB insert. `createServerHttpFail` прибирає query, message/stack-текст, очищає meta/referer. Авторизація, маршрути й схеми таблиць незмінні; admin UI отримує ту саму структуру із позначками пропуску.
- DEV context audit тепер отримує очищений payload перед поділом на частини; backend повторно очищає зібраний payload перед записом у .tmp. Цей спеціальний транспорт залишається DEV-only і не зберігає journal/prompt тексти. Старі тести очікування повного контексту змінено відповідно. Raw-context debug тепер не є способом відновити текст приватного запиту.
- AI error reporter більше не надсилає в наявні alert-повідомлення вільний текст provider exception або meta payload; технічні коди причин і лічильники списання залишені. Transport у тестах замоканий, реальних повідомлень не надсилали.

Це не масове видалення логів і не зміна auth/AI/billing бізнес-поведінки. Свідомо втрачається діагностичний вільний текст: неможливо надійно відрізнити в ньому цитату із запису чи пароль від звичайного пояснення помилки.

**Старі записи DB/Crashlytics/.tmp не очищались, продакшен-логи на реальні секрети не читались.** Для вже накопичених даних потрібне окреме погоджене рішення. Не заявляється захист від довільного навмисного запису секрету під дозволеним технічним полем або аудит кожного прямого console/logger виклику всього бекенду.

## Автоматична перевірка

**123 унікальних тести / 14 suites PASS** за цільовими прогонами: frontend 73/9, backend 50/5.

Frontend:
- sanitizer: credential aliases, AI/payment routes, nested object/JSON/Axios bodies, malformed JSON, URL query/credentials, opaque strings, Error/cause/cycle/accessors/toJSON, bounded processing, snapshot/idempotence, ad metadata;
- apiClientPlanErrors: 5 privacy сценаріїв з незмінною rejected error identity + чинні plan/session/boot contracts;
- eventLogPrivacy, Ownership, Transport: очищення до queue, стабільний retry, незмінний caller, власник при зміні акаунта, release відхиляє DEV fragments;
- Crashlytics: приховані пароль/текст/вкладені помилки у breadcrumbs та attributes;
- global handlers, DEV context audit, advertisingDiagnostics регресії.

Backend:
- logs-privacy: insert старих object/JSON/console events через справжній LogsService із mock repository; server HTTP failures; Error/getter; ads codes;
- context-audit та logs.context-audit: очищення перед файлом, Unicode/chunk assembly/duplicate handling/production-off;
- ai-error-reporter: без provider echoes/meta secrets, cause codes, dedupe, AI_USAGE_WITHOUT_ANSWER counters;
- logs-read-access: 33 HTTP/JWT перевірки admin-read і сумісності ingestion.

Початковий запуск Jest був заблокований EPERM системного cache; використано cache у .tmp workspace. HTTP access suite спочатку мала EACCES sandbox localhost; повтор з дозволом на ізольованому mock-сервері PASS. Перевірка stack fixture спочатку виявила native getter замість value; policy навмисно не викликає getters, явний data-property stack та ідемпотентність перевірені окремо.

Backend TypeScript PASS. Frontend TypeScript — лише стара TS2739 у TodayHabitProgressSummary.tsx:17. Scoped ESLint: 0 errors після виправлення форматування/regex, 2 попередні warning у apiClient. Diff check PASS. Телефон/Metro/build/deploy/реальні дані не змінювалися.

## NA26.1 — коротка ручна перевірка

**29.10.2026 — DEV PASS для перевіреного потоку.** Користувач: неправильний старий пароль → зрозуміла помилка, форма не зависла. Read-only DB: спроба 23:54:52–54 Київ, POST /users/change-user-auth-data, 401 / INVALID_PASSWORD. Frontend logs 780826–780828: request_error без request/response body, console_error data/config.data приховані; паролі/hash відсутні. Server_http_logs 1099–1100: query лише {omitted:true}, errorMessage [omitted], meta технічна. Безпечний звіт .tmp/na26-current-log-result.json. У DEV critical Crashlytics breadcrumbs не зберігаються: frontend очищення до цього каналу перевірене кодом/попередніми автотестами, не окремим читанням цієї події з Crashlytics. Production frontend-build перевірка залишається в PROD-01.

**DEFERRED: DEV після всіх корекцій; поєднати з NA-05 перевіркою профілю/входу.**

1. У тестовому акаунті спробувати змінити пароль із завідомо неправильним старим і тестовим новим паролем, які ніде реально не використовуються.
2. Очікується звичайна зрозуміла помилка; акаунт і пароль не змінені, форма працює.
3. Асистент перевіряє діагностичну подію: є маршрут, status/code/requestId/origin; немає обох тестових паролів, hash, request/response body. У UI лишається початкове повідомлення помилки.
4. Перевірку звичайної AI-відповіді та медіа не дублювати: вона вже є в основних сценаріях. Негативні provider/JSON/cycle випадки покриті автоматично.

## Порядок оновлення

Спочатку можна задеплоїти бекенд: він уже захищатиме нові записи /logs від старих застосунків. Для очищення **до передачі**, а також Crashlytics/logcat потрібна нова збірка фронту. Нових env, залежностей і міграцій немає. Після деплою підтвердити отримання однієї технічної події у чинній адмінці; після frontend build повторити NA26.1 у спільному auth smoke, не створювати окремий великий набір тестів.
