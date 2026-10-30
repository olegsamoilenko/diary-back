# NA-64 — запізнілий результат серверного нагадування

29.10.2026: виправлено локально; користувач деплоїть сам. Поточні локальні нагадування телефона не змінювались. Старі серверні маршрути та формати відповідей збережені.

## Зміна

`src/push-notifications/user-reminders.service.ts`: claim повертає `xmin::text` разом із нагадуванням. Обидва завершення (sent та pending/failed після невдалої спроби) виконують один атомарний UPDATE лише для того самого id, status=processing та незмінної версії рядка. Нуль оновлених рядків означає, що інша дія вже змінила нагадування; старий результат відкидається.

Використано наявний у бекенді підхід порівняння PostgreSQL row revision, як у `subscriptions/google-play-snapshot.ts`. Версія зберігається лише в пам'яті однієї спроби, не є довготривалим порядковим номером. Нових таблиць, полів, міграцій, env або залежностей немає. JS Date не використовується як ідентифікатор спроби, щоб не втрачати точність timestamp.

Скасування через cancel або extraction updates, перенесення дати, передача на телефон із видаленням серверної копії та повторне захоплення простроченої спроби не перезаписуються старим worker. Чинні retry exhaustion, batch size, cron і timeout відновлення processing не змінювались.

Обмеження: push, уже переданий провайдеру, відкликати неможливо. Це захист стану черги від запізнілого запису, не гарантія exactly-once доставки. Для ефекту виправлення всі серверні процеси, які запускають цей cron, мають використовувати оновлений код.

## Автоматичні перевірки — PASS

**32 тести / 3 suites**, зокрема **11 на справжньому локальному PostgreSQL**:

TypeScript (`tsc --noEmit`), scoped ESLint і `git diff --check` — PASS.

- `user-reminders-postgres.spec.ts`: справжні service/repository/claim/finalization SQL, два незалежні DataSource. Скасування під час push → failure/success; перенесення → failure/success; cancellation extraction; transfer deletion; нова processing-спроба після застарілого lock → старий failure/success; звичайний retry→sent; вичерпання чинних повторів; відновлення після batch exception.
- `user-reminders.service.spec.ts`: 6 сумісних сценаріїв ownership transfer/history, extraction reset, локально заплановане без дубля push, один batch для кількох отримувачів, порожній PostgreSQL tuple.
- `push-notifications.service.spec.ts`: 15 чинних push/token регресій.

Інтеграційні тести використовували випадкову схему `na64_*` у maintenance DB `postgres` локального Docker; схему видалено після завершення. Дані застосунку/реальні токени не читались, push замоканий, реальних сповіщень не надсилалось. Початкові помилки типів тестової схеми виправлено до наведеного успішного прогону.

Запуск:

```powershell
node node_modules/jest/bin/jest.js src/push-notifications/user-reminders.service.spec.ts src/push-notifications/push-notifications.service.spec.ts --runInBand --cacheDirectory .tmp/jest-na64
$env:NA64_POSTGRES_CONTAINER='nemory-postgres'
node node_modules/jest/bin/jest.js src/push-notifications/user-reminders-postgres.spec.ts --runInBand --cacheDirectory .tmp/jest-na64
```

## Після деплою — NA64.1 / DEFERRED

Поєднати зі звичайною перевіркою backend deploy після всіх корекцій: сервіс стартує, наступний запуск reminder cron не дає SQL-помилок щодо claimRevision/xmin. Не змінювати реальні нагадування для створення гонки.

Окремий ручний телефонний сценарій на поточному фронті не потрібен: він використовує локальні нагадування й не перевірить цю серверну гонку. Її відтворення вже автоматизоване на PostgreSQL. Якщо в плані сумісності вже є стара тестова версія клієнта, її звичайне створення/скасування серверного нагадування можна зарахувати тут без нового дубльованого циклу. USER PASS / production verification поки немає. Перебілд фронту не потрібний.
