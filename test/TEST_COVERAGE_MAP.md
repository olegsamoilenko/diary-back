# Мапа тестового покриття

Цей файл ведемо як живий список тестів: коли додаємо нові тести, одразу заносимо сюди, що саме вони покривають і як їх запускати.

## Backend: підписки та IAP

### `test/auth-endpoints.e2e-spec.ts`

Тип: e2e/API tests.

Покриває:

- реальний HTTP `POST /auth/login` прокидає credentials, device meta, `clientUa` і `clientIp` у `AuthService.login`;
- реальний HTTP `POST /auth/create-token` передає `uuid` і `hash` у `AuthService.createToken`.

### `src/auth/auth.service.spec.ts`

Тип: unit tests.

Покриває:

- `loginByUUID` повертає actual plan разом із user/settings/aiPreferences/tokens;
- `loginByUUID` викликає `PlansService.getActualByUserId` перед поверненням відповіді фронту;
- `loginByUUID` не issue-ить tokens, якщо user не знайдений;
- `loginByUUID` нормалізує відсутні user-agent/ip у `null` при створенні сесії.

### `src/plans/plans.service.spec.ts`

Тип: unit tests.

Покриває:

- створення нового платного плану через `PlansService.subscribePlan`;
- перемикання старого платного `actual=true` плану в `actual=false`, коли новий paid plan стає актуальним;
- захист від повторного створення start/trial plan для користувача, який уже має plan;
- логування `PAID_PLAN_CREATED`;
- warning-лог `PAID_PLAN_ACTUAL_SWITCH`;
- відсутність paid-plan логів для безкоштовного trial/start плану;
- оновлення існуючого плану за `purchaseToken`;
- скидання credits при новому billing/order cycle, коли `lastOrderId` змінився;
- відсутність скидання credits, коли `lastOrderId` не змінився;
- conflict `SUBSCRIPTION_ALREADY_LINKED`, коли активний `purchaseToken` вже належить іншому користувачу;
- `SUBSCRIPTION_ALREADY_LINKED` пробивається назовні як штатний conflict, а не маскується під generic `SUBSCRIPTION_ERROR`;
- warning `PAID_PLAN_CLAIMED_FROM_OTHER_USER`, коли expired/canceled paid token переноситься на іншого користувача;
- вимикання actual-планів старого користувача після дозволеного claim;
- `updatePlan`: логування `PAID_PLAN_UPDATED` і reset credits за опцією `resetUsedCredits`;
- `findExistingPlan`: пошук тільки actual plan за `purchaseToken`;
- `findExistingPlanForIap`: пошук plan за `purchaseToken` незалежно від `actual`;
- `getActualByUserId`: повернення поточного actual plan;
- race-condition по unique `purchaseToken`: при `23505` повертається вже створений plan того самого user;
- `changePlan`: warning `PAID_PLAN_MANUAL_CHANGE` для ручної зміни платного плану;
- `changePlan`: пошук target plan обмежений active user, щоб користувач не міг змінити чужий plan за id;
- `changePlan`: помилка, якщо цільовий plan не знайдено;
- `changePlanStatus`: warning `PAID_PLAN_STATUS_CHANGED`;
- `unsubscribePlan`: warning `PAID_PLAN_UNSUBSCRIBED`;
- `unsubscribePlan`: працює тільки з actual plan активного користувача;
- `unsubscribePlan`: помилка для вже canceled plan без повторного save/log;
- `deleteByUserId`: warning `PAID_PLAN_DELETED_BY_USER_ID` для видалених paid plans;
- `calculateCredits`: додавання розрахованих input/output credits до actual plan;
- `calculateCredits`: помилка, якщо actual plan не знайдено.

### `src/plans/plans.controller.spec.ts`

Тип: unit tests.

Покриває:

