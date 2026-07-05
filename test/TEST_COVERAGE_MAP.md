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
- plan переходить у `CREDIT_EXCEEDED`, коли `usedCredits >= creditsLimit`;
- `V2` користувач проходить через `user_plan_states` без читання legacy `plans`;
- `LEGACY_COMPAT` користувач без legacy actual plan, але з існуючим `user_plan_state`, проходить через V2 fallback замість `PLAN_NOT_FOUND`;
- `V2` користувач з `accessStatus = LIMITED` блокується через відповідний subscription error.

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
- валідна subscription notification: контролер викликає legacy `IapService.pubSubAndroid` і новий `SubscriptionsService.handleGooglePlayPubSub` з package name, purchase token і notification type;
- помилка нового subscriptions Pub/Sub handler після успішного legacy handler не ламає відповідь Google Pub/Sub;
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

### `src/subscriptions/subscription-legacy.mapper.spec.ts`

Тип: unit tests.

Покриває:

- мапінг старого trial/start plan у новий `user_plan_state`;
- lazy-status кейс: trial може мати старий `ACTIVE`, але якщо `expiryTime` вже минув, новий `accessStatus` стає `LIMITED`, а `metadata.accessReason = TRIAL_EXPIRED`;
- trial з вичерпаними кредитами мапиться у `accessStatus = LIMITED`, `metadata.accessReason = CREDIT_EXCEEDED`, а `billingStatus` лишається `NONE`;
- paid plan зі старим `CREDIT_EXCEEDED` і ще дійсним періодом мапиться як `billingStatus = ACTIVE`, `accessStatus = LIMITED`, `metadata.accessReason = CREDIT_EXCEEDED`;
- paid plan зі старим `ACTIVE`, але вже минулим `expiryTime`, мапиться як `billingStatus = EXPIRED`, `accessStatus = LIMITED`, `metadata.accessReason = SUBSCRIPTION_EXPIRED`;
- canceled paid plan з майбутнім `expiryTime` мапиться як `billingStatus = CANCELED`, `accessStatus = ACTIVE`, `metadata.accessReason = NONE`;
- canceled paid plan після `expiryTime` лишає `billingStatus = CANCELED`, але отримує `accessStatus = LIMITED`, `metadata.accessReason = SUBSCRIPTION_CANCELED`;
- `user_plan_state` draft переносить `name`, `price`, `currency`, `startTime`, `expiryTime`;
- user без вибраного plan мапиться як `source = NONE`, `name = None`, `useWithoutSubscription = true`, `accessStatus = LIMITED`;
- dry-run перевіряє paid `purchaseToken` через Google Play і вибирає Google-active plan навіть якщо legacy `actual=false`;
- якщо Google token plan не активний, dry-run бере legacy `actual=true`;
- `store_subscriptions` draft створюється тільки для paid plan з `purchaseToken`;
- dry-run міграції додає warning-и `SELECTED_GOOGLE_ACTIVE_NON_ACTUAL_PLAN` та `NO_ACTUAL_BUT_ACTIVE_PAID_PLAN_EXISTS`, коли Google-active paid plan був legacy `actual=false`;
- batch preview dedupe-ить повторні `userId`, щоб не робити зайві запити;
- all-users preview проходить users чанками без ручного введення user ids.

Запуск:

```bash
npm test -- --runTestsByPath src/subscriptions/subscription-legacy.mapper.spec.ts --runInBand
```

### `src/subscriptions/subscriptions.controller.spec.ts`

Тип: unit tests.

Покриває:

- user endpoint `GET /subscriptions/me` прокидає активного користувача в новий `SubscriptionsService`;
- user endpoint `POST /subscriptions/ensure-initial-state` повертає існуючий `user_plan_state` або створює стартовий trial;
- user endpoint `POST /subscriptions/trial/start` прокидає активного користувача в новий trial flow;
- user endpoint `POST /subscriptions/use-without-subscription` прокидає активного користувача в новий limited/no-plan flow;
- user endpoint `POST /subscriptions/google-play/subscribe` прокидає активного користувача та Google Play payload у новий paid subscription flow;
- `POST /subscriptions/google-play/subscribe` DTO зберігає `packageName` і `purchaseToken` після глобального `ValidationPipe` з `whitelist: true`;
- admin dry-run endpoint `GET /subscriptions/migration/preview` запускає preview для всіх users з нормалізованим `chunkSize`;
- admin migration endpoint `POST /subscriptions/migration/run` запускає запис міграції для всіх users з default `chunkSize`;
- некоректний `chunkSize` відхиляється до виклику service.

Запуск:

```bash
npm test -- --runTestsByPath src/subscriptions/subscriptions.controller.spec.ts --runInBand
```

### `src/subscriptions/subscriptions.service.spec.ts`

Тип: unit tests.

Покриває:

- читання поточного нового subscription state користувача з `user_plan_states`;
- підвантаження relation `currentStoreSubscription`;
- повернення `subscription: null`, якщо користувача ще не перенесено в нову схему.
- idempotent ensure initial state: повертає існуючий `user_plan_state` без створення trial;
- ensure initial state створює стартовий trial, якщо `user_plan_state` ще відсутній;
- старт нового trial через `user_plan_states` без legacy `plans`;
- перетворення існуючого `NONE` state без trial history у trial;
- заборону повторного trial, якщо користувач вже має subscription history або `metadata.trialUsed = true`.
- переведення існуючого subscription state у `accessStatus = LIMITED`, `metadata.accessReason = USE_WITHOUT_SUBSCRIPTION`, без зміни `store_subscriptions`;
- помилку для `use-without-subscription`, якщо `user_plan_state` ще не ініціалізовано через ensure initial state;
- створення/оновлення paid Google Play підписки через `store_subscriptions` та `user_plan_states` без legacy `plans`;
- reset credits при новому paid token/order cycle;
- заборону прив'язки активного Google Play token, якщо він вже належить іншому користувачу.
- silent ignore для Pub/Sub token, якого ще немає в `store_subscriptions`, без Google verify і без paid-plan event;
- оновлення `store_subscriptions` та `user_plan_states` з Google Pub/Sub, включно з reset credits, `useWithoutSubscription = false` і `metadata.accessReason = NONE` для активного доступу.
- Google Pub/Sub `CANCELED` лишає доступ `ACTIVE` до `expiryTime`, а наступний Google `EXPIRED` переводить `billingStatus = EXPIRED`, `accessStatus = LIMITED`, `metadata.accessReason = SUBSCRIPTION_EXPIRED`;
- effective access refresh переводить `CANCELED` paid підписку після `expiryTime` у `accessStatus = LIMITED` та `metadata.accessReason = SUBSCRIPTION_CANCELED`;
- нові subscription-flow (`ensureInitialState`, `trial/start`, `use-without-subscription`, `google-play/subscribe`) переводять користувача в `subscriptionRuntime = V2`.

Запуск:

```bash
npm test -- --runTestsByPath src/subscriptions/subscriptions.service.spec.ts --runInBand
```

### `src/subscriptions/migration/subscriptions-migration.service.spec.ts`

Тип: unit tests.

Покриває:

- write-міграцію всіх users чанками;
- перевірку paid token через Google Play перед вибором current paid plan;
- upsert `store_subscriptions` для paid plan з `purchaseToken`;
- upsert `user_plan_states`;
- прив'язку `user_plan_state.currentStoreSubscriptionId` до вибраного `store_subscription`;
- warning-и для кейсу, коли активний paid plan існує, але старий `actual=false`.

Запуск:

```bash
npm test -- --runTestsByPath src/subscriptions/migration/subscriptions-migration.service.spec.ts --runInBand
```

### `src/subscriptions/subscription-usage.service.spec.ts`

Тип: unit tests.

Покриває:

- списання AI credits для `LEGACY_COMPAT`: стара таблиця `plans` лишається source of truth, а збережений legacy plan синкається в `user_plan_states`;
- списання AI credits для `LEGACY_COMPAT` користувача без legacy actual plan, але з `user_plan_state`, переходить у V2 fallback і не падає з `PLAN_NOT_FOUND`;
- списання AI credits для `V2`: legacy `plans` не викликається, оновлюється тільки `user_plan_states`;
- V2 usage не списує credits, якщо effective access refresh уже перевів canceled підписку в `LIMITED` після завершення оплаченого періоду;
- переведення `accessStatus` у `LIMITED` та `metadata.accessReason = CREDIT_EXCEEDED`, коли після списання досягнуто `creditsLimit`.

Запуск:

```bash
npm test -- --runTestsByPath src/subscriptions/subscription-usage.service.spec.ts --runInBand
```

### Додаткове покриття стабілізації планів і підписок

Тип: unit tests.

Покриває:

- `src/plans/plans.service.spec.ts`: `changePlan` синкає `null` у `user_plan_states`, коли після manual change не залишається actual legacy plan.
- `src/users/users.service.spec.ts`: `updateByIdAndUuid` блокує пряму зміну subscription-sensitive полів (`usesWithoutSubscription`, `subscriptionRuntime`, `plans`).
- `src/forum-access/forum-access.service.spec.ts`: forum access читає `user_plan_states`; active Google Play state дає unlimited access, а `NONE`/`useWithoutSubscription`/`LIMITED` обмежує доступ.
- `src/inactivity-cleanup/inactivity-cleanup.cron.service.spec.ts`: inactivity cleanup визначає subscribed/not subscribed за `user_plan_states`, враховуючи active paid state, trial/no-plan/use-without-subscription і expired paid state.
- `src/user-statistics/user-statistics.service.spec.ts`: `getUserCount` рахує paid users за `user_plan_states`, а не за legacy `plans.actual/planStatus`; active paid billing statuses: `ACTIVE`, `IN_GRACE`, `CANCELED`.

Запуск:

```bash
npm test -- --runTestsByPath src/plans/plans.service.spec.ts src/users/users.service.spec.ts src/forum-access/forum-access.service.spec.ts src/inactivity-cleanup/inactivity-cleanup.cron.service.spec.ts src/user-statistics/user-statistics.service.spec.ts src/subscriptions/subscriptions.service.spec.ts src/ai/guards/plan.guard.spec.ts --runInBand
```

Оновлено також покриття:

- `src/subscriptions/subscriptions.controller.spec.ts`: user endpoint `POST /subscriptions/bootstrap` прокидає активного користувача та payload у `SubscriptionsService.bootstrap`;
- `src/subscriptions/subscriptions.service.spec.ts`: bootstrap для користувача з `V2` є idempotent і тільки повертає поточний state; bootstrap для `LEGACY_COMPAT` синкає legacy plan у `user_plan_states` та переводить `subscriptionRuntime` у `V2`.
- `src/subscriptions/subscriptions.service.spec.ts`: `ensureInitialState` для першого install створює trial, а для returning install (`isFirstInstall=false`) створює no-plan state з `source=NONE`, `billingStatus=NONE`, `accessStatus=LIMITED`, `useWithoutSubscription=false` і `metadata.accessReason=PLAN_SELECTION_REQUIRED`.
- `src/subscriptions/subscriptions.controller.spec.ts`: `POST /subscriptions/ensure-initial-state` прокидає DTO з `isFirstInstall` у `SubscriptionsService.ensureInitialState`.
- `src/ai/guards/plan.guard.spec.ts`: для користувача з `subscriptionRuntime = V2` guard читає `user_plan_states`, не звертається до legacy `plans`, дозволяє `ACTIVE` доступ і блокує `LIMITED/CREDIT_EXCEEDED`.
- `src/plans/plans.service.spec.ts`: legacy `subscribePlan` для paid і trial після створення/оновлення actual plan синкає його в нову subscription-схему; legacy `updatePlan`, `updatePlanFromGooglePubSub`, `changePlanStatus` і `unsubscribePlan` синкають актуальний plan у `user_plan_states/store_subscriptions`.
- `src/users/users.service.spec.ts`: legacy `users/update` з `usesWithoutSubscription = true` синкає поточний legacy plan у new state і переводить new state у режим `useWithoutSubscription`.

