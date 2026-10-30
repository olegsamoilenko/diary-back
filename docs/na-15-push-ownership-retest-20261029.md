# NA-15 — власник push-токена

Статус: виправлено локально; ручні сценарії DEFERRED до завершення NA-корекцій. Немає USER PASS або production verification. Деплой виконує користувач.

## Поведінка

- Реєстрація токена атомарно деактивує його попередніх власників. Блокування PostgreSQL працює між процесами сервера, зокрема коли рядка ще немає. Інші пристрої акаунта зберігаються.
- Новий фронт підписує операції чинним Ed25519-ключем пристрою. Реєстрація перевіряє JWT-власника та ключ у його user_sessions. Сервер зберігає останню ревізію операції: старі register/revoke не перезаписують нову прив’язку; точний повтор ідемпотентний.
- Вихід/заміна сесії спочатку записує підписане відкликання в SecureStore, без очікування мережі. Старі access/refresh-токени для повтору не зберігаються. Підписане відкликання може лише вимкнути push власного пристрою; воно працює і після видалення auth-сесії, якщо сервер уже знає цей ключ.
- Якщо перша реєстрація не дійшла і сесію вже видалено, коректно підписане відкликання невідомого ключа є no-op: чужі токени не змінюються, нова прив’язка не створюється. Це не блокує чергу нового входу.
- Повтор на старті, поверненні застосунку, відновленні інтернету та localSessionReady. Фоновий шлях не показує дозвіл: реєструє лише за вже наданого системного дозволу. Чинні явні запрошення спільноти/планера/onboarding збережені.
- Локальні нагадування не змінювались. Вже переданий Expo/Android push відкликати неможливо. При offline-виході сервер дізнається про вихід лише після доставки відкладеного запиту, коли застосунок знову виконується з інтернетом.
- Старий контракт push-token збережено: попередні клієнти отримують атомарне перев’язування. Повний захист запізнілих запитів і offline-виходу потребує нового фронту; старий клієнт сам не надсилає revoke.

## Файли / розгортання

Бек: push-token-ownership.ts, PushDeviceState, поле UserPushToken.deviceKeyHash, DTO/controller/service/module, міграція AddPushDeviceOwnership1793280000000. Окремий курсор потрібен для відмови запізнілому register після logout навіть до створення token-рядка; publicKey зберігається для revoke після видалення user_sessions. Нового приватного ключа або таблиці акаунтів немає.

Міграція деактивує всі історично неоднозначні active token (кілька user_id), не вгадує власника за updatedAt. Наступна автентифікована реєстрація встановлює власника. Звичайні токени не чіпає.

Спочатку backend deploy з міграцією, потім новий frontend build. Чинний .github/workflows/deploy.yml вже виконує migration:run перед restart. Нових env і залежностей немає. Не запускати новий фронт проти старого бека: старий бек не має підписаного revoke endpoint.

Фронт: notifications/pushTokenOwnership.ts, usePushTokenOwnership.ts в AppContent, ensureAppPushNotificationsEnabled, savePushTokenApi, спільні saveAuthenticatedSession/clearSessionTokens. Відкладена операція зберігається в installation SecureStore, а не у backup/vault акаунта. Мережеві операції мають timeout 60с; вихід на нього не чекає.

## Автоматичні перевірки

**81 тест / 9 suites PASS: 29 backend (13 real PostgreSQL), 52 frontend.** Backend tsc PASS; frontend tsc має лише вже відому TodayHabitProgressSummary.tsx:17 TS2739. Scoped ESLint і git diff --check PASS. Початкові проблеми тестових fixtures (тип union, старі mocks auth/vault, форматування) виправлено до остаточних успішних прогонів. Перевірено також збереження legacy-коду помилки PUSH_TOKEN_IS_EMPTY.

- PostgreSQL: тимчасова випадкова схема na15_* локального Docker, два DataSource; A→B, другий пристрій, паралельні register, revoke перед першим register, пізній revoke, replay, forged signature/key/JWT user, token tampering, token rotation, legacy contract, міграція історичних дублів. Реальні push не надсилались, дані застосунку не читались.
- Фронт: збереження до dispatch; справжні Ed25519-підписи; offline/restart; запізнілий ack; interrupted account switch; logout без очікування мережі; відмова SecureStore; permission/session/dispatch races; reconnect та unmount.
- Суміжні регресії: refreshSession, registrationSession, switchAccountVault, чинні push service tests.

Команди PostgreSQL (локальна maintenance DB, без .env застосунку):

```powershell
$env:NA15_POSTGRES_CONTAINER='nemory-postgres'
node node_modules/jest/bin/jest.js src/push-notifications/push-token-ownership-postgres.spec.ts --runInBand --cacheDirectory .tmp/jest-na15
```

Frontend suites: notifications/{pushTokenOwnership,ensurePushOwnership,usePushTokenOwnership}.test.js, utils/api/refreshSession.test.js, utils/account/switchAccountVault.test.js, store/thunks/auth/registrationSession.test.js. Backend додатково push-notifications.service.spec.ts і push-token-contract.spec.ts. Нових ручних тестів на відмови диска/підписи/перестановку HTTP не потрібно.

## Ручні — тільки після всіх корекцій

30.10.2026 — DEV-05 PARTIAL: користувач підтвердив зміну акаунта; read-only звірка за зафіксованою установкою та пов’язаними токенами показала одну активну прив’язку нового акаунта, старий неактивний. Evidence: .tmp/na15-after-switch-result.json (без токенів). Перенесення власника перевірено; доставку push та NA15.2 ще не зараховано.

### NA15.1 — DEFERRED / DEV, потім нова збірка

Поєднати з NA05/NA38 перевіркою зміни акаунта. На одному встановленні з дозволеними сповіщеннями увійти в тестовий A, потім вийти й увійти в B. Дочекатися успішної реєстрації push. Серверна перевірка без виведення токенів: для цього токена активний лише B. Звичайний push спільноти для B доходить; push для A на цей телефон не надсилається. Якщо вже є другий тестовий пристрій A — він залишається активним; спеціально новий пристрій не потрібен. Локальне нагадування планера не є перевіркою серверного push.

### NA15.2 — DEFERRED / нова PROD-збірка (PROD-01)

30.10.2026 користувач переніс сценарій на PROD: DEV після офлайн-виходу не завантажує JS із Metro (`Unable to load script`). На DEV не повторювати; перевірка queued revoke цим не завершена.

Поєднати з офлайн-перевіркою auth у PROD-01: A із зареєстрованим push → вимкнути інтернет → вийти → перезапустити застосунок → повернути інтернет й залишити його відкритим без входу. Після обробки queued revoke старої active-прив’язки A немає. Увійти в B: B отримує звичайний серверний push, повтор старого revoke його не відв’язує. Окремо імітувати гонки вручну не треба — вони автоматизовані. Потрібна нова збірка із чергою відкликання.