- `POST /plans/subscribe`: контролер передає `user.id` і DTO в `PlansService.subscribePlan`;
- `POST /plans/subscribe`: контролер дозволяє тільки start/trial plan і блокує paid plans без IAP verification;
- `POST /plans/unsubscribe`: контролер передає `user.id` в `PlansService.unsubscribePlan`;
- `GET /plans/get-actual`: контролер передає `user.id` в `PlansService.getActualByUserId`;
- `POST /plans/change-plan`: контролер передає `user.id` і DTO в `PlansService.changePlan`;
- `POST /plans/change-plan-status`: admin endpoint передає `id` і `planStatus` в `PlansService.changePlanStatus`.

### `src/ai/guards/plan.guard.spec.ts`

Тип: unit tests.

Покриває:

- HTTP-запит проходить для active paid plan, який не протермінований і не перевищив credits;
- HTTP-запит падає, якщо actual plan не знайдено;
- canceled plan дозволяє доступ до `expiryTime`;
- trial/start plan після `expiryTime` оновлюється в `EXPIRED` і тригерить socket event;
- paid plan оновлюється в `EXPIRED` тільки після триденного grace window;
- paid plan у межах триденного grace window ще пропускається;
- plan переходить у `CREDIT_EXCEEDED`, коли `usedCredits >= creditsLimit`.

### `src/users/users.service.spec.ts`

Тип: unit tests.

Покриває:

- `syncUser` логінить власника вже існуючого `purchaseToken`;
- `syncUser` не створює новий plan і не викликає `subscribePlan`;
- `syncUser` оновлює device/app settings, якщо settings уже існують;
- unknown `purchaseToken` дає `PLAN_NOT_FOUND` і не логінить користувача;
- новий `uniqueId` зберігається під час purchase-token sync.
- `createUserByUUID` створює trial/start plan через `subscribePlan` тільки на першій інсталяції, коли є `planData`;
- `createUserByUUID` не створює trial plan для returning install з уже відомим `uniqueId`;
- `createUserByUUID` не створює trial plan, якщо `planData` не передано;
- `createUserByUUID` відхиляє невалідний `devicePubKey` до створення user/plan.
- `me` повертає user, actual plan, settings і aiPreferences при валідному hash;
- `me` не читає actual plan, якщо hash невалідний;
- `me` не читає salt/plan, якщо uuid не знайдено.

### `src/users/users.controller.spec.ts`

Тип: unit tests.

Покриває:

- `create-by-uuid`: контролер передає geo country/ip/user-agent, device meta і `planData` у `UsersService.createUserByUUID`;
- `create-by-uuid`: fallback на `regionCode` з body, якщо geo country відсутній;
- `sync-by-purchase-token`: контролер передає `purchaseToken`, device meta, user-agent та ip у `UsersService.syncUser`;
- `get-one-by`: якщо сервіс не знаходить користувача, контролер кидає `USER_NOT_FOUND`.
- `getMe`: повертає `null`, якщо активного user немає;
- `getMe`: передає `uuid` і `hash` у `UsersService.me`.

### `test/users-subscription.e2e-spec.ts`

Тип: e2e/API tests.

Покриває:

- реальний HTTP `POST /users/create-by-uuid` прокидає `planData`, device meta, geo country, ip і user-agent у `UsersService.createUserByUUID`;
- реальний HTTP `POST /users/sync-by-purchase-token` прокидає `purchaseToken`, device meta, ip і user-agent у `UsersService.syncUser`;
- `BlockedCountriesGuard` блокує boot endpoint-и з 403 і не викликає subscription sync service;
- реальний HTTP `POST /users/me` з mocked JWT guard читає current user за `uuid` і `hash`, повертаючи actual plan дані з `UsersService.me`.

### `test/users-create-flow.e2e-spec.ts`

Тип: e2e/API integration test.

Покриває:

- реальний HTTP `POST /users/create-by-uuid` з real `UsersService` і real `PlansService`, але mocked repositories/auth/salt dependencies;
- перший install з новим `uniqueId` створює free trial/start plan;
- free trial plan створюється без paid-plan логів `INFO/WARNING/CONFLICT`;
- новий `uniqueId` зберігається при першому install;
- `AuthService.loginByUUID` викликається з `isFirstInstall=true`;
- returning install з уже відомим `uniqueId` не створює trial plan;
- returning install логіниться з `isFirstInstall=false`.