### Додаткове покриття Google Play pause/on-hold для нової subscription-схеми

Тип: unit tests.

Покриває:

- `src/subscriptions/subscriptions.service.spec.ts`: Pub/Sub `SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED` (`notificationType = 11`) не обмежує доступ, якщо Google verification ще повертає `SUBSCRIPTION_STATE_ACTIVE`; credits не скидаються без нового order id.
- `src/subscriptions/subscriptions.service.spec.ts`: Pub/Sub `SUBSCRIPTION_PAUSED` (`notificationType = 10`) після Google verification зі `SUBSCRIPTION_STATE_PAUSED` переводить `user_plan_states` у `billingStatus = PAUSED`, `accessStatus = LIMITED`, `metadata.accessReason = BILLING_PAUSED`.
- `src/subscriptions/subscription-usage.service.spec.ts`: V2 usage не списує credits і повертає окремі помилки для `BILLING_PAUSED` (`PLAN_PAUSED`) та `BILLING_ON_HOLD` (`PLAN_ON_HOLD`).
- `src/ai/guards/plan.guard.spec.ts`: V2 guard блокує paused subscription через `BILLING_PAUSED` і не читає legacy plans.
- `src/subscriptions/subscription-legacy.mapper.spec.ts`: legacy paid plan зі статусом `PAUSED` мігрується/синкається у `billingStatus = PAUSED`, `accessStatus = LIMITED`, `metadata.accessReason = BILLING_PAUSED`.
- `src/ai/guards/plan.guard.spec.ts`: V2 guard повертає legacy-compatible HTTP помилки для `CREDIT_EXCEEDED`, `TRIAL_EXPIRED`, `SUBSCRIPTION_EXPIRED`, `SUBSCRIPTION_CANCELED`, `BILLING_PENDING`, `BILLING_ON_HOLD`, `BILLING_PAUSED`, `SUBSCRIPTION_REFUNDED`, `ADMIN_DISABLED`.
- `src/ai/guards/plan.guard.spec.ts`: V2 websocket `plan_error` має numeric `code` і translation-key `statusMessage/message`, як legacy flow, зокрема `creditLimitExceeded_<basePlanId>` та `yourSubscriptionPausedPleaseRenewYourSubscription`.
- `src/subscriptions/subscription-legacy.mapper.spec.ts`: legacy paid plan зі статусом `REFUNDED` мігрується/синкається у `billingStatus = REFUNDED`, `accessStatus = LIMITED`, `metadata.accessReason = SUBSCRIPTION_REFUNDED`.
- `src/subscriptions/subscription-usage.service.spec.ts`: V2 usage не списує credits для `SUBSCRIPTION_REFUNDED` і повертає legacy-compatible `PLAN_REFUNDED` / `SUBSCRIPTION_REFUNDED`.

Запуск:

```bash
npm test -- --runTestsByPath src/subscriptions/subscriptions.service.spec.ts src/subscriptions/subscription-usage.service.spec.ts src/ai/guards/plan.guard.spec.ts src/subscriptions/subscription-legacy.mapper.spec.ts --runInBand
```
## Флоу: paid credits exceeded / use without subscription

Покрито:
- `src/subscriptions/subscriptions.service.spec.ts`: `useWithoutSubscription` дозволений для trial/start з вичерпаними кредитами, але заборонений для активного paid періоду з `CREDIT_EXCEEDED`, щоб paid-план не перетворювався на `source=NONE` через старий або помилковий клієнт.