### `test/users-sync-flow.e2e-spec.ts`

Тип: e2e/API integration test.

Покриває:

- реальний HTTP `POST /users/sync-by-purchase-token` з real `UsersService`, але mocked repositories/plans/auth dependencies;
- sync за існуючим `purchaseToken` знаходить локальний plan через `PlansService.findExistingPlanForIap`;
- endpoint логінить owner user цього plan через `AuthService.loginByUUID`;
- sync не створює новий plan і не викликає `PlansService.subscribePlan`;
- новий `uniqueId` зберігається під час purchase-token sync;
- існуючі device/app settings оновлюються під час sync;
- unknown `purchaseToken` повертає 404 `PLAN_NOT_FOUND` і не створює plan/session.

### `test/iap-create-sub.e2e-spec.ts`

Тип: e2e/API tests.

Покриває:

- реальний HTTP `POST /iap/create-sub` для Android з mocked JWT guard прокидає active user id, `packageName` і `purchaseToken` у `IapService.createAndroidSub`;
- iOS payload не викликає Android subscription creation.

### `test/iap-create-sub-flow.e2e-spec.ts`

Тип: e2e/API integration test.

Покриває:

- реальний HTTP `POST /iap/create-sub` з real `IapService` і real `PlansService`, але mocked Google verification/DB/payment dependencies;
- сценарій, коли frontend присилає новий paid `purchaseToken`, а у користувача вже є active paid plan;
- warning `IAP_CREATE_SUB_REPLACES_ACTIVE_PAID_PLAN` після перевірки старого token через Google Play;
- створення нового paid plan через `PlansService.subscribePlan`;
- лог `PAID_PLAN_CREATED` для нового paid plan;
- warning `PAID_PLAN_ACTUAL_SWITCH`, коли старий paid plan стає `actual=false`;
- створення payment після успішного створення plan.

### `test/subscription-create.integration-spec.ts`

Тип: integration test.

Покриває:

- service-level flow `IapService.createAndroidSub` з real `IapService`, `PlansService`, `PaymentsService`, `PaidPlanEventsService`;
- mocked зовнішні межі: Google Play verification, TypeORM repository/transaction manager, Telegram transport;
- створення нового paid plan, коли frontend присилає новий `purchaseToken`;
- деактивацію старого actual paid plan через `actual=false`;
- створення payment через real `PaymentsService`;
- запис audit events через real `PaidPlanEventsService`;
- warning `IAP_CREATE_SUB_REPLACES_ACTIVE_PAID_PLAN`;
- info `PAID_PLAN_CREATED`;
- warning `PAID_PLAN_ACTUAL_SWITCH`;
- токени не зберігаються в audit event напряму, замість них записуються hash/suffix поля.

### `test/plans-endpoints.e2e-spec.ts`

Тип: e2e/API tests.

Покриває:

- реальний HTTP `POST /plans/subscribe` з mocked JWT guard створює start/trial plan для active user і передає весь DTO у `PlansService.subscribePlan`;
- реальний HTTP `POST /plans/subscribe` блокує paid plan creation без IAP verification з кодом `PAID_PLAN_REQUIRES_IAP_CREATE_SUB`;
- `POST /plans/unsubscribe` викликає `PlansService.unsubscribePlan` для active user;
- `GET /plans/get-actual` читає actual plan саме для active user;
- `POST /plans/change-plan` передає active user id і DTO у `PlansService.changePlan`;
- admin route `POST /plans/change-plan-status` з mocked `admin-jwt` guard передає plan id і новий статус у `PlansService.changePlanStatus`.

### `src/iap/iap.service.spec.ts`

Тип: unit tests.

Покриває:

- мапінг відповіді Google Play `subscriptionsv2.get` у локальні `planData` і `paymentData`;
- fallback невідомого Google subscription state у `PlanStatus.EXPIRED`;
- Pub/Sub подію з невідомим `purchaseToken`: silent ignore без paid-plan audit event/Telegram, без оновлення plan і без payment;
- Pub/Sub renewal для існуючого plan: оновлення plan, reset credits при новому `orderId`, socket emit і створення payment;
- Pub/Sub подію з тим самим `orderId`: plan оновлюється, але payment не створюється;
- Google verify failure для frontend `/iap/create-sub`: створюється conflict `IAP_CREATE_SUB_GOOGLE_VERIFY_FAILED`, plan не створюється;
- Google verify failure для Pub/Sub: створюється conflict `PUBSUB_GOOGLE_VERIFY_FAILED`, локальний plan не шукається і не оновлюється;
- `/iap/create-sub` з фронта, коли у користувача вже є активний paid plan у Google Play;
- warning `IAP_CREATE_SUB_REPLACES_ACTIVE_PAID_PLAN`;
- збереження старої поведінки після warning: flow не блокується, `subscribePlan` все одно викликається;
- помилка створення payment після frontend `/iap/create-sub`: створюється warning `IAP_CREATE_SUB_PAYMENT_CREATE_FAILED`, але створений plan повертається;
- помилка Google verify для старого actual paid plan: створюється conflict `IAP_CREATE_SUB_EXISTING_PLAN_GOOGLE_VERIFY_FAILED`, але новий frontend create-sub продовжується;
- відсутність warning `IAP_CREATE_SUB_REPLACES_ACTIVE_PAID_PLAN`, коли frontend create-sub приходить з тим самим token, що вже актуальний.
- conflict-и від `PlansService.subscribePlan`, наприклад `SUBSCRIPTION_ALREADY_LINKED`, не маскуються в generic `ERROR_PROCESSING_SUBSCRIPTION`.

### `src/iap/iap.controller.spec.ts`

Тип: unit tests.

Покриває:

- `POST /iap/create-sub` для Android: контролер передає `user.id`, `packageName` і `purchaseToken` в `IapService.createAndroidSub`;
- Pub/Sub повідомлення без `data`: повертається `ok`, сервіс не викликається;
- Pub/Sub `testNotification`: повертається `ok`, сервіс не викликається;
- валідна subscription notification: контролер викликає `IapService.pubSubAndroid` з package name, purchase token і notification type;
- malformed Pub/Sub payload: повертається `ok`, сервіс не викликається.

### `test/iap-pub-sub.e2e-spec.ts`

Тип: e2e/API tests.

Покриває:

- реальний HTTP `POST /iap/pub-sub` повертає `200 ok` для порожнього Pub/Sub message;
- `testNotification` від Google ігнорується без виклику `IapService.pubSubAndroid`;
- валідна subscription notification через HTTP route викликає `IapService.pubSubAndroid`;
- malformed Pub/Sub payload через HTTP route ігнорується без падіння endpoint-а.

### `test/iap-pub-sub-flow.e2e-spec.ts`

Тип: e2e/API integration test.

Покриває:

- реальний HTTP `POST /iap/pub-sub` з real `IapService` і real `PlansService`, але mocked Google verification/DB/payment dependencies;
- Google Pub/Sub renewal для існуючого paid plan за `purchaseToken`;
- оновлення локального plan через `PlansService.updatePlan`;
- reset `usedCredits`, `inputUsedCredits`, `outputUsedCredits` при новому `orderId`;
- лог `PAID_PLAN_UPDATED`;
- лог `PUBSUB_PLAN_UPDATED`;
- socket event `emitPlanStatusChanged` для користувача plan;
- створення payment і лог `PUBSUB_PAYMENT_CREATED` для нового billing cycle;
- unknown Google `purchaseToken` silent ignore: не створює локальний plan/payment і не пише paid-plan audit event/Telegram.

### `test/subscription-pubsub.integration-spec.ts`

Тип: integration test.

Покриває:

- service-level flow `IapService.pubSubAndroid` з real `IapService`, `PlansService`, `PaymentsService`, `PaidPlanEventsService`;
- mocked зовнішні межі: Google Play verification, TypeORM repository, Telegram transport;
- Google Pub/Sub renewal для існуючого paid plan;
- оновлення plan через real `PlansService.updatePlan`;
- reset `usedCredits`, `inputUsedCredits`, `outputUsedCredits` при новому `orderId`;
- socket event `emitPlanStatusChanged`;
- створення payment через real `PaymentsService`;
- audit events `PUBSUB_RECEIVED`, `PAID_PLAN_UPDATED`, `PUBSUB_PLAN_UPDATED`, `PUBSUB_PAYMENT_CREATED`;
- unknown Pub/Sub `purchaseToken` silent ignore: не створює plan/payment і не пише paid-plan audit event/Telegram.

### `src/iap/utils/rtdn.spec.ts`

Тип: unit tests.

Покриває:

- декодування валідного base64 JSON RTDN payload;
- `null` для malformed base64/JSON payload;
- визначення payload з `subscriptionNotification`;
- false для payload без `subscriptionNotification`.

### `src/paid-plan-events/paid-plan-events.service.spec.ts`

Тип: unit tests.

Покриває:

- `INFO` paid-plan event записується в БД без Telegram-сповіщення;
- `WARNING` paid-plan event записується в БД і відправляє Telegram-сповіщення;
- `CONFLICT` paid-plan event записується в БД і відправляє Telegram-сповіщення;
- `purchaseToken` і `linkedPurchaseToken` не зберігаються напряму в event payload, замість них перевіряються hash/suffix поля;
- помилка запису event у БД не пробивається назовні і не відправляє Telegram;
- помилка Telegram-сповіщення після успішного запису event не пробивається назовні.

### `src/telegram/send-telegram.spec.ts`

Тип: unit tests.

Покриває:

- відправку paid-plan alert через окремий `TELEGRAM_PLANS_*` бот, коли він налаштований;
- fallback на `TELEGRAM_ALERT_*`, коли `TELEGRAM_PLANS_*` не налаштований;
- fallback на `TELEGRAM_ALERT_*`, коли запит у plans bot впав;
- `console.warn` і пропуск відправки, коли не налаштований ні plans bot, ні alert bot.

### `src/payments/payments.service.spec.ts`

Тип: unit tests.

Покриває:

- dedupe: якщо `orderId` вже існує, повертається існуючий payment і новий не створюється;
- створення нового payment, коли `orderId` не знайдено;
- race-condition по unique `orderId`: при `23505` сервіс повторно читає payment і повертає існуючий запис;
- non-unique DB помилки пробиваються назовні;
- payment без `orderId` не проходить dedupe lookup і створюється напряму.

## Команди запуску

Запуск поточних backend unit-тестів для paid plans/IAP/Telegram/Payments/PlanGuard:

```bash
npm test -- --runTestsByPath src/auth/auth.service.spec.ts src/users/users.controller.spec.ts src/users/users.service.spec.ts src/ai/guards/plan.guard.spec.ts src/plans/plans.service.spec.ts src/plans/plans.controller.spec.ts src/iap/iap.service.spec.ts src/iap/iap.controller.spec.ts src/iap/utils/rtdn.spec.ts src/paid-plan-events/paid-plan-events.service.spec.ts src/telegram/send-telegram.spec.ts src/payments/payments.service.spec.ts --runInBand
```

Перевірка TypeScript:

```bash
npm run typecheck
```

Запуск e2e/API тесту для Google Pub/Sub endpoint:

```bash
npm run test:e2e -- --runTestsByPath test/iap-pub-sub.e2e-spec.ts --runInBand
```

Запуск поточних e2e/API тестів для subscription boot endpoints:

```bash
npm run test:e2e -- --runTestsByPath test/auth-endpoints.e2e-spec.ts test/iap-pub-sub.e2e-spec.ts test/iap-pub-sub-flow.e2e-spec.ts test/users-subscription.e2e-spec.ts test/users-create-flow.e2e-spec.ts test/users-sync-flow.e2e-spec.ts test/iap-create-sub.e2e-spec.ts test/iap-create-sub-flow.e2e-spec.ts test/plans-endpoints.e2e-spec.ts --runInBand
```

Запуск поточних integration тестів для plans/subscriptions:

```bash
npm run test:integration -- --runTestsByPath test/subscription-create.integration-spec.ts test/subscription-pubsub.integration-spec.ts --runInBand
```
