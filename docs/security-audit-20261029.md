# Нічний аудит безпеки та надійності — 28–29.10.2026

Статус: зупинено за прямим проханням користувача 29.10.2026. Перевірено backend, потім frontend та пов'язані маршрути landing. Виправлення не виконувалися; збережено лише нотатки й результати перевірок без зміни реальних даних. Поновлювати аудит або виправляти — лише за наступним дорученням.

Підсумок на момент зупинки: NA-01–64 — окремі знахідки з різними рівнями доказовості й передумовами; OP-01–05 — операційні зауваження; OPT-01–11 — кандидати оптимізації/надійності. Це не 64 підтверджені експлуатації production. Backend: 1704 PASS / 20 FAIL / 120 suites (+6 optional PG SKIP). Frontend: 1537 PASS / 16 FAIL / 7 blocked / 188 attempted suites. Разом 3241 PASS; падіння/блокування розібрані нижче, частина зумовлена застарілими fixtures або Jest environment. Ізольовані AST/VM/SQLite proofs обліковані окремо. Ручних телефонних PASS не додано.

Незавершені зовнішні дії: npm audit із передачею dependency inventory та експорт детальних findings до Memora відхилені automatic approval review; запитана згода не отримана. Не повторювали й не обходили заборону. Цей локальний файл — актуальний повний звіт; попередня Memora-нотатка не є повним підсумком ночі.

**Перший пріоритет ранкового розбору: NA-22 (P0), відновлення акаунта без purchaseToken.** Підтверджено на оригінальних методах із синтетичними repositories та реальному генераторі SQL TypeORM 0.3.24 без підключення до БД. Production exploit не запускався; код не змінений.

## Межі й метод

- Поточний робочий код, включно з наявними незакоміченими змінами інших робіт; це не підтвердження розгорнутої версії.
- `.env` локального backend: development, порт 3001, PostgreSQL loopback, listen 0.0.0.0. Зовнішні API налаштовані; їх не викликаємо. Секрети й приватні дані не виводимо.
- Redis використовує REDIS_URL; первинна перевірка REDIS_HOST не встановлює його фактичне розташування.
- Не запускаємо AppModule повторно: він містить synchronize:true, scheduler і зовнішні інтеграції.
- Немає змін runtime-коду, конфігурації, пакетів, БД, телефонного застосунку чи deployment. Немає масового fuzzing/навантаження.
- Розрізняємо: факт у коді, ізольоване відтворення на синтетичних об'єктах, перевірку localhost, гіпотезу та підтверджену експлуатацію. Останню проти реальних даних не проводимо.
- Числові ліміти самі по собі не є дефектами. Знахідка потребує сценарію, наслідку та перевірки чинних захистів/споживачів.

## Покриття

| Ділянка | Стан |
| --- | --- |
| Bootstrap, global guards, validation, proxy trust | Оглянуто; безпечні local HTTP probes, NA-07/08; production proxy невідомий |
| Login, Google login, password reset, access/refresh tokens | Основні потоки оглянуто; ізольовані перевірки й чинні тести |
| Admin authentication | Backend: окремий secret, live DB active/role check; landing local mail route має stale-token exception NA-54; public/admin-data routes винесені окремо |
| Forum avatars/public profiles | Обидва upload paths та public serializers оглянуто; NA-04/10/53 |
| Інші forum controllers, ownership, moderation, sockets | Основні live paths оглянуто; NA-18/19/28/29/31/35/36/40 |
| Billing, credits, Google callbacks, concurrency | RTDN, legacy/V2, wallets, finance, migration, advertising-access; unit/mocked regression та race probes |
| AI, media fetch/uploads, costs, cancellation | Provider/admission/media/replay/caches/billing transitions; NA-14/20/32/33/39, OPT-03 |
| Logs, notifications, support, statistics, scheduled cleanup | Основні потоки оглянуто, висновки NA-01–17 |
| SQL, limits, query/index performance, dependency advisories | AST/ORM та локальні dependency reads; production EXPLAIN не виконувався; frontend online audit заблокований до згоди |
| Frontend security | SecureStore/session/vault, HTML/WebView, backups/media paths, API calls, SQLite substitutions; продовжується локальний прохід |

## Попередній порядок ранкового розбору

1. **NA-22:** відновлення акаунта з відсутнім purchaseToken — ізольовано доведений небезпечний шлях. Першим перевірити розгорнуту версію та закрити вхідний контракт/порожній lookup, зберігши законне відновлення покупки.
2. **NA-48:** приватний service-account key у Git фронтенду; спочатку перевірити актуальність/права й узгодити відкликання та заміну. Signing keystore не видаляти й не ротувати навмання; production release continuity зберегти.
3. **NA-01/02/03/09/10/28/50 та NA-05:** доступ до адміністративних/приватних даних, public notification writes, stored XSS вебадмінки й legacy credential. Виправляти спільними auth/projection boundaries, не окремими прихованими кнопками.
4. **NA-42, потім NA-12/13/14/20/34/37/39:** public anonymous bootstrap приймає платний planData без IAP; далі справжність callbacks, повтори та коректність платного доступу/обліку. Не плутати локальні mock proofs із підтвердженням реальної втрати грошей у проді.
5. **NA-21/60/26/30/36/38/40:** залежності upload parser і Socket.IO transport/parser, приватні дані в logs, imported media path, Telegram errors, незавершений account transition, Redis TTL.
6. Решта P2/P3 та OPT-кандидати — після перевірки актуальності й впливу; оптимізації потребують вимірів, а не автоматичного переписування.

Це порядок розбору, не дозвіл на виправлення. Усі детальні передумови та межі доказів наведені в окремих пунктах; production exploit, деплой і зміна даних не виконувалися.

## Кандидати для перевірки, ще не остаточні висновки

1. Inactivity cleanup does not appear to preserve purchased-credit wallets by balance alone; product policy must be checked before calling this a defect.
2. Frontend rich-editor imported HTML: перевірено окремо в NA-25; межі експлуатації там явно обмежені.

## Уже відсіяні припущення

- Seeds/crypto/file-upload methods shown in commented source are not live endpoints.
- `/test/headers` HTML escapes `&`, `<`, `>`; not treating header echo as demonstrated XSS.
- Avatar deletion rejects slash/backslash traversal and checks remaining references before unlink; no path-traversal finding from that helper.
- Admin token active/role are refreshed from DB in backend AdminJwtStrategy; no stale-role bypass of that guard. Separate landing authorization exception is recorded in NA-54.

## Облік

Точні лічильники fresh/cached/output токенів недоступні; витрати та квоти не оцінювалися навмання.

## Перевірені знахідки — перший прохід

### NA-01 — P1: адміністративні маршрути підтримки відкриті без авторизації

**29.10.2026: локально виправлено адміністративний доступ, автоматично перевірено; деплой ще не підтверджений.** Разом із NA-02/09: [зміни та перевірки](na-01-02-09-admin-access-20261029.md). Ручні тести адмінки наразі не додаємо за рішенням користувача.

- `src/support/support.controller.ts:32,55`: GET `/support/get-messages`, POST `/support/update-status/:id` не мають guard. Controller-level auth немає; AppModule глобально ставить лише throttler. SupportModule реально імпортовано.
- `support.service.ts` без додаткового principal-check читає текст/пошту звернення та user.id/uuid/name/email, або змінює status. Лімітування списку є (до 200), але воно не є авторизацією.
- Реальний споживач: `diary-landing/lib/api/support.ts`, адміністративний інтерфейс. Захист вебсторінки не закриває прямий backend route.
- **Local HTTP підтверджено:** без Authorization/Cookie GET з messageId=2147483647 та синтетичним неіснуючим userUuid повернув 200, messages=[]; приватних звернень не читали, status не змінювали. Контрольний GET `/logs/get-logs` дав 401.
- Наслідок: доступ до звернень підтримки/особистих даних і зміна робочого статусу звернень сторонньою особою, якщо production використовує ці маршрути без окремого perimeter auth.
- Рекомендація на ранок: admin-jwt на ці два маршрути; create-message лишити користувацьким. Тести: анонім/звичайний user → 401/403, активний admin → дозволено; профіль автора й фільтри зберігаються.

### NA-02 — P1: user-monitoring відкритий, відповідь містить повний User та зв'язані платежі

**29.10.2026: локально виправлено admin auth і проєкції списку/додавання, автоматично перевірено.** [Деталі](na-01-02-09-admin-access-20261029.md); production deployment не підтверджений.

- `src/user-monitoring/user-monitoring.controller.ts:9,25,30`: add/get-all/delete без guards. Module реально підключено до AppModule.
- `user-monitoring.service.ts:getAll` leftJoinAndSelect user/plans/settings/payments/goalsStats, потім spread `...item.user`; User entity не має select:false для password/hash. Немає response sanitizer/global serializer у bootstrap.
- `diary-landing/lib/api/monitoring.ts` підтверджує адміністративний споживач. Немає вимоги бути admin у service.
- Висока впевненість за повним шляхом коду; реальний список не запитувався, щоб не читати чужі дані. Наявність monitoring rows у проді невідома.
- Наслідок: якщо є записи monitoring, доступні персональні дані, bcrypt password hash, uuid/hash і деталі платежів. UUID/hash додатково приймаються create-token (NA-05), тому це потенційний шлях отримання токена чужого профілю, а не лише статистики.
- Рекомендація: admin-jwt на всі методи + явна мінімальна проєкція User/payment; перевірка звичайного користувача/аноніма та відсутності sensitive keys у відповіді admin.

### NA-03 — P1: створення/видалення загальних і релізних повідомлень без авторизації

**Оновлення 2026-10-29:** локально виправлено admin guards, очищення HTML при записі/читанні та в чинних редакторі/таблицях адмінки. 20 backend + 11 landing tests PASS; TypeScript/lint PASS. Історичне доповнення про stored XSS нижче враховане. Деталі й деплой: [NA-03 implementation/tests](na-03-notifications-security-20261029.md). Деплой користувачем ще не підтверджений.

- `src/notifications/common-notifications.controller.ts:27,62`, `release-notifications.controller.ts:29,75`: public POST/DELETE; services виконують transaction/save/delete без principal-check.
- NotificationsModule активний. `latest`/mark-read/skip окремо захищені user JWT — це не захищає адміністративне створення.
- Наслідок: стороння особа може публікувати повідомлення від імені застосунку або видаляти їх; release містить build/platform/isUrgent. Довільне виконання HTML/JS у frontend поки не доведене і не заявляється.
- Статично підтверджено; жодного повідомлення не публікували/не видаляли. Наступний крок: перевірити frontend consumer і чинні deployment boundaries.
- Рекомендація: admin-jwt на write та admin-list; зберегти користувацькі latest/read/skip. Тести відмов до service-write для anonymous/user, дозволу для admin.

### NA-04 — P1: аватар користувача допускає активний HTML-файл

- `src/forum/controllers/forum-public-profiles.controller.ts:107,114`: extension з originalname; MIME перевіряється лише startsWith('image/'). Справжня сигнатура і дозволений raster-extension не перевіряються. Звичайний user JWT потрібен.
- `forum-public-profiles.service.ts:updateAvatar` зберігає `/uploads/forum/avatars/<filename>`; `src/main.ts` віддає upload root статично. Протилежний system-avatar path уже перевіряє raster/signature та обирає extension із allowlist.
- **Ізольовано виконано оригінальні callback AST:** originalname=probe.html,mimetype=image/png → accepted=true, filename=synthetic-id.html. Встановлений MIME resolver дає text/html;charset=utf-8. Нічого не завантажували й не записували на диск.
- Наслідок: hosting активного HTML на API origin; при відкритті посилання браузером можливе виконання скрипту на цьому origin. Сам показ HTML-файлу через image-компонент не доводить виконання JavaScript. Admin cookie встановлюється без Domain (host-only), а landing login звертається до /api/admin/login на своєму origin. Тому сценарій адміністративних same-origin дій потребує окремого підтвердження deployment: де фактично встановлена cookie і як проксі віддає uploads/API. HttpOnly не забороняє запити скрипту з cookie лише якщо відповідна cookie доступна цільовому host; він не переносить landing cookie на API host. Production nginx/headers/CSP не перевірено; повного browser exploit чи takeover немає. P1 тут попередній для активного контенту на довіреному origin, а не доведена компрометація адміна; переглянути пріоритет після перевірки topology.
- Рекомендація: спільна raster validation для обох avatar paths, безпечне розширення, окремий media origin/захисні headers за потреби. Тести: підроблений MIME+html/svg відхиляється; PNG/JPEG/WebP працюють; помилки не залишають файлів.

### NA-05 — P1: довготривале відновлення доступу зі старого JWT/hash; reset-password не відкликає сесії

- `src/auth/sessions.service.ts:62–68` та `auth.service.ts:createToken` підписують `{...user}`. `findByEmail/findByUUID` завантажують повну entity. password/hash не приховані entity metadata.
- **Ізольовано оригінальний createTokenPair:** payload keys містять password і hash. **Оригінальний login:** response.user теж містить password/hash. Це не витік сторонньому саме по собі, але розширює чутливий вміст токена/клієнтського сховища.
- Public `/auth/create-token` перевіряє uuid+generateHash(uuid,salt), а не чинний access/refresh token, пароль чи device signature. Тобто перехоплений JWT має uuid/hash для повторної видачі токенів після exp. У цьому шляху немає перевірки isRegistered/anonymous-only.
- `auth.service.ts:488` після OTP reset змінює лише password. **Ізольоване виконання success path**: user-update викликано, sessions.deleteByUserId не викликано; salt/hash не змінюються. JWT strategy перевіряє підпис/exp без session revocation.
- Передумова для takeover: доступ до uuid/hash (наприклад, витік токена або NA-02); це не твердження, що JWT можна вгадати.
- Рекомендація: мінімальний JWT payload; узгоджене відкликання після password reset; окремо спланувати обмеження legacy create-token із сумісністю попереднього released client. Не видаляти legacy навмання. Тести: old refresh/access/legacy credential після reset за визначеною політикою, нормальний released-client upgrade/recovery.

### NA-06 — P2: login очищає чужого гостя за caller-supplied UUID

- `src/auth/auth.service.ts:312,545`: після перевірки власного пароля/Google token викликає deleteAnonymousUserByUuid для uuid з body, без доказу володіння цим guest. Для нової реєстрації registrationGuest guard уже є; гілка existing-account login його обходить.
- `users.service.ts:1765` захищає registered/system/password/email/phone/OAuth і paid-plan/V2-paid-subscription. Ці захисти враховано: не заявляється видалення довільного зареєстрованого/платного користувача.
- **Ізольовано оригінальний login з власними правильними credentials і чужим synthetic guest UUID:** deleteAnonymousUserByUuid отримав саме чужий UUID. Реального видалення не було.
- Передумова: знання UUID відповідного неоплаченого guest (не перебір випадкового UUID). NA-01/NA-02 можуть розкривати UUID, якщо цей guest у відповідних даних.
- Google branch приймає inline body без runtime DTO. Пізніше SQL-тест установленого TypeORM (NA-22) підтвердив пропуск undefined/null equality condition. В deleteAnonymousUserByUuid немає nonempty check перед findOne({where:{uuid}}). Якщо нефільтрований перший User є guest без paid plan, код може дійти до delete навіть без відомого UUID; якщо registered/paid — наявні exclusions зупинять його. Цей конкретний end-to-end delete не виконувався.
- Рекомендація: очищати тільки authenticated/proven guest, незалежно від успішного входу в інший акаунт. Тести: свій guest cleanup працює, чужий/відсутній UUID не спричиняє delete, registered/paid exclusions залишаються.

### NA-07 — P2: spoofed X-Forwarded-For обходить IP throttling у локальному app

- `src/main.ts:85` trust proxy=true, installed ThrottlerGuard.getTracker використовує req.ip; ClientMetaMiddleware також бере перший XFF без перевірки proxy.
- **Local HTTP:** три GET `/test/test` з synthetic XFF A,A,B дали remaining=599,598,599. Жодного навантажувального тесту чи блокування реальних користувачів.
- Production вплив умовний: якщо nginx переписує header на справжній client IP і backend недоступний напряму, експлуатація може бути перекрита. Якщо додає `$proxy_add_x_forwarded_for` до довільного клієнтського header, trust-all небезпечний. Конфіг nginx не читали.
- Рекомендація: довірені proxy адреси/hops і узгоджена нормалізація clientIp. Перед зміною перевірити deployment, щоб не об'єднати всіх користувачів в IP nginx. Тести через реальний proxy з підставленим header.

### NA-08 — P2: Retry-After у 1000 разів завеликий

- `src/common/guards/custom-throttler.guard.ts` перезаписує Retry-After значенням detail.ttl без перетворення ms→s.
- Встановлений `@nestjs/throttler/dist/throttler.guard.js` спочатку ставить коректний timeToBlockExpire, потім викликає override з ttl у ms.
- **Ізольовано оригінальний override:** ttl=300000,timeToBlockExpire=300 → Retry-After='300000' (83.33год замість максимум 5хв). Результат підтверджений без створення 429 у live app.
- Рекомендація: залишити header бібліотеки або використати remaining timeToBlockExpire. Тести 5хв/частково минулий block, відсутній detail; не замінювати на початковий TTL, якщо залишився менший час.

### NA-09 — P1: адміністративна статистика також розкриває повні User

**29.10.2026: локально виправлено доступ до адміністративних маршрутів і витік повних User, автоматично перевірено.** [Деталі](na-01-02-09-admin-access-20261029.md). Додаткове зауваження про витрати ресурсів для довгих інтервалів не закривається цією правкою; тепер ці запити доступні лише адміністраторам.

- Та сама відсутність admin auth, що NA-02, але інші активні маршрути: `src/user-statistics/user-statistics.controller.ts` get-paid-users-profile і get-users-activity-records не мають guards.
- `user-statistics.service.ts:833,996,1067`: повні user relations і spread user у відповідь, включно з password/hash/uuid/email. compact=true прибирає статистичні масиви, але не секретні поля User. Списки не запитувалися на реальних даних.
- GET paid profiles також не має верхньої межі limit; activity records не має пагінації/межі інтервалу. Поточне relationLoadStrategy=query вже усуває Cartesian join; не заявляємо, що попередній Cartesian OOM досі є. Велика вибірка все ще потенційно дорога — без навантажувального підтвердження.
- Додаткові public admin reads: /forum-moderation/admin/logs, /forum-moderation/admin/ai-usage; tokens/statistics usage; finance common; plan tokens; агрегати user/settings/diary. Не всі повертають password/hash: tokens повертає проєкцію uuid/name/email, саме /forum-moderation/admin/logs — обмежений профіль. Не плутати його з іншим /admin/forum/moderation-logs (звичайний user JWT, повні Admin/User; NA-28).
- Наслідок/ланцюг: відкритий список може дати legacy uuid/hash для NA-05. Перевірити й закрити весь адміністративний namespace єдиною політикою, залишивши справді публічні продуктові агрегати тільки за явним рішенням.
- Тести: anonymous/user/admin matrix для всіх admin routes; жодних password/hash/salt у відповідях; допустимі пагінація/інтервал не ламають живі admin consumers.

### NA-10 — P1: відповіді спільноти повертають секретні поля інших User

**Оновлення 2026-10-29:** виправлено локально спільною HTTP-проєкцією public/admin; охоплено також уточнення notifications, mentions, user-blocks і пов'язані відповіді модерації. Ідентифікацію для бану/розбану збережено. 142 backend + 4 landing checks PASS; деплой користувачем ще не підтверджений. Деталі: [NA-10/28 implementation and tests](na-10-28-forum-response-security-20261029.md).

- `src/forum/services/forum-conversations.service.ts:getConversation/getMyConversations/getOrCreateConversation` завантажують userOne/userTwo як повні User і повертають entity без проєкції. `forum-messages.service.ts:getConversationMessages` так само повертає sender/recipient.
- `forum.module.ts:128–129` реєструє обидва controllers. JWT та перевірка членства є, але вони не мають дозволяти доступ до password/hash співрозмовника.
- **Ізольоване виконання оригінальних методів із синтетичними repositories:** JSON відповіді getConversation і getConversationMessages містить uuid/password/hash/email іншого учасника; сторонній nonmember правильно отримує 403. Реальних розмов/повідомлень не створювали.
- getOrCreateConversation дозволяє створення з активним незаблокованим target profile, якщо allowDirectMessages=true; для отримання user relation достатньо потім читання conversation, відповіді адресата не потрібно. UI consumer поки не знайдений, але backend routes активні.
- Наслідок: будь-який допустимий співрозмовник може отримати legacy credential NA-05. Передумова target має форумний профіль і дозволяє direct messages; це не доступ до будь-якого довільного nonmember conversation.
- Рекомендація: спільний явний public-profile response DTO для відправника/одержувача, без auth-полів; перевірити всі повернення User entity. Тести member бачить лише дозволені поля, nonmember 403, створення/список/читання/повідомлення однаково без secrets.
- **Розширення перевірки:** `forum-topics.service.ts:124,213,264,326` завантажує повного author та spread topic; `forum-comments.service.ts:1136–1199` так само завантажує author/parentAuthor/replyToAuthor й повертає spread без проєкції. Це вже звичайне читання спільноти, не залежить від дозволу direct messages. Live consumers: getAllTopicsApi.ts, getTopicRootCommentsApi.ts/getTopicCommentRepliesApi.ts у frontend.
- Оригінальні getTopics і getRootCommentsPage з синтетичними repository results повернули author keys uuid/hash/password/email. Перша спроба harness зупинилась через відсутній mock trackCommunityVisit; після додавання цього mock обидва методи виконались. Це тест response transformation, не реальний запит БД; відсутність SQL projection окремо перевірена в query-builder коді. Зовнішнього serializer не знайдено. Рекомендація поширюється на всі author/reply/parent projections.
- Додатковий той самий consumer-pattern: ForumBookmarksService.getMyBookmarks повертає items із relations.topic.author=true без проєкції. Пагінація тут обмежена 100; проблемою є секретні поля автора, а не необмежений limit.

### NA-11 — P1: публічний платний перекладач приймає довільний текст

- `src/forum-translations/forum-translations.controller.ts` POST /forum/translations без guard і runtime DTO; items/targetLang довірені body.
- `forum-translations.service.ts:translateAndCache` перевіряє лише непорожні text/targetLang, cache key, потім викликає Google Translate і зберігає sourceText. Не перевіряє існування target, доступ/публікацію чи відповідність тексту actual post.
- **Ізольовані оригінальні hashText/translateAndCache/translateManyAndCache з mock provider:** неіснуючий synthetic target UUID і довільний text доходять до provider; providerCalls=1, sourceContentLookup=0, externalNetworkCalls=0. Платного запиту не було.
- Глобальні body limit/throttle діють; це не буквально безлімітний обсяг. Але стороння особа може витрачати бюджет перекладу й засмічувати cache, підставляючи різний текст; кількість items не обмежена окремим DTO в межах body.
- Рекомендація: автентифікація; сервер бере канонічний текст із доступного target; bounded batch/бюджет і повторне використання cache. Тести arbitrary/nonexistent/private target не викликає provider, чинний public target перекладається/кешується, повтор не тарифікується заново.

### NA-12 — P1: unsigned Pub/Sub voided event може відкликати придбані кредити

- `src/iap/iap.controller.ts:handle/processNotification` не перевіряє Google OIDC Authorization, audience/service-account або інший доказ походження. Global middleware такого захисту не містить. Production nginx/PubSub configuration невідомі.
- Гілка voided productType=2 передає body.purchaseToken/orderId без Google verification у `credit-purchases.service.ts:299 handleVoidedGooglePlayPurchase`. Service блокує purchase/wallet rows і списує outstanding, але не звіряє фактичне повернення в Google. packageName у цій гілці взагалі не використовується.
- **Ізольований оригінальний controller:** request headers={} + synthetic voided body з неправильним packageName → revoke handler викликано 1 раз, response='ok'. Жодного справжнього RTDN, Google call, wallet write не виконано.
- Передумова: знати справжній purchaseToken наявної покупки; довільний token дає NOT_FOUND і не списує кредити. Не стверджуємо можливість вгадати token. Один тільки orderId недостатній. Відкликання чужої покупки — порушення цілісності, а не спосіб отримати безкоштовні кредити.
- Механізм Google: authenticated push додає OIDC JWT; endpoint має перевірити підпис, audience і очікуваний service-account email/email_verified. Джерело: [Google Pub/Sub push authentication](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions), перевірено в цьому аудиті.
- Рекомендація: узгодити authenticated subscription + перевірку origin до dispatch (без cron polling); idempotency/row locks залишити. Тести missing/invalid/wrong-audience/wrong-account JWT не доходить до mutation, authentic duplicate refund списує один раз, штатні RTDN не втрачаються.

### NA-13 — P2: помилка V2 subscription handler підтверджується як успішний Pub/Sub event

- `src/iap/iap.controller.ts:processNotification`: помилка legacy запам'ятовується і перекидається, але catch V2 `handleGooglePlayPubSub` порожній. Якщо legacy succeeded, повертається 'ok'/HTTP200 навіть за збоєм V2.
- `subscriptions.service.ts:1104,1397` V2 може кинути помилку Google/DB для чинного store subscription. Legacy та V2 — різні persisted states, успіх першого не доводить оновлення другого.
- **Ізольований оригінальний handle/processNotification:** legacy resolves, V2 throws synthetic outage → response='ok'. Наявний iap.controller.spec.ts прямо очікує цю поведінку; проходження такого тесту не є доказом коректної доставки.
- Наслідок: саме ця подія не буде повторно доставлена через помилку handler; V2 може залишатися старим до наступної події/іншої синхронізації. Не стверджуємо, що відновлення стану неможливе назавжди.
- Рекомендація: обидва незалежні handlers виконуються, але transient failure будь-якого вимагає retry; повтори мають бути idempotent. Permanent unsupported event відокремити від outage. Тести legacy-success/V2-fail → retry response, reverse case, повторний повний success не дублює період/кредити.

### NA-14 — P1: повтор авторизованого AI cycle дозволяє нові auxiliary calls за нульового балансу

- `src/ai/guards/plan.guard.ts:446–455` пропускає відомий cycle при INSUFFICIENT_AI_CREDITS; client сам передає timingTraceId. `ai-credit-cycle.service.ts:isAuthorized` продовжує TTL на 15хв при кожному використанні, не зв'язує ID з input/переліком стадій і не закриває цикл після завершення.
- `ai.service.ts:5448 runMemoryCapsuleExtraction` викликає OpenAI напряму; ні claimExecution, ні assertRequestAffordable тут немає. Публічні authenticated memory-capsules/v2 endpoints доходять до цього helper. Billing потім приймає authorized cycle з allowDebt.
- **Ізольовано оригінальні authorize/isAuthorized + canActivateV2/canCompleteAuthorizedCycle + runMemoryCapsuleExtraction:** після попередньої авторизації synthetic cycle два запити з різним synthetic content та availableCredits=0 дозволені, provider mock викликано 2 рази, TTL подовжено 2 рази. Реальної Redis/БД/AI мережі не було.
- Передумова: користувач раніше мав достатній баланс для авторизації cycle та повторює його до спливання TTL. Hard BLOCKED state guard відхиляє. Це не обхід автентифікації.
- **Не поширювати на весь AI:** executeTextResponse:1954 додатково перевіряє estimated cost незалежно від cycle; image generation має свій admission; conversation/periodic services використовують claimExecution. Ці захисти враховані.
- Рекомендація: зберегти завершення справжніх багатокрокових операцій, але серверно зв'язати й обмежити допустимі стадії/повторне виконання циклa; новий контент не має позичати старий дозвіл. Не вирішувати коротким таймаутом, який знову обірве повільну нормальну операцію.
- Тести: штатний entry→capsule→embeddings завершується після вичерпання балансу; повтор тієї ж стадії/інший контент зі старим ID не оплачує новий виклик; різні користувачі ізольовані; hard block лишається.

### NA-15 — P2: після зміни акаунта один push token лишається активним для попереднього

- `push-notifications.service.ts:savePushToken` шукає/оновлює тільки пару userId+token; entity має unique саме на цю пару. Реєстрація того самого installation token іншим акаунтом не відв'язує попередній рядок.
- `sendNemoryReminderPushBatch` завантажує всі active token старого user і відправляє title/body без current-session перевірки. Аналогічно forum pushes.
- Живі frontend consumers: ensureAppPushNotificationsEnabled використовується у DeferredSetup, HabitForm, DeadlineForm, AddTopic/ViewTopic. `switchAccountVault.ts:restartAccountRuntime` скасовує локальні scheduled notifications і dismiss поточні, але не відкликає серверний push token. Backend endpoint відкликання не знайдений.
- **Ізольовано оригінальні savePushToken/sendNemoryReminderPushBatch:** user1→user2 з одним synthetic token залишає owners=[1,2]; нагадування user1 відправляється тому самому token у mock Expo. Реальних pushes/зміни акаунта не було.
- Наслідок: наступний користувач того самого встановлення може побачити текст push попереднього акаунта. Передумова token зберігається після входу іншим акаунтом; зміна/ротація installation token знімає саме цей сценарій. На телефоні не перевіряли.
- Рекомендація: перев'язування installation token на поточного власника та явне відкликання при виході; зберегти кілька пристроїв одного акаунта. Тести old/new account на одному token, два token одного user, logout offline/retry без блокування входу.

### NA-16 — P2: невдале попередження про неактивність вважається надісланим

- `inactivity-cleanup.cron.service.ts:sendWarnings` записує inactivityWarnedAt/scheduledDeletionAt ДО emailsService.send; catch лише логує. Наступні вибірки вимагають inactivityWarnedAt IS NULL.
- **Ізольовано оригінальний sendWarnings**, mock mail відмовляє: після двох запусків emailAttempts=1, inactivityWarnedAt і scheduledDeletionAt уже встановлені. Реальної пошти/БД не було.
- `deleteExpired` орієнтується на lastActiveAt/paid state, а не успішне попередження. Користувач з email може дійти до видалення без отриманого попередження, якщо пошта тимчасово відмовила. Provider acceptance не гарантує прочитання — тут проблема раніше, у відомому failed send.
- Рекомендація: позначати успішно відправлене після успіху; durable retry/outbox за необхідності. Узгодити вимогу періоду після фактичного попередження. Тести mail failure→наступний run retry, успіх→без щоденних дублів, activity/paid user не видаляється.

### NA-17 — P2: видалення акаунта не атомарне й може залишити частково пошкоджений профіль

- `users.service.ts:1718 deleteUser`: послідовні delete usage/plans/salt/sessions/reads/settings/user через різні services/repositories без спільної transaction.
- **Ізольовано оригінальний метод:** synthetic DB failure на salt delete після usage/plans → exception, User усе ще існує, але usage і legacy plan вже видалені. Реальних deletions не було.
- Це окремо від виправленої авторизації delete routes: внутрішній cron та підтверджене видалення email кодом викликають той самий helper. Немає твердження, що будь-яка помилка завжди дає частковий стан; потрібна відмова після одного успішного кроку.
- Рекомендація: спільна DB transaction для пов'язаних persisted rows; зовнішні повідомлення після commit. Не змінювати правила, які акаунти дозволено видаляти. Тести fault injection на проміжному delete → rollback, success → повне видалення, внутрішній inactivity cleanup лишається робочим.

### NA-18 — P2: пагінація коментарів дозволяє повернути прихований модерацією текст

- `forum-comments.service.ts:1136–1199`: base query включає REMOVED_BY_MODERATOR, а mapCommentResponse повертає content без очищення; joined parent/reply також повертаються як entities. `forum-moderation.service.ts:312` зберігає оригінальний content під час moderation removal, що потрібно для відновлення адміністратором, але не для user response.
- **Ізольований getRootCommentsPage** повернув синтетичний moderation-removed content без змін. Frontend ViewTopicCommentCard.tsx:435 показує placeholder замість цього тексту, тобто приховування зараз лише в UI. Реальні приховані коментарі не читали.
- Додатково paginated roots/replies/context перевіряють comment status/deletedAt, але не publication/deletedAt батьківської теми. `deleteTopic` позначає тему REMOVED_BY_AUTHOR і deletedAt; comments залишаються. З відомим topicId/parentId можна звернутися напряму до paginated endpoints після приховування теми. Статичний шлях; з реальною БД не відтворювали.
- Рекомендація: перевірка доступності теми у спільному read path; явний placeholder DTO для вилучених коментарів і вкладених parent/reply, зберігши оригінал для admin restore. Тести published/removed topic, moderator-removed root/reply/parent; content відсутній у JSON user response, admin restore працює.

### NA-19 — P2: необмежені параметри пагінації коментарів множать запити й розмір відповіді

- `forum-comments.controller.ts` Number(query) без bounded DTO; `getRootCommentsPage:999` передає rootLimit+1/replyPreviewLimit+1 у take. Для кожного root окремо await getMany replies; getRepliesPage і before/context аналогічно приймають caller limits.
- **Ізольовано оригінальний getRootCommentsPage:** rootLimit=100000/replyPreviewLimit=100000 потрапили у take як 100001; три синтетичні root дали 4 getMany (1+N). Реальних великих запитів/навантаження не було. У TypeORM один getMany із joins може мати більше одного SQL, тому це підрахунок API-викликів, не виміряний SQL count.
- Global rate limit обмежує кількість HTTP-запитів, але не роботу одного. Звичайний UI використовує малі значення; ризик — довільний авторизований client або випадково великий query parameter.
- Рекомендація: валідовані цілі bounded page sizes на API, пакетне отримання reply previews з per-parent rank/limit за потреби. Це server resource budget, не часова відсічка операції користувача. Тести звичайних сторінок/cursors, некоректного/великого limit; порівняти query count до/після на невеликій fixture.

### NA-20 — P2: паралельні AI-запити допускаються за одним залишком без резервування

- `subscription-usage.service.ts:78 assertRequestAffordable` читає availableCredits і порівнює estimatedCredits без резервування. `ai.service.ts:1954` викликає це до provider; `recordV2Usage:228` блокує UserPlanState вже під час обліку виконаної роботи.
- **Ізольовано оригінальні resolveAiPlan/assertRequestAffordable:** три concurrent admission на synthetic balance=500 та estimate=400 кожна → admitted=3, aggregateEstimate=1200, paidCalls=0. Це доказ відсутності reservation в admission, не виміряний production overspend.
- `gateway/ai.gateway.ts:212 handleStreamAiComment` не має per-user execution gate; нові conversation/periodic flows мають claimExecution, але його Redis key залежить від requestId і захищає повтор тієї самої операції, не різні паралельні requestId. Загального бюджетного reservation у перевірених шляхах не знайдено.
- Authorized cycle може завершитись у debt — це навмисна поведінка для вже початої роботи. Ризик тут інший: багато різних операцій одночасно отримують дозвіл на ті самі гроші. Можливі витрати провайдера понад баланс; точна сума залежить від фактичних usage та charge path.
- Рекомендація: атомарний резерв оцінки на user/cycle зі звільненням/звіркою фактичного usage, або узгоджена серверна черга дорогих операцій. Не переривати вже дозволену відповідь коротким таймером. Тести concurrent admission, cancellation/provider failure, completion overestimate/underestimate та сумісність legacy/V2.

### NA-21 — P1: активний multipart parser Multer 2.0.0 має відомі DoS-вразливості

- Перевірено фактичний resolution від @nestjs/platform-express: node_modules/multer 2.0.0; package-lock також фіксує 2.0.0. Не лише semver у package.json.
- Активні FileInterceptor consumers: forum-public-profiles.controller.ts:63,103 і media-analysis.controller.ts:105,144. User/admin JWT передує interceptor, тому в цих маршрутах передумова — відповідний автентифікований користувач. Закоментований files/upload не рахуємо.
- Офіційний advisory [GHSA-fjgf-rc76-4x9p / CVE-2025-7338](https://github.com/expressjs/multer/security/advisories/GHSA-fjgf-rc76-4x9p): версії <2.0.2, malformed request може спричинити uncaught exception та падіння процесу. Окремий [GHSA-5528-5vmv-3xc2](https://github.com/expressjs/multer/security/advisories/GHSA-5528-5vmv-3xc2) охоплює <2.1.1. Наявність уразливої версії/досяжного parser підтверджена; crash exploit проти запущеного API не виконувався.
- Станом на аудит є новіші advisories; не рекомендувати 2.0.2 як повністю безпечну кінцеву версію. Оновлення узгодити з Nest dependency graph, звірити всі advisories та тестувати memory/disk storage, ліміти, обірваний upload в окремому тестовому процесі. Свіжий async-fileFilter advisory не називаємо окремим досяжним дефектом: чинні fileFilter callbacks синхронні.

### NA-22 — P0: публічний sync-by-purchase-token допускає вхід без purchaseToken

**Оновлення 29.10.2026 після аудиту:** користувач дозволив виправлення NA-22. Додано class DTO з перевіркою сирого типу purchaseToken та захист syncUser і обох lookup до TypeORM. Деплой не виконано. Поточні перевірки й ручний сценарій: [na-22-purchase-token-retest-20261029.md](na-22-purchase-token-retest-20261029.md). Нижче збережено вихідний доказ до виправлення; це не означає, що решту знахідок виправлено.

- `users.controller.ts:126` POST /users/sync-by-purchase-token має лише BlockedCountriesGuard; body — inline TypeScript object, не class DTO. Global ValidationPipe з metatype Object пропускає тіло без purchaseToken. Geo guard перевіряє країну, не володіння акаунтом.
- `users.service.ts:368–445 syncUser` перевіряє лише 32-byte devicePubKey, потім шукає store subscription/legacy plan за purchaseToken і викликає authService.loginByUUID власника. Немає перевірки, що token — непорожній рядок, чи auth/session доказу власника. uniqueId=null повертається із claimFirstDeviceInstall без запису registry.
- `subscriptions.service.ts:287 findStoreSubscriptionOwnerByPurchaseToken` та `plans.service.ts:655 findExistingPlanForIap` передають `{where:{purchaseToken}}` у findOne. Встановлений TypeORM **0.3.24** ігнорує undefined/null property. **Офлайн SQL-тест на EntitySchema без initialize/connect:** missing/null → SELECT ... LIMIT 1 без WHERE; непорожній synthetic token → WHERE purchaseToken=$1. Не переносити сюди default throw з документації новішого TypeORM 1.0.
- **Оригінальні syncUser, assertDevicePubKey, claimFirstDeviceInstall, обидва lookup methods і loginByUUID виконано в ізоляції:** для v2 та legacy fallback missing purchaseToken доходить до issueTokens для synthetic unrelated owner. Sessions issueTokens mock, реальні JWT/сесії не створювались; Google/network/DB calls=0. Реальна issueTokens реалізація випускає токени новому device/key після loginByUUID, без додаткового доказу власника.
- Передумова: у store_subscriptions або legacy plans є принаймні один запис із чинним власником. Це не довільний вибір жертви без її token: без фільтра повертається якийсь перший matching row за планом БД. Але не потрібні ні пароль, ні відомий UUID, ні дійсний purchase token. Доступ до paid/account identity, з можливими подальшими user API діями, є критичним.
- Не перевірено на production і не викликано на локальній реальній БД, оскільки endpoint змінює settings/сесії. Висока впевненість за з'єднаним шляхом і runtime ORM evidence; наявність production perimeter restriction невідома.
- Рекомендація: strict DTO nonempty purchaseToken + захисна перевірка service/repository boundary до будь-якого lookup/registry/settings/token issuance; valid token recovery зберегти для чинного/попереднього client, окремо розглянути доказ власності покупки. Не додавати polling Google. Тести missing/null/empty/array/object → 400 і нуль lookup/login/write; unknown token → NOT_FOUND; валідні legacy/V2 restores працюють; contract test із реальною ORM query generation, не mock, який приховує undefined semantics.

### NA-23 — P2: імпортований backup керує необмеженою вартістю синхронного KDF

- Frontend `db/backup/backup.service.ts:45 parseBackupEnvelope` перевіряє iter лише як додатне safe integer; `prepareBackupRestore:416` передає його в deriveBackupKey. `db/backup/deriveBackupKey.ts:16` виконує CryptoJS.PBKDF2 синхронно на JS thread після одного yield.
- Ізольований запуск оригінального parser: 200000, 2147483647 і 9007199254740991 прийняті; 0, -1, 1.5 відхилені. KDF із величезними значеннями НЕ запускався. Checksum необов'язковий для старих копій; це публічний hash, а не доказ довіри до iter.
- Передумова: користувач сам вибрав сторонню/змінену .nbak копію. Маленький файл може зайняти JS thread практично невизначено довго; це локальний DoS, не віддалене захоплення акаунта. Звичайний 200000-iteration backup не є цією атакою.
- Рекомендація: до KDF перевіряти підтримувані параметри версії та розумну верхню межу обчислювальної роботи, сумісну зі старими експортами; відхиляти нерозпізнані параметри. Це валідація недовіреного файлу, не короткий таймер для нормального відновлення. Тести на oversized iter повинні перевіряти нуль викликів KDF; легальні старі/нові копії — відновлюватися.

### NA-24 — P2: Android unzip може повідомити успіх після помилки запису вкладення

- Активний `utils/files/backup.ts:107` викликає unzip із react-native-zip-archive; той самий API використовується для фонів у `db/backup/backup.service.ts:178`.
- Встановлений Android `RNZipArchiveModule.java:187–212` ловить IOException під час getInputStream / FileOutputStream / StreamUtil.copy, закриває потоки і продовжує цикл без reject/rethrow. Після циклу відправляє progress=100% та promise.resolve(destDirectory). Це висновок за фактичним native source, не проведене падіння/заповнення диска телефона.
- `restoreImagesFromArchive` перевіряє колізії лише знайдених розпакованих файлів; не порівнює їх із manifest ZIP або очікуваними size/hash. За непорожнього часткового результату може повернути imported і показати успіх, хоча частини вкладень немає/вони обрізані. Відновлення фонів також довіряє resolved unzip. Поточні файли з іншими hash не перезаписуються — цей захист є.
- Рекомендація: unzip має відхиляти будь-яку IO/extraction помилку; перевіряти повноту до перенесення staged файлів. Помилка або конфлікт також повинні прибирати tempRoot у finally: зараз images-import очищає його лише після успіху. Тестувати обірваний ZIP/штучний write failure в ізольованій папці або native unit harness, не заповнювати диск користувача.
- Zip traversal окремо НЕ підтвердився: native код перевіряє canonical path із завершальним File.separator, отже очевидний ../ відсікається. Відсутність ліміту unpacked bytes лишається додатковим ресурсним ризиком; zip bomb не запускали.

### NA-25 — P2: збережений HTML запису може виконувати event-handler JavaScript у редакторі

- Живий ланцюг: TodayStreamPrototype / calendar → EntryViewerPortal → ViewFullEntry → EditEntryContent:172,441 бере entry.contentHtml без sanitization → TextReachEditor:2464 initialContentHTML → власний packages/react-native-rich-editor/src/editor.js:484 setHtml через innerHTML. package.json підключає цей fork через file:, SHA256 встановленого editor.js і source fork збігаються.
- Bootstrap JSON правильно екранує `<`, тому вихід із script-тега не підтверджений. Але подальший innerHTML зберігає onerror та інші event attributes. stripEditorMediaControls прибирає службові елементи редактора, а не небезпечний HTML.
- **Ізольований оригінальний createHTML у JSDOM:** synthetic img із безпечним onerror, який лише ставить window.__AUDIT_MARKER=1, зберігається; вручну відправлена error-подія встановлює marker=1, JS errors=0, network=0. Перший harness не мав глобального window; після додавання лише потрібного RN host stub перевірка виконалась. Це не Android/WebView exploit на телефоні.
- Передумова: недовірений HTML уже потрапив у contentHtml, наприклад після свідомого імпорту чужої копії з відомим паролем. Віддалений запис довільного HTML у чужий щоденник через API не доведений. Clipboard sanitization платформою окремо не перевірена; не стверджуємо, що кожне звичайне вставлення зі сторінки зберігає handler.
- Підтверджений наслідок — виконання JS усередині документа редактора з доступом до його DOM/bridge. Крадіжку SecureStore, читання всієї SQLCipher БД або всіх private files не доведено і не слід приписувати цьому тесту. Проте TextReachEditor також вмикає universal file URL access/mixed content, тому межі WebView потребують окремої перевірки перед оцінкою більшого impact.
- Рекомендація: спільний allowlist HTML для імпортованого/вставленого rich content, який зберігає підтримувані форматування, медіа й data-атрибути редактора, але прибирає executable attributes/URLs/frames. Не просто вимкнути JS у редакторі: це зламає його функції. Перевірити тему, кольоровий текст, списки, медіа, старі записи після зміни; тестувати обидва редактори заголовка/тексту.

### NA-26 — P1: помилка зміни пароля та AI HTTP помилки записують чутливий payload у telemetry

- Frontend `utils/api/apiClient.ts:221–233` відправляє request_error з response.config.data. CREDENTIAL_ROUTES маскує /auth/change-password, але не /users/change-user-auth-data. Останній живий маршрут викликають ChangePasswordModal → changeUserAuthData thunk → changeUserAuthDataApi:23 із password, newPassword і user.hash.
- **Оригінальний останній response interceptor в ізоляції**, status=400, synthetic data: /auth/change-password → payload omitted; /users/change-user-auth-data → весь JSON із synthetic old/new passwords і hash передано eventLog. Мережевих викликів/реальних секретів=0. Реальна помилка валідації, неправильного старого пароля або backend failure достатня для цієї гілки.
- Для /ai/extract-user-memory тим самим тестом payload також збережено; живі hooks/checkin services передають text. V2 extract-dialog має userText/assistantText та activeScheduledReminders і теж відсутній у маскуванні. Не стверджуємо, що AI-запит реально містить password: синтетичний універсальний fixture перевіряв збереження довільного payload, фактичні поля звірені окремо.
- Root eventLog transport вмикається без __DEV__ condition і шле /logs. eventLog.normalizeData не редагує поля; backend LogsService.ingestBatch:74 зберігає e.data як є. Читання /logs зараз admin-guarded — це не публічне читання паролів, а зайве зберігання секретів/приватних текстів у діагностиці. Production logs на наявність реальних паролів не читали.
- Рекомендація: централізовано не логувати request/response bodies для auth, billing credentials та private AI content; для решти allowlist безпечних метаданих. Не обмежуватись ще одним URL у переліку; response/error/console forwarding також перевірити. Зранку окремо оцінити очищення вже накопичених logs і ротацію, якщо факт реального витоку підтвердиться. Тести на всі credential aliases, strings/objects і AI errors без втрати status/requestId/origin.

### NA-27 — P2: чотиризначний локальний PIN не має обмеження невдалих спроб

- AuthGate:653 задає pinLength=4; handleCheckPin:386 лише порівнює verifyPin і показує помилку. PinPad:287 через 160ms передає введення й очищає його. Немає attempt counter, cooldown або блокування повторних перевірок. utils/pin/pin.ts робить один SHA256 compare через SecureStore hash.
- Передумова — фізичний доступ до вже розблокованого телефона та екрана PIN Nemory; це не віддалений brute force API і не обхід Android screen lock. Простір PIN=10000, повторні спроби можуть бути автоматизовані доступним власнику телефона UI automation. Реальний PIN/телефон не перебирали.
- Рекомендація: збережений лічильник і поступова затримка після невдалих спроб, що не обнуляється простим перевідкриттям форми; без автоматичного видалення щоденника. Тести неправильних/правильного PIN, restart і recovery. SHA256 без salt сам по собі не називаємо remote exploit: hash лежить у SecureStore, доступ до нього — окрема передумова.
- Окреме продуктове питання, не доведений дефект: чи обіцяється повторне блокування при поверненні з background? У переглянутому root flow isAuthenticated не скидається звичайним AppState transition; зміна цієї поведінки потребує узгодження, не автоматичного додавання timeout.

### NA-28 — P1: звичайний user JWT читає журнал модерації разом із password hash адміністратора

**Оновлення 2026-10-29:** локально встановлено `admin-jwt` та проєкцію Admin/User для журналів; той самий guard виправлено у пов'язаному ai-moderation-results. Anonymous/user/admin HTTP-перевірки пройшли. Деталі й межі перевірки: [NA-10/28](na-10-28-forum-response-security-20261029.md). Деплой користувачем ще не підтверджений.

- `src/forum/controllers/forum-moderation-logs.controller.ts:10–11`: /admin/forum/moderation-logs захищений AuthGuard('jwt'), а не admin-jwt. Controller зареєстрований у ForumModule; назва admin namespace не додає захисту.
- `forum-moderation-logs.service.ts:45 getLogs` завантажує moderator:true і targetUser:true, повертаючи items без проєкції. moderator — ManyToOne Admin; Admin.password звичайний selected column без select:false. getTargetLogs теж завантажує moderator:true.
- **Оригінальний getLogs із synthetic repo:** adminPasswordReturned=true, userHashReturned=true; передані ORM options підтверджують обидва full relations. Не читали реальні хеші/журнали та не перебирали пароль.
- Передумова: чинний звичайний user JWT і принаймні один log із moderator relation. Наслідок — приватні moderation records, хеш пароля й email адміністратора для offline guessing, а також targetUser legacy credential (NA-05). Admin hash не дорівнює plaintext password, і сам по собі не є admin JWT; автоматичне захоплення admin не доведено.
- Відрізняється від NA-09: це інший controller і слабший тип guard; від NA-10 — витоком Admin. Виправлення на ранок: admin-jwt + safe Admin/User projections, тести anonymous/user/admin та відсутності auth-полів у списку й target endpoint.

### NA-29 — P2: moderation remove змінює тему до перевірки автора, а actor береться з body

- `src/forum/services/forum-moderation.service.ts:removeTopic` спочатку topicsRepo.update(status=REMOVED_BY_MODERATOR), потім перевіряє dto.targetUserId === topic.authorId. Лише після цього пише moderation log/надсилає push. Немає transaction, що відкотила б перший write при помилці.
- **Оригінальний removeTopic із synthetic repo:** неправильний targetUserId → TARGET_USER_DOES_NOT_MATCH_TOPIC_AUTHOR, але topicWritesBeforeRejection=1, статус уже removed. Жодних справжніх тем/пушів не змінювали. Адмін бачить відмову, а тема вже прихована без відповідного нового log/push.
- Controller admin-jwt є; це не анонімна модерація. Однак moderationRemovedByAdminId передає клієнт; service записує його як moderatorId без звірки з authenticated admin. Чинний адмін може приписати дію іншому адміну. Live frontend ModerationRemoveTopicDialog/ModerationRemoveCommentDialog передають adminId, backend має визначати його сам.
- Рекомендація: усі перевірки до write; topic mutation і audit log атомарно, зовнішній push після commit з явною retry політикою; actor із principal. Тести invalid target → zero writes, failure audit → rollback, spoofed actor і нормальна модерація. Не змінювати черговість/схему без цього ранкового рішення.

### NA-30 — P2: filename з імпортованої бази виходить за каталог медіа при видаленні

- `diary-front/utils/files/entryMedia.ts:194 deletePrivateStoredMedia` конкатенує dir + filename/thumbnailFilename без перевірки basename/containment. Аналогічно `outcomeHandleImage.ts:68 deletePrivateStoredImages`. Живий шлях: Today delete → getEntryWithRelationsTx → metadata з entry_media/entry_images → cleanup; також media library та dialog cleanup.
- Backup restore приймає SQLCipher snapshot із правильним паролем/ключем, робить quick_check та rewriteImportedMediaRoots, але не перевіряє ці filename. Merge копіює row values; replace залишає metadata snapshot. Звичайні створені застосунком вкладення мають згенеровані імена: передумова атаки — свідомий імпорт користувачем підготовленої сторонньої/зміненої копії, не віддалена зміна звичайного запису через API.
- **Оригінальний deletePrivateStoredMedia у VM із mock FileSystem**: filename `../../../SQLite/nemory.db` породив delete URI, що нормалізується до бази поточного vault; thumbnailFilename аналогічно до entry-backgrounds. Реальних filesystem operations=0. Native legacy Expo deleteAsync передає file URI у FileUtils.forceDelete після загальної permission перевірки; межа саме media-directory тут не реалізована. Повний native сценарій видалення DB не запускався, фактичне пошкодження на телефоні не стверджуємо.
- Рекомендація: спільна перевірка імен і нормалізованого шляху в read/write/delete media helpers + перевірка imported metadata до активації. Відхиляти separators, dot segments, absolute paths; зберегти сумісні легальні старі імена. Тести synthetic traversal у filename/thumbnailFilename/mediaId, відсутність file calls поза root, нормальне видалення. Не плутати з ZIP traversal: native unzip має окрему canonical-path перевірку.

### NA-31 — P2: конкурентне зняття реакції двічі зменшує лічильник

- `forum-reactions.service.ts:toggleReaction`: transaction читає existing без lock, виконує delete(existing.id), і незалежно від delete.affected декрементує topic/comment count. При двох одночасних зняттях обидві транзакції можуть прочитати ту саму реакцію; друга DELETE видалить 0 rows, але count зменшиться ще раз. Transaction сама по собі не серіалізує попередній SELECT при звичайному READ COMMITTED.
- **Оригінальний метод із synthetic manager та barrier двох читань:** initialCount=2, deleteAffected=[1,0], storedCount=0, remainingReactionRows=1. Реальних DB/API writes=0. Це контрольоване відтворення логіки конкурентного interleaving, не навантажувальний тест PostgreSQL.
- UI зараз надсилає LIKE; повторні паралельні запити з двох клієнтів/повтору транспорту достатні. Unique(user,targetType,targetId) захищає insert від дубля, але не цю delete-гілку. Вплив — неправильний count, не подвійне списання чи доступ до чужих даних.
- Рекомендація: декремент лише при affected=1 або серіалізація toggle за target/user; перевірити очікувану семантику повтору. Тест конкурентного remove із реакцією іншого користувача, rollback insert conflict, topics/comments. Не змінювати UI в межах аудиту.

### NA-32 — P2: відкритий AI socket приймає нові запити після закінчення JWT

- AiGateway.handleConnection перевіряє JWT тільки при підключенні та записує payload у client.user. PlanGuard для кожного WS message читає client.user.id і перевіряє користувача/план/баланс, але не exp JWT. Timer/перевірки строку для нових повідомлень у переглянутому gateway немає.
- **Оригінальні handleConnection + canActivate в ізоляції**, JWT підписаний лише synthetic ключем з TTL1s; clock пересунуто на2s: нова jwt.verify відхиляє TokenExpiredError, існуючий socket допускає нове повідомлення через mocked valid plan. handshake verify calls=1, реальна мережа/AI=0. Це не обходить баланс або факт існування користувача; ці gates залишаються.
- Передумова — чинний JWT на момент встановлення socket (зокрема викрадений). Після expiry клієнт може зберігати канал і надсилати нові платні AI запити, поки інші gates дозволяють. Не стверджуємо, що refresh/revoke HTTP миттєво анулює access JWT: чинна HTTP strategy також stateless, але принаймні перевіряє expiry.
- Рекомендація: спільна WS auth-перевірка для **початку нового** запиту + узгоджене оновлення токена/перепідключення. Уже дозволену відповідь не переривати тільки через сплив JWT посеред генерації. Тести: expired token/new message denied; current token allowed; in-flight response завершується; client refresh/reconnect сумісний із попереднім release.

### NA-33 — P2: після успішного списання й збою фінального save згенероване зображення недоступне

- ImageGenerationService.generate:215–219 зберігає encrypted image у generation_billing_pending, викликає charge, потім окремим save змінює статус на generated. Якщо charge завершився, а останній save впав, DB лишається pending. result повертає тільки status без image; повтор generate з тим самим ID повертає result і не виконує recovery. Інших live writers/reconciliation для generation_billing_pending у src не знайдено.
- **Оригінальні generate/result із synthetic repo, що копіює persisted rows:** providerCalls=1, successfulCharges=1, другий save кидає transient error; retryStatus=generation_billing_pending, retryContainsImage=false. Реальні provider, credits, DB не викликались. Картинка лишається зашифрованою у DB — не заявляємо, що її байти втрачено; клієнту вона недоступна.
- Існуючий тест навмисно забороняє повторювати невизначене списання/provider — це правильний захист від дубля. Проблема в незавершеній reconciliation після **вже підтвердженого** debit, а не потребі повторної генерації. Рекомендація: звірка billing ledger за request ID та ідемпотентне завершення status; якщо debit не підтверджений — керований recovery без нового paid provider call. Тест збоїв перед/після debit і final save, restart, рівно одне списання/генерація.

- Уточнення після читання docs/image-generation.md: manual operator reconciliation для generation_billing_pending уже документована як свідомий захист від повторного списання. Отже це **відоме операційне обмеження recovery**, а не доведена нова регресія чи відсутність задуманої обробки. Для ранкового розбору потрібна працездатна процедура звірки/відновлення, автоматизація — лише окреме рішення.

### NA-34 — P2: конкурентні списання старого тарифу гублять частину використаних кредитів

- Живий compatibility шлях SubscriptionUsageService.recordAiUsage для subscriptionRuntime != V2 та наявного legacyPlan викликає PlansService.calculateCredits (plans.service.ts:952). Метод читає usedCredits/inputUsedCredits/outputUsedCredits, додає поточну вартість і save-ить цілий snapshot без lock/atomic increment. V2 має інший транзакційний облік; не переносимо цей висновок автоматично на V2.
- **Оригінальний calculateCredits, synthetic repository + barrier двох читань:** початково 100, паралельні вартості 30 і 70; очікувано 200, збережено 170. Реальних DB/API/provider calls=0. Перевіряє lost-update interleaving, не навантажує PostgreSQL.
- Передумова: живий користувач legacy runtime та дві завершені AI операції одночасно. Поточний recordAiUsage не серіалізує цей шлях; HTTP/WS/provider stages можуть перекриватися. Втрачається облік витрат сервісу; це окремо від NA-20 (допуск кількох запитів на один баланс).
- Рекомендація: атомарне збільшення всіх трьох counters або row-lock у спільній транзакції та узгоджений snapshot для syncLegacyPlanToUserPlanState; зберегти backward compatibility. Тест двох одночасних debit, помилки save/rollback і послідовних legacy/V2 запитів. Код не змінено.

### NA-35 — P2: заборона писати у спільноті не перевіряється при редагуванні

- createTopic/createComment викликають ForumUserRestrictionsService.assertCanWrite, а updateTopic (:500) і updateComment (:644) — ні. Їхні PATCH routes захищені звичайним JWT; ownership/status/topic-lock перевірки є. moderateOrThrow виконує content/rate/duplicate checks, але не читає user restrictions.
- **Оригінальний updateComment із synthetic repositories:** assertCanWrite налаштований кидати READ_ONLY; метод його не викликав (0 checks), пройшов content moderation і виконав 1 mock update. Реальних writes/provider/Telegram=0. Topic path перевірений по коду. Живі UI: EditCommentModal та edit-topic/EditTopic.
- Передумова — уже наявний власний опублікований коментар/тема та чинне READ_ONLY/ban обмеження. Користувач може продовжувати змінювати публічний текст; це не bypass content moderation чи ownership.
- Рекомендація: узгодити спільний write gate для створення й редагування; власне видалення розглянути окремо як дозволений cleanup. Тести active restriction/edit denied до provider/write, expired restriction/edit allowed, чужий author denied. Приватні повідомлення теж не мають sender restriction gate, але активного frontend consumer не знайдено — не видаємо це за перевірений користувацький сценарій.

### NA-36 — P1: збій Telegram після скарги може завершити backend process

- ForumReportsService.createReport (:143) запускає void sendForumReportsTelegram без await/catch. send-telegram.ts:35 повертає axios.post rejection; global unhandledRejection handler у src не знайдений.
- **Оригінальний createReport у disposable дочірньому Node v22.23.1**, усі repositories synthetic, transport навмисно rejected: report promise fulfilled=true, потім childExitCode=1, survival marker не виконався. Реальних DB writes/network/Telegram=0, запущений backend не зупинявся. Тест перевіряє default Node behavior; NODE_OPTIONS/версія production не оглянуті.
- Реальна передумова — помилка Telegram/мережі/конфігурації під час звичайної скарги. Це може обірвати сторонні in-flight requests всього процесу; не потрібні адміністраторські права. Не стверджуємо фактичного production crash за відсутності його журналу.
- Рекомендація: явний bounded notification error handling або чинний спільний delivery/outbox flow після commit; збій оповіщення не повинен відміняти збережену скаргу чи падати unhandled. Тести rejected transport, успішний report commit, контрольований retry без дублювання. Окремо інші await Telegram всередині topic/comment transactions можуть затримати/відкотити публікацію — не тестували зовнішні збої реально.

- **OP-01 / P2, підтверджений конфіг:** AppModule:75 має synchronize:true без production condition. Workflow перед restart запускає migrations, але startup після них знову автоматично синхронізує entities; CLI data-source.ts має synchronize:false, що не змінює AppModule. Ризик неконтрольованої зміни/втрати schema data при наступній зміні entity, не доказ уже втраченої БД. [TypeORM прямо застерігає від synchronize у production](https://typeorm.io/docs/data-source/data-source-options/). Ранкове рішення: production migrations only; перед зміною перевірити повноту міграцій на копії, не вимикати навмання.
- **OP-02 / P2, deployment boundary не перевірений:** production DB SSL у AppModule:70 та CLI data-source.ts задає rejectUnauthorized:false. TLS шифрує, але серверний сертифікат не автентифікується належним чином; MITM потребує мережевого доступу до DB-з'єднання. Не стверджуємо plaintext або фактичний MITM. Налаштувати довірений CA/hostname відповідно до реального DB hosting. [node-postgres передає ssl у Node TLS і підтримує CA](https://node-postgres.com/features/ssl).
- **OP-03 / P2, підтверджений workflow:** package.json test:ci лише echo "no tests"; npm run verify через нього не виконує Jest. .github/workflows/deploy.yml робить install/build/migrations/restart без Jest; status має `|| true`, health endpoint readiness не перевіряється. Green workflow не доводить виконання регресій або живий API після restart. Рекомендація: потрібний невеликий стабільний CI набір (auth/billing/data ownership) і read-only health check; не весь повільний suite кожного разу без потреби.
- **OPT-01, кандидат без EXPLAIN/benchmark:** logs.service.ts:262 шукає сторінки збігів через correlated COUNT попередніх rows для кожного matching log; на частому searchTerm може множити роботу. Вхідні значення параметризовані, SQL injection тут не підтверджена. Порівняти з row_number по відфільтрованому user/level набору та індексом (userUuid,ts,id), зберегти номери сторінок. У production дані/план запиту не читали; індекс не додавали.
- **OPT-02:** reply-preview N+1 і небезпечні page sizes описані у NA-19; не рахувати другою окремою знахідкою.
- **OPT-03, потребує вимірювання:** media prepare має 25 MiB upload cap, 10 requests/minute throttle, source pixels/duration bounds та pending uploads cap. Але немає спільної concurrency queue для ffmpeg/ffprobe; кілька upload можуть одночасно утримувати buffers і дочірні процеси. Це не доведений OOM. Перед зміною виміряти peak RSS/CPU на невеликому synthetic workload в окремому процесі; розглянути bounded worker queue, зберігши достатній час обробки легального відео. Не прибирати існуючі format/protocol safeguards.
- **Не знайдено небезпечного dynamic SQL у вузькому AST проході:** live interpolated clauses logs/cleanup/users складаються із внутрішніх alias/column/placeholder; client values передаються параметрами. Це не сертифікація всіх SQL paths. Migrations із table interpolation мають внутрішні константи, не user input.
- Nodemailer 7.0.5 встановлений і старий, але live import/consumer у src не знайдений; не заявляємо досяжний email exploit лише за наявністю пакета.
- MediaProcessor.run додає format whitelist як для ffmpeg, так і ffprobe; protocol whitelist file,pipe, execFile без shell, один thread та 300s timeout. Попереднє припущення, що ffprobe запускається без format whitelist, відкинуте після читання спільного run helper.


### Позитивні та середовищні результати

- Секрети Redis не друкували; REDIS_URL в локальній конфігурації також loopback.
- Sandbox забороняв localhost socket (EACCES); після дозволеної ескалації запити успішні. Це не збій backend.
- Код production не змінено; пошук/refund flags/runtime процеси не перезапускалися.
- Існуючі suites registration-ownership, sessions.service, user-deletion-access, profile-update-access, settings-update-access, logs-read-access: **6 suites / 213 tests PASS**. Лог synthetic database failure очікуваний у тесті помилки збереження. Перший запуск не почав тести через EPERM кешу sandbox; повтор із дозволеною ескалацією пройшов. Жодного AppModule/реальної БД ці suites не запускали.

### Додаткова перевірка платежів і AI guard

- 7 suites / 95 tests PASS: credit-purchases, terminal-state, refund-reconciliation, wallet, ai-credit-cycle, plan.guard, iap.controller. Усі Google/DB boundaries mock; це не production refund test.
- Важливе обмеження: один iap.controller test закріплює swallowing V2 error (NA-13). Загальний PASS не спростовує знайдений дефект.
- Позитивно: credit grant перевіряє verified obfuscated account ID, відмовляє без binding, не присвоює покупку іншому user; row locks та idempotency збережені. Термінальний refund/cancel не перетирається consume-success у перевірених сценаріях.
- Позитивно: media replay перевіряє authenticated AAD scope/user/id і ownership; arbitrary paid transcript підставити звичайним JSON не можна. Не вважаємо MIME mismatch сам по собі доведеним SSRF.
- Кандидат наступного проходу: concurrent affordability admissions читають один баланс до accounting; перевірити consumer/concurrency boundaries перед висновком про перевитрату.

## Операційні ризики й оптимізації — окремо від експлуатованих вразливостей

### Позитивні перевірки та питання політики

- **OPT-04, масштабування першого запуску:** users.service.ts:274 усередині створення анонімного User викликає markAllExistingTopicsAsReadForNewUser. Метод завантажує всі PUBLISHED topics і одним upsert створює read-state на кожну тему. Час/пам'ять/кількість записів ростуть як кількість тем на кожного нового користувача; ці дії подовжують registration transaction. Поточний production обсяг не читали, повільний запуск цим не доведений. Розглянути baseline часу вступу як default read-state й explicit rows лише для реально відкритих тем, зі збереженням unread semantics; короткостроково виміряти та chunk upsert. Не переносити просто в background без визначення поведінки unread.
- **Dependency hardening, не додаткові доведені експлойти:** lock/runtime містить axios1.13.2, handlebars4.7.8, qs6.14.0. [Axios advisory](https://github.com/axios/axios/security/advisories/GHSA-fvcv-3m26-pcqx) описує gadget із передумовою окремого prototype pollution; такої передумови у переглянутих live flows не доведено. Axios consumers мають fixed/config URLs (Telegram, FX, SMS), прямого attacker-controlled URL не знайдено. [Handlebars AST injection](https://github.com/handlebars-lang/handlebars.js/security/advisories/GHSA-2w6w-674q-4c4q) стосується compile(untrustedAST); EmailsService компілює string із локального шаблону. Не заявляємо RCE лише за версією. [qs arrayLimit advisory](https://github.com/ljharb/qs/security/advisories/GHSA-6rw7-vpxm-498p) прямо зазначає, що default parameterLimit1000 стримує описаний DoS; завищеної parser-конфігурації не знайдено. Оновлення залежностей потрібне окремим контрольованим завданням із перевіркою consumers; зараз нічого не встановлювали.
- Для NA-30 додатково прочитаний installed Expo FilePermissionService: canonical path перевіряється відносно всього context.filesDir/cacheDir, не окремого vault/media. Тому загальний native permission check не доводить containment у media-folder. Інші apps/OS files цією перевіркою не стають автоматично доступні.

- Frontend: 7 targeted suites (backup/KDF/media, device keys, database key, editor links, refresh). Перший запуск: 57 pass, 16 fail у refreshSession через Jest ESM uuid transform; також warning про duplicate package.json у старій temporary/ папці. Файли конфігурації не змінювались.
- Повторено ЛИШЕ refreshSession з CLI-only transform uuid та ігноруванням temporary/: 15 pass, 1 fail. Залишковий failure: test mockStore тримає user як object, а новий localVault flow читає той самий key через SecureStore й робить JSON.parse, який очікує реальний string. Це fixture mismatch; не доказ account-overwrite. Остаточно **72 frontend tests passed, 1 blocked by fixture**, 7 suites. Backend totals після додаткового проходу: 443 pass / 6 failures, усі шість потребують актуалізації fixtures перед остаточним висновком.

- Frontend access/refresh tokens і device keys зберігаються в SecureStore; звичайний HtmlViewer для common/release notifications використовує react-native-render-html, не WebView. NA-03 не доповнюємо твердженням про JavaScript/XSS через цей native renderer. makeMediaHtml екранує амперсанд і подвійні лапки в src; простий вихід із quoted src не підтверджений.
- PRAGMA key у db/sqlite.ts та utils/account/vaultFiles.ts екранує апострофи. Вміст sqlcipherKey із backup не дає очевидного SQL-statement injection через цей шлях.

- Додатковий запуск 8 suites media/push: **94 passed, 4 failed** (6 suites pass, 2 fail). Сукупно з попередніми 308: **402 passed / 4 failed, 21 suite**. Нових файлів тестів/правок runtime немає; лише Jest cache.
- Чотири failures наразі мають ознаки застарілих mocks, не підтверджених production збоїв: media-cache-usage.spec.ts два варіанти mock лише openai.chat.completions, поточний маршрут Terra викликає openai.responses.create; media-affordability.spec.ts два варіанти не mock getEffectiveAiBasePlanId, який Qwen викликає перед affordability. Тести зупиняються раніше цільової перевірки. Зранку узгодити mocks із чинними flows і повторити; не зараховувати ці чотири як пройдені.
- KMS decrypt контекст містить userId/kver; AES-GCM має AAD та випадковий 12-byte IV. Public crypto/decrypt controller route закоментований. Не підтверджено можливість розшифрувати чужий blob через чинний API.
- Community socket broadcast передає лише порожній сигнал community_changed, не зміст чужих повідомлень; при підключенні JWT перевіряється. Відсутність room-per-user сама по собі не є витоком повідомлень у цьому gateway.
- Email OTP має crypto.randomInt, server-side HMAC, атомарний Lua verify/delete і 5 спроб; не заявляємо необмежений перебір коду. Subject keys нормалізують email. Public email test sender закоментований.
- Context audit з повним текстом увімкнений тільки NODE_ENV=development; його chunks мають caps/TTL. Production full-context dump цим механізмом не підтверджений.
- Кандидат для продуктового рішення: inactivity cleanup виключає чинну платну підписку, але не позитивний purchased-credit wallet; CASCADE видаляє wallet/purchases/ledger разом з User. Потрібно звірити обіцянку збереження куплених кредитів і умови видалення, перш ніж називати це порушенням. Не змінювати policy самостійно.

### Додаткові scheduler/gateway/anonymous suites

- 7 suites: 41 PASS / 2 FAIL (6 suites pass, 1 fail): anonymous-creation-atomic, ai.gateway, conversation.gateway, inactivity-cleanup.deletion, logs.cron.service, ai-response-monitoring.cron.service, periodic-analysis.gateway. Сукупно backend: **443 passed / 6 failed, 28 suites**. Реальні DB/email/provider boundaries не викликались.
- Два failures periodic-analysis.gateway стосуються очікуваного списку аргументів: чинний виклик додає false/false/false для capability прапорців imageGenerationSupported/imageReferencesSupported/imageActionsSupported. Власне перевірювані creation timestamps, commitments та media-only question збережені. Це assertion drift, не підтверджена втрата period context. Файли тестів не змінювалися.

### Додаткові frontend auth/media suites

- 6 suites: 37 tests PASS у 5 suites (registrationSession, registrationIdentity, mediaLibraryRepo, aiMediaReplayBackup, aiMediaLocalCache); pinSetup suite не стартував через installed Reanimated mock → getUIRuntimeHolder is not a function у react-native-worklets. Це збій test environment, не доказ зламаного PIN на телефоні. Нічого не підміняли/не встановлювали. Сукупно frontend: **109 passed, 1 failed assertion fixture, 1 suite blocked before tests; 13 suites attempted**.

### Відсіяні/уточнені кандидати другого проходу

- deepmerge4.3.1 на synthetic JSON із __proto__/constructor.prototype не забруднює Object.prototype; такої prototype-pollution передумови для Axios advisory цим шляхом не підтверджено.
- /admin/forum/ai-moderation-results має той самий user-jwt/admin-jwt розрив, що NA-28. Controller реально зареєстрований, але поточного writer/живого frontend consumer для цієї старої таблиці не знайдено. Включити до одного guard cleanup, не трактувати як окремий доведений витік актуальних повідомлень.
- Public logs ingest потрібний для pre-auth diagnostics; сам факт відсутності JWT не дефект. Але source=backend та userId/userUuid зараз caller-supplied без позначки unverified: у ранковій hardening-рекомендації відокремити server origin/authenticated identity від клієнтських тверджень, зберігши pre-auth збір. Не використовувати такі поля як доказ без незалежного request/server trace.

### Subscription/shared accounting та HTTP parsing — додатковий прохід

- 4 suites: subscriptions.service, subscription-usage.service, response-billing.integration, configure-body-parsers. Перший запуск: 117 PASS, 4 assertion failures у billing та 7 sandbox EACCES у loopback HTTP. Повторено лише configure-body-parsers з дозволеним loopback: **7 PASS**. AppModule/БД/зовнішні providers не запускались. Сукупно backend: **567 PASS / 10 FAIL, 32 suites**.
- Чотири billing failures — очікування старого provider timeout180000 замість чинного600000 для image generate/edit, у legacy/V2. No retry та provider arguments загалом відповідають. Не змінюємо прийнятий timeout заради проходження старого assertion; billing assertions після цього місця не зараховуємо автоматично.
- Frontend production DB key: __DEV__ відокремлює dev passphrase; release використовує random32bytes + SecureStore, існуюча DB без ключа завершується явною помилкою, не створює новий ключ поверх. Відсутність ключа не трактується як порожня база.

### NA-37 — P1: legacy subscribe дозволяє повторний trial поза V2 eligibility та довільний строк

- Живий POST /plans/subscribe (PlansController:24) перевіряє JWT та лише basePlanId=START. CreatePlanDto дозволяє клієнтські startTime/expiryTime/planStatus. PlansService.subscribePlan (:53) відмовляє START тільки якщо є legacy Plan rows; usesWithoutSubscription і вже використаний V2 trial не перевіряє. Новий Plan отримує spread DTO, серверний ліміт5000 і actual=true.
- Передумова — власний автентифікований користувач без legacy Plan history. Такий стан передбачений returning install (UsersService:315 створює legacy trial тільки isFirstInstall) або V2-only history. Чинний V2 startTrial окремо забороняє usesWithoutSubscription/hasUsedTrial, але legacy route його не викликає.
- **Оригінальний subscribePlan із synthetic manager:** користувач usesWithoutSubscription=true, history=[], expiryTime=2099-01-01 → прийнято, створено mock trial5000, дата2099 збережена, викликано V2 sync. Реальних DB/provider writes=0. Sync mapper та deriveEffectiveAccessReason перевірені по коду: переносять строк і trial credits; прапорець useWithoutSubscription не блокує вже сформований TRIAL. Повний HTTP+реальна БД не запускались.
- Це не необмежені кредити: серверний ліміт5000 зберігається, повтор для того самого користувача після появи legacy history відхиляється. Але можливе отримання не дозволеного trial та подовження його строку. Чинного frontend виклику /plans/subscribe не знайдено; route залишається зареєстрований для сумісності.
- Рекомендація: legacy adapter має використовувати спільну серверну trial eligibility/дати, зберігши підтримку старих клієнтів; не приймати store fields у public trial path. Тести returning install denied, V2 used trial denied, legitimate first install allowed exactly once, client expiry/status ignored/rejected, paid plan path still IAP-only.

### Frontend vault / notification / password checks — наступний прохід

- vaultMerge:13 PASS; backgroundNotificationTask, reconcileNotificationQueue, habitNotificationDay, useNotificationListeners:63 PASS. Парольні форми спершу блокував ESM react-redux; повторено лише цей suite з CLI transform,5 PASS. Репозиторні Jest config/tests не змінені. Сукупно frontend: **190 PASS,1 fixture assertion failure,1 suite blocked (pinSetup);19 suites attempted**.
- Підозра на вічний loader у ForgotPinModal COOLDOWN-гілці не підтверджена для чинного API: checkCodeForResetPin повертає true або кидає HTTP error; COOLDOWN повертає інший send-code route. У catch loader очищається. Не рахуємо недосяжну гілку як підтверджений користувацький баг.

### NA-38 — P2: збій системного cleanup/reload при виході залишає глобальне блокування

- Frontend utils/account/switchAccountVault.ts:149, restartAccountRuntime: freezeLocalVault + globalBlockingLoader.show, потім послідовні cancelAllScheduledNotificationsAsync/dismissAllNotificationsAsync/closeDb/reloadAppAsync без recovery. Live consumers: LogoutModal.finishLogout, saveAuthenticatedSession, deleteAccount, importPendingGuestData.
- LogoutModal при rejection лише журналює помилку; токени на цей момент уже очищені. У committed account/import flows повернення старого UI навмисно заборонене, але recovery UI/retry restart для цього збою відсутні.
- **Оригінальна функція в ізольованому VM:** окремі mocked rejection на кожному з4 кроків → promise rejected, frozen=true,loader=true; на cancel/dismiss/close до reload не доходить. Реальних notification/DB/phone дій=0. Фактичний збій OS на телефоні не відтворювався.
- Наслідок: при такій помилці потрібне ручне закриття/відкриття застосунку. Не знімати freeze навмання після зміни credentials: це захист від змішування акаунтів. Рекомендація — явний recovery state з повтором завершення переходу; розділити безпечні cleanup failures і критичні DB/session failures. Тести cancel/dismiss/close/reload rejection, збереження account boundary, можливість повтору/наступного запуску.

### Додаткові уточнення без роздування критичних знахідок

- Парольні register/reset/change використовують raw bcrypt і regex без max-byte bound. На встановленому bcryptjs synthetic два валідні різні паролі з однаковими першими72 UTF-8bytes і різними суфіксами порівнюються успішно. Це відома межа bcrypt, а не доведений злам звичайного короткого пароля; атакувальник усе одно має знати довгий префікс. Hardening/P3: чесне byte-limit повідомлення або сумісна versioned міграція схеми, не мовчазна заміна hashing для чинних користувачів. Refresh tokens мають SHA256 prehash перед bcrypt, тому до них цей висновок не застосовується.
- TextReachEditor дозволяє file access/universal file URL access для локальних медіа (2594–2600). Це збільшує важливість NA-25, але sandbox/native file-read/exfiltration на пристрої не тестували. handleEditorMessageBase передає лише selection state; довільний native file command через цей bridge не підтверджений.
- Media status/export/ack/delete фільтрують userId; replay restore перевіряє crypto authenticated AAD scope/uid та payload id/userId. Доказу читання/видалення чужого медіа лише за UUID не знайдено.

### Контрольні підсумки додаткового проходу

- Backend ще5 suites /38 PASS: auth.service, subscription-legacy.mapper, effective-ai-access, google-play-subscriptions.service, google-play-payment-finance.service. Google/DB mocks; warning financial details pending retry очікуваний synthetic scenario. Сукупно: **605 PASS /10 assertion-fixture failures,37 suites**.
- Frontend switchAccountVault ще13 PASS. Сукупно: **203 PASS /1 fixture assertion failure /1 suite blocked before tests,20 suites attempted**. Цей suite перевіряє preparation/commit; чотири failure branches NA-38 перевірені окремим original-function VM, не покриті цими13 assertions.
- Для NA-37 додатково виконані реальні class-transformer/class-validator CreatePlanDto: валідні решта поля + expiryTime2099 → errors=[]; AppModule не імпортований, БД не підключалась.
- Розширення NA-09/resource budget: public user/diary statistics accepts arbitrary date span через inline body без DTO range validation. fillMissingBuckets генерує всі порожні дні синхронно, diary query використовує generate_series навіть без rows. Bounded original-helper synthetic check:365 днів→365rows/23ms,3653дні→3653rows/102ms на локальному Node; це не production benchmark/не доведений OOM. Великі інтервали не запускались. При закритті admin routes додати перевірку дат/granularity та бюджет buckets/агрегацію довгих періодів, не довільний короткий timeout.

### NA-39 — P2: помилка історії embeddings втрачає вже оплачений результат

- Backend src/ai/embeddings/embedding-batch.service.ts:358–424: після відповіді provider і recordAiUsage виконується addTokenUserHistory; лише потім cache write та resolve. Rejection історії потрапляє в job.reject, inFlight очищається, отриманий vector не повертається і не кешується.
- Оригінальні generate/getCachedOrEnqueue/processBatch/runWithConcurrency у VM із synthetic provider/billing/Redis: перша history-write помилка, потім повтор того самого запиту → firstError=synthetic history unavailable, secondReturned=true, providerCalls=2, debits=2, historyCalls=2, cacheWrites=1. Реальних provider/DB викликів=0. recordV2Usage перевіряє cycle, але не дедуплікує за requestId.
- Це не подвійне списання за одну provider-відповідь: повтор справді виконує нову платну роботу, бо перший результат втрачено через допоміжну історію. Live frontend generateEmbeddingsApi передає помилку; entry-embedding.service ловить її без відмови локального Save, а створення AI-контексту може продовжитися без vectors/схожих записів. Автоматичного безумовного retry на HTTP500 у цьому adapter не знайдено; повторне списання потребує наступного виклику.
- Рекомендація: визначити спільну гарантію paid-result/accounting/history, зберігати результат для відновлення після post-provider failure; допоміжна діагностика не має втрачати оплачену відповідь. Не ігнорувати помилки власне billing. Тести: history failure після debit; повтор повертає збережений результат без нових provider/debit; billing failure не видає безкоштовний успіх; user-scoped cache ізольований.
- Існуючий embedding-batch suite:6 PASS; failure-after-debit сценарій ним не покритий. Оновлений backend підсумок: **611 PASS /10 assertion-fixture failures,38 suites**.

### OPT-05 / P3: тимчасові медіаархіви не очищаються на error paths

- Frontend utils/files/backup.ts:createImagesBackupArchive/restoreImagesFromArchive, live Backup.tsx:196/219. Cleanup розташований лише після успішного share/import; outer catch повторно кидає помилку. Після Sharing rejection або preflight mediaConflict тимчасовий ZIP/розпакована папка залишаються у documentDirectory, за межами account vault.
- Оригінальні функції + synthetic FileSystem Map: обидва сценарії → cleanupCalls=0, temporaryFilesRemaining=1. Реальних файлових операцій/медіа=0. Залишки можуть накопичуватися при повторних спробах; account-vault cleanup сам по собі їх не охоплює. Це приватна app directory, не доказ доступу інших застосунків або мережевого витоку.
- Рекомендація: cleanup у finally для transient archive/tempRoot і контрольований startup cleanup лише власних тимчасових файлів; не видаляти обраний користувачем оригінальний архів. Мінімальні тести: share rejection, import conflict, unzip failure, successful share/import. Чинні mediaImport success/collision tests пройшли, але залишки не перевіряють.

### Уточнення охоплення NA-10, без нового дубльованого номера

- Ще три активні backend read routes повертають повного User: ForumUserBlocksService.getMyBlockedUsers → blockedUser; ForumNotificationsService.getMyNotifications → actor; ForumMentionsService.getMyMentions → mentionedByUser. У entities relations посилаються на User, response DTO/select projection немає. Оригінальні три методи з synthetic findAndCount повернули uuid/hash/password/email; власний userId filter при цьому правильний. Реальних DB reads=0.
- Чинного frontend consumer для user-blocks/my у перевірених app/components/utils не знайдено; API controller зареєстрований. Це доповнення спільної проблеми проєкції, не три нові експлойти. Під час виправлення NA-10 охопити ці serializers разом із темами, коментарями, bookmarks та private conversations.
- Ще3 backend suites /19 PASS: subscriptions.controller, deferred-credit-cycle, credit-purchase-financial-sync. Google/DB підмінені. Поточний підсумок backend: **630 PASS /10 fixture failures,41 suites**.

### OPT-06 / P2, умовний backlog-сценарій: старі невдалі consume займають увесь batch

- CreditPurchasesService.retryPendingConsumptions:154 відбирає перші50 PURCHASED/consumedAt=null за незмінним createdAt. Помилки зберігає в metadata, але порядок/eligibleAt не змінює. На відміну від financial retry, немає ротації за lastAttemptAt.
- Оригінальний метод із51 synthetic pending rows, перші50 постійно відхиляються Google mock: два ticks→100 attempts,50 unique purchases, row51Attempted=false. Жодних Google/DB операцій. Це умова накопичення50 проблемних покупок, не встановлений стан production і не вплив на звичайну покупку, яка consume успішно одразу.
- Рекомендація: fairness за часом наступної/останньої спроби, backoff для фактичних transient errors і явне опрацювання terminal Google state; не залишати давні проблемні rows назавжди попереду. Не додавати відхилене користувачем опитування всіх покупок на refunds. Тести batch із persistently failed oldest rows + newer pending row та збереження refund terminal status.
- Frontend exportMediaFile:19 PASS; перевіряє збереження оригіналу, cleanup лише нової неповної копії, перевірку її розміру і permission failures. Оновлений frontend підсумок: **222 PASS /1 fixture assertion failure /1 blocked suite,21 suites attempted**.

### OP-04 / P2: частина Google Play I/O не має application deadline

- GooglePlayCreditPurchasesService.verify у звичайному purchase/retry path передає requestOptions=undefined; consume взагалі не передає options. GooglePlaySubscriptionsService.verifyAndroidSubscription так само без timeout/signal. Спільного google.options timeout у src не знайдено. У встановленому gaxios timeoutSignal створюється лише за opts.timeout; це перевірка локальної реалізації, не фактичний завислий Google запит.
- Мережева помилка зазвичай відхилить promise, але з'єднання без завершеної відповіді може тримати backend operation довше за frontend timeout. Для послідовного consume batch це затримує наступні rows; для покупки grant уже може бути закомічений до очікування consume, а відповідь клієнту ще не надійшла. Не стверджуємо нескінченність усіх socket states: transport/OS теж мають власні механізми.
- Рекомендація на окрему правку: достатній deadline зовнішнього store I/O, наприклад30–60s після узгодження з ретраями, з durable pending/reconciliation станом та ідемпотентним повтором. Це запобіжник для зовнішньої відповіді, не коротка UI-відсічка2–3s. Наявні financial calls уже мають5s; зараз їх не змінювали. Тестувати stalled mock/abort і повтор без подвійного grant; реальний Google/network outage не створювали.

### OPT-07: пошук повністю перебудовує FTS після будь-якої зміни source table

- Frontend db/repo/app-search/app-search.repo.ts:prepare і live SearchScreen.tsx:143. За revision mismatch читає всі source rows, DELETE усі FTS rows та inserts кожен search document у спільній inTx/withDbLock. Це коректно інвалідує edits/deletes, але вартість наступного пошуку залежить від усього журналу, навіть після редагування одного запису.
- Це кандидат профілювання на великому synthetic vault, не встановлена причина телефонних ривків. Розглянути incremental dirty-entity queue/FTS updates лише після вимірювання, зберегти owner checks, derived connection-local index і очищення при restore/switch. Не переносити приватний search index у незахищене глобальне сховище.
- Позитивно: текст запиту токенізується як слова/цифри і передається FTS через parameter; dynamic table/columns/operations внутрішні константи. Доказу SQL/FTS operator injection у цьому consumer не знайдено.

### Уточнення NA-26: приватні SQLite params також потрапляють у діагностику

- diary-front/db/sqlite.ts:run/getAll error paths журналюють sql+params; db/sql-errors.ts також додає ctx до dbErr. logging/setupGlobalErrorHandlers.ts:46 передає console.error args у eventLog і crashLog без redaction. Live app/_layout.tsx → rootRuntimeEffects встановлює handlers у runtime.
- Оригінальні setupGlobalErrorHandlers і serializeBreadcrumbData/formatBreadcrumb, synthetic SQLITE_FULL + INSERT parameters → telemetryContainsPrivateMarker=true, crashBreadcrumbContainsPrivateMarker=true. Реальних журналів/мережі=0. Crashlytics serializer обрізає довгі рядки, але не прибирає зміст; це не гарантія приватності. Фактичну доставку/зберігання в Crashlytics не перевіряли.
- Під час виправлення NA-26 охопити не тільки HTTP request bodies, а й SQL params, nested errors та загальний console capture. Успішний logDbSuccess уже використовує sqlSig/paramCount без values — придатний чинний приклад для безпечної діагностики.
- Для OPT-05 перевірено cold-start cleanup: cleanupCache.ts прибирає лише3 cache picker/manipulator folders, не documentDirectory/nemory_images_* залишки.
- appSearch:8 PASS на in-memory SQLite, без phone DB. Frontend підсумок: **230 PASS /1 fixture assertion failure /1 blocked suite,22 suites attempted**.
- Вузький AST-прохід db services на вкладені transaction-wrapper calls не підтвердив deadlock у знайдених8 місцях: існуючий db передається до repo, і repo не бере global lock повторно. Це не вичерпний доказ для всього call graph.
- Уточнення OP-03: workflow довіряє host key, отриманому ssh-keyscan у тому самому запуску; StrictHostKeyChecking=yes перевіряє вже цей щойно прийнятий ключ. Для захисту від MITM під час первинного scan потрібен попередньо перевірений fingerprint/known_hosts. Атаку/productionSSH не перевіряли, секрети не читали.

## Додаткова перевірка статистики — 29.10, ніч

- `diary-stat-ai-input.spec.ts` + `user-activity-records.spec.ts`: **27 PASS**, два ізольовані suites; repositories mocked, реальна БД не змінювалася.
- Підтверджено owner/trace/operation isolation, збереження AI=true при запізнілому false, повторне створення та компактний формат статистики. `planner-statistics.service.ts` використовує параметризовані SQL та ON CONFLICT; DTO обмежує type й довжину entityId. Нової SQL injection тут не знайдено.
- Актуальний підсумок backend: **657 PASS / 10 fixture failures / 43 suites**. Frontend без змін: **230 PASS / 1 fixture failure / 1 blocked suite / 22 attempted suites**.
- Додатково: model-review controller має admin-jwt; email test route закоментований; health повертає лише status, не секрети. Community gateway відправляє порожній community_changed, тому його довга socket-сесія сама по собі не доводить витік приватного вмісту.

## Зовнішні посилання / межа редактора — нічний прохід

- `AiResponseText`/`responseMarkdown`: MarkdownIt html=false; нативний render, allowlist http/https/mailto; model-supplied images не завантажуються. WebView editor bridge у перевірених Title/Text обробниках керує selection/layout/media-estimate/readiness, не надає довільний метод читання SecureStore чи виконання native-команд. Це уточнює межі NA-25, не спростовує JavaScript у WebView.
- `HtmlViewer` для common/release повідомлень передає href у Linking.openURL без allowlist/catch. Потребує натискання користувача; не називаємо це доведеним автоматичним XSS чи account takeover. Варто використати спільний безпечний відкривач при усуненні NA-03; основна проблема там — відкриті backend write routes.
- Нові suites: `AiResponseText.test.js`, `apiRequestDispatch.test.js`, `patchExpoRouterInitialLink.test.js`: **33 PASS, 1 fixture failure** (`getUIRuntimeHolder` у Reanimated mock при імпорті EntryConversation). Installed router тест читав код і виконував patched string у VM; файли router не змінював.
- Актуально frontend: **263 PASS / 2 fixture failures / 1 blocked suite / 25 attempted suites**. Backend: **657 PASS / 10 fixture failures / 43 suites**. Це автоматизовані синтетичні перевірки, не ручне прийняття на телефоні.

### Уточнення NA-36: Telegram також змінює результат користувацького редагування

- `forum-topics.service.ts:updateTopic` і `forum-comments.service.ts:updateComment` спочатку виконують repository.update, потім await sendForumFeedTelegram без catch, і тільки потім читають/повертають успішний результат. При збої Telegram БД вже змінена, але HTTP завершується помилкою.
- Оригінальні методи, виділені TypeScript AST і виконані у VM з mock repositories/transport: для обох `writes=1, alertCalls=1, readsAfterWrite=0, failure=synthetic alert unavailable`. Реальних записів БД і зовнішніх запитів 0.
- Під час створення теми/коментаря той самий await знаходиться **всередині transaction callback**. Це інший результат: Telegram rejection може відкотити створення; у коментаря push/community event уже викликаються до завершення транзакції. Ця частина підтверджена читанням послідовності коду; реальний rollback/push не запускався. Не заявляємо збереження нового коментаря після rollback.
- Рекомендація: відокремити адміністративні сповіщення від результату запису; outbox після commit для подій, що не повинні загубитися; достатній timeout/catch на зовнішній транспорт. Не приховувати помилки самої БД. Перевірки: Telegram недоступний при create/update; результат і БД узгоджені, push лише для committed сутності, відхилена promise не валить процес.

### OPT-08 — кандидат: пікова пам’ять створення великої резервної копії

- `diary-front/db/backup/backup.service.ts:createEncryptedBackup` одночасно працює з dbBase64, base64 архіву фонів, JSON innerPayload, CryptoJS WordArray/ciphertext та зовнішнім backupJson. Це кілька повних представлень даних, без потокового шифрування/експорту.
- Висновок лише за кодом: витрати пам’яті ростуть із розміром бази й власних фонів. **Не доведено**, що це спричинило попереднє native-падіння на телефоні; його не переатрибутовуємо. Немає штучного OOM чи великого тестового запису в реальну базу.
- Перед оптимізацією виміряти пікову пам’ять release-збірки на окремому синтетичному vault; розглянути native/streaming snapshot+encryption із backward-compatible читанням старих .nbak, якщо проблема підтвердиться. Не вводити довільну малу межу розміру.
- Додатковий кандидат для такого ж тесту: export викликає drainDbLock та execAsync wal_checkpoint, але не утримує barrier на весь snapshot і не читає busy-результат checkpoint, як cloneVault. Потенційна конкуренція з background writes потребує відтворення на реальному SQLite/native file read; **пошкоджену копію цим шляхом не відтворено**, окремою підтвердженою знахідкою не рахуємо.

### Важливе доповнення NA-03 — stored XSS у вебадмінці повідомлень

Це доповнює початковий висновок NA-03: **у нативному HtmlViewer JS не доведений**, але вебспоживач має окремий підтверджений sink.

- `diary-landing/components/admin/notifications/AllCommonNotificationsTable.tsx:52,64` і `AllReleaseNotificationsTable.tsx:51,59` передають translations[].html прямо в dangerouslySetInnerHTML. Живі client routes: `app/(admin)/admin/common-notifications/page.tsx:44` та `release-notifications/page.tsx:82`; common API adapter повертає response JSON без sanitization.
- Backend create DTO приймає html як довільний string; обидва create services записують `html: t.html` без очищення. Відкритий REST write з NA-03 обходить `sanitize-html` редактора адмінки (`components/ui/Editor.tsx`), бо воно виконується лише при авторуванні в UI.
- **Ізольована перевірка двох оригінальних React components:** TypeScript transpile → ReactDOMServer markup → JSDOM без завантаження зовнішніх ресурсів. Synthetic img/onerror, який лише ставить локальний marker, зберіг onerror і виконав його після synthetic error event в обох компонентах. Реальних HTTP, записів повідомлень, доступу до admin session — 0.
- Наслідок: якщо такі дані потрапляють у production і немає окремого CSP, який блокує inline handlers, перегляд адміністратором може виконати сторонній JS у його origin. Це ризик дій із доступами адміністратора; викрадення реального токена/виконання адміндії не тестувалося. Production CSP/nginx не перевіряли; app-level CSP у переглянутих конфігураціях не знайдено.
- Ранкове виправлення NA-03 має включати **і admin auth на backend write, і очищення HTML на довіреній межі/відображенні**, зберігши дозволене форматування. Не обмежуватися sanitization тільки Editor. Regression: direct API payload з onerror/небезпечними URL не виконується при перегляді; нормальні списки/посилання/кольори залишаються; anonymous/user не може створити/видалити повідомлення.

- Ще backend suites `forum-access.service.spec.ts`, `dialog-context.service.spec.ts`: **10 PASS** на mocks. Актуально backend **667 PASS / 10 fixture failures / 45 suites**; frontend **263 PASS / 2 fixture failures / 1 blocked suite / 25 attempted suites**. Синтетичний React/JSDOM proof вище обліковується окремо, не додається як Jest suite.

### Обмеження онлайн-аудиту залежностей фронтенду

- `npm audit --omit=dev --json` у sandbox не отримав DNS-доступ до registry.npmjs.org. Повтор із мережевим дозволом **відхилений automatic approval review**: команда передає метадані залежностей приватного проєкту в публічний registry, на що немає окремої згоди.
- Користувачу поставлено окреме питання про дозвіл; до відповіді онлайн-запит не повторюємо й не обходимо блокування іншим транспортом. Локальний source/reachability аудит триває. Відсутність результату npm audit не означає відсутність уразливостей.

## Додатковий прохід: платежі, налаштування й native backup configuration

- 4 додаткові ізольовані backend suites: subscriptions-migration, credit-purchase-finance, payments.service, shared-response-budget. **23 PASS / 3 FAIL**. Перші три suites пройшли; shared-response-budget у short/normal/detailed рахує 2512 токенів проти test budget 2500. Це не fixture exception: реальна розбіжність із тестовим бюджетом на 12 токенів, без доведеного runtime failure; не змінювати промпт автоматично заради тесту. Long-user-data preservation test проходить.
- Оновлений підсумок backend: **690 PASS / 13 FAIL / 49 suites**. Із 13 failures: 10 попередніх fixture/assertion drift та 3 budget assertions вище. Frontend без змін: 263 PASS / 2 fixture failures / 1 blocked suite / 25 attempted suites.
- Embedding cache key включає userId/model/content digest; in-flight entries очищаються в finally, rate-limit history видаляє застарілих users при перевищенні 10000 tracked users. Окремий cross-user cache leak або необмежене зберігання всіх історичних timestamps не підтверджено.
- AiPreferences controller бере owner із JWT, не з body. Runtime DTO для patch відсутній; довільні значення власних preferences — hardening candidate, але cross-account write / privilege escalation не знайдено. Не додаємо окрему security finding без наслідку.
- Frontend app.config підключає expo-secure-store plugin. У встановлених Android extraction rules SecureStore виключений і з cloud backup, і з device transfer; production merged manifest у workspace відсутній, тому це перевірка конфігурації/залежності, не зібраного APK.

### NA-40 — P2: після часткового збою Redis антиспам-лічильник може залишитися без TTL

- `src/forum-moderation/services/forum-abuse-guard.service.ts:107–118`: incrementWithTtl окремо виконує INCR, а EXPIRE тільки коли результат INCR === 1. Якщо INCR пройшов, але EXPIRE не виконався (розрив з'єднання/перезапуск процесу між командами), ключ залишається без строку дії. Подальші INCR повертають >1 і не ремонтують TTL.
- Живий споживач: ForumModerationService.moderateOrThrow → abuseGuard.checkOrThrow у створенні/редагуванні topics/comments. Catch логує й повторно кидає помилку; очищення такого ключа не знайдено.
- **Ізольовано оригінальні два методи AST/VM:** synthetic Redis успішно INCR і один раз відхиляє EXPIRE. 5 послідовних topic-спроб дали connection error, allowed, allowed, RATE_LIMIT, RATE_LIMIT; expireCalls=1, ключ без expiry. Реальних Redis/DB/HTTP викликів 0.
- Наслідок: за цієї конкретної часткової помилки 10-хвилинне обмеження перетворюється на безстрокове для user/типу контенту, доки ключ не видалений/витіснений/втрачений самим Redis. Не стверджуємо, що це вже сталося в production. Сам нормальний антиспам-ліміт не є дефектом.
- Рекомендація: атомарний INCR+TTL (Lua/transaction із коректним fixed-window semantics) і відновлення legacy ключів з TTL=-1; зберегти policy 3 topics/10 comments за 10 хв. Tests: normal window, concurrent first requests, failure between operations, existing orphan key, expired window. Не робити безконтрольний fail-open у разі недоступності Redis.

## Додаткові відсіяні припущення — frontend transport / SQL

- AST-прохід 87 apiRequest callsites у utils/hooks/store/components/app: чинних top-level signal/timeout, які адаптер міг би проігнорувати, не знайдено; spread у generateEmbeddingsApi містить підтримані toast flags. Розбіжність між ширшим TypeScript options type та destructuring — лише API hardening, не підтверджена втрата скасування у live flow.
- Перевірені SQL substitutions у planner-series/tx походять із фіксованих table/column/operator choices; IDs/dates параметризовані. clearTable перевіряє identifier regex, live consumer — Debug UI за canAccessDebug. Не рахуємо Debug DB export/drop як доступний будь-якому звичайному користувачу.
- GeoAccessService довіряє x-country-code та першому XFF; це ще один аспект перевірки trusted proxy у NA-07. Production proxy повинен встановлювати/перезаписувати ці значення; його конфігурацію в цьому аудиті не читали, окремий доведений production geo-bypass не заявляємо.

### Ще один контрольний запуск — legacy plans / advertising entitlements

- plans.service, advertising-access, advertising-rollout: **3 suites / 84 PASS**, mocks/pure builders, без Google/БД. ChangePlan owner lookup включає і plan id, і user id; DTO дозволяє лише actual. Поточний стан AdMob/no-fill цими тестами не перевіряється.
- Поточний накопичений backend підсумок: **774 PASS / 13 FAIL / 52 suites**; frontend: **263 PASS / 2 fixture failures / 1 blocked suite / 25 attempted suites**. Не повторювали незмінені вже успішні набори.

### Межа HTML у медіаплеєрі — негативна перевірка

- Original makeMediaHtml у спільному MediaPlayer: synthetic URI з quote/onerror/img injection не створив додатковий img чи onerror attribute; marker не виконався для audio/video (TS transpile + JSDOM, media.load stub, no resources/network). Це не спростовує NA-25 у rich editor, де інший шлях HTML.
- TextReachEditor / MediaPlayer / EntryCard явно вмикають allowFileAccessFromFileURLs, allowUniversalAccessFromFileURLs та mixedContentMode=always. Фактичне читання private files або exfiltration не перевіряли й не довели; source тут inline HTML без baseUrl. Переглянути мінімально необхідні permissions разом із NA-25, зберігши локальне програвання.

### NA-41 — P2: пропущений cron залишає накопичувальну статистику заниженою

- `src/diary-statistics/diary-statistics.cron.service.ts:44–86` collectDailyStat рахує лише yesterdayCount і додає count останнього збереженого дня, який може бути старшим за позавчора. Дні між ними не агрегуються й backfill не виконується.
- Живий шлях: four daily collectors entries/dialogs/checkins/checkin-dialogs → total_*_stats → DiaryStatisticsService.getTotal* → `diary-landing/app/(admin)/admin/diary/page.tsx`, TotalStatChart.
- **Оригінальний метод із dayjs та підставними repositories:** останній total за 26.10 =100; cron за 27.10 пропущено, source має 7 подій за 27.10 та 3 за 28.10. Запуск 29.10 зберіг total за28.10=103 замість110; SQL interval обмежений28.10. Реальні DB calls=0.
- Передумова: app/БД були недоступні під час cron або конкретний collector завершився помилкою. Наступні дні продовжать неправильну базу, доки немає окремого backfill. Це похибка admin aggregates, не втрата diary rows чи журналів користувача.
- Рекомендація: ідемпотентне наздоганяння від останнього успішного дня або перевирахування cumulative з source aggregation із узгодженою політикою видалених акаунтів. Тести: normal day, один/кілька пропущених днів, повторний запуск, перший запуск, межа Kyiv timezone/DST. Політику історичних total не змінювати мовчки.

### Контроль legacy IAP та обробки помилок сповіщень

- iap.service, ai-error-reporter.service, send-telegram: **3 suites / 27 PASS**, ізольовані mocks; зовнішніх запитів немає. Накопичено backend **801 PASS / 13 FAIL / 55 suites**; frontend без змін: **263 PASS / 2 fixture failures / 1 blocked suite / 25 attempted suites**.

### Додатковий контроль криптографії й Telegram formatting

- Оригінальні CryptoService.encryptForUser/decryptForUser виконано з реальною node:crypto AES-256-GCM і підставним KMS: roundtrip, різні IV, tampered ciphertext/tag/AAD, інший uid у KMS context, unsupported algorithm — **7/7 очікуваних результатів**. AWS calls=0. Це перевірка локального криптографічного шляху; production IAM/KMS policy не перевіряли. restoreReplay окремо перевіряє authenticated AAD scope/uid і payload type/id/owner, тому сам caller-supplied ctx не дає підмінити scope.
- Raw authorNickname у Telegram topic/comment formatter не додаємо як доведену injection: live updateMe виконує NFKC normalization і regex тільки letters/numbers/spaces/dot/hyphen/underscore, HTML delimiters не допускаються. У moderation formatter userMessage із LLM досі не escaped; це додатковий hardening пункт у межах NA-36, не доведений prompt exploit. У report formatter nickname уже escaped.

### Frontend auth/navigation — додаткові негативні перевірки

- AuthHandoff та AuthForm: **2 suites / 16 PASS** із mocked native/network. Frontend накопичено **279 PASS / 2 fixture failures / 1 blocked suite / 27 attempted suites**. Backend 801 PASS / 13 FAIL / 55 suites.
- AuthHandoff не монтує protected children до authenticated=true; при поверненні до auth прибирає їх. Conversation route бере owner з поточного store, readConversation перевіряє owner до/всередині/після read transaction; id не інтерполюється в SQL. Прямого bypass через route params у цьому шляху не знайдено. Native зовнішній deeplink на телефоні не запускався.
- AiResponseText використовує markdown-it html=false, дозволяє лише http/https/mailto і не завантажує model-supplied image URLs. ReleaseNotificationModal складає store URLs із app constants, не з notification payload.
- HtmlViewer натомість передає href у Linking.openURL без allowlist/catch; це обмежений hardening candidate для недовірених notification links (у зв'язку з NA-03). Саме виконання JavaScript або native takeover через цей native HTML renderer не доведено; відкриття зовнішніх застосунків не тестувалося.

### NA-42 — P1: anonymous bootstrap обходить перевірку покупки й приймає платний planData

- **Оновлення 29.10.2026:** локально виправлено межу bootstrap: дані planData не передаються в PlansService; для сумісного legacy-виклику сервер формує лише START за каталогом і своїм часом. Eligibility за uniqueId, атомарність створення, чинний V2 bootstrap та verified IAP збережено. Деталі перевірок і короткі післядеплойні тести: [na-42-bootstrap-trial-security-20261029.md](na-42-bootstrap-trial-security-20261029.md). Нижче — початкові докази до виправлення; production не змінювався.
- `src/users/users.controller.ts:73–138`: public POST /users/create-by-uuid має BlockedCountriesGuard, але передає caller-supplied planData без runtime nested DTO/обмеження trial. `UsersService.createUserByUUID:315–316` на новому uniqueId викликає PlansService.subscribePlan із цими даними.
- Заборона paid plan без IAP стоїть в **іншому** PlansController.subscribePlan (:24–33), тому цей виклик її обходить. Сам PlansService.subscribePlan створює Plan із basePlanId/status/expiry DTO, ставить server creditsLimit із каталогу та actual=true, потім синхронізує V2. Перевірки Google в цьому шляху немає.
- **Ізольовано сполучені оригінальні методи:** createUserByUUID + claimFirstDeviceInstall + assertDevicePubKey → subscribePlan + sync wrapper → оригінальний SubscriptionLegacyMapper, синтетичні repositories/notifications/login. Новий synthetic uniqueId, правильний 32-byte public key, planData pro-m1/ACTIVE/expiry2099 без purchaseToken створили 1 mock User і 1 mock Plan з 120000 credits. V2 draft: source=GOOGLE_PLAY, billingStatus=ACTIVE, accessStatus=ACTIVE, currentStoreSubscriptionId=null. Реальні DB writes/Google calls =0. Production route не експлуатувався.
- Refresh deriveEffectiveAccessReason та buildEffectiveAiAccess спираються на збережений state/status/credits; наявність currentStoreSubscriptionId не є обов'язковим доказом покупки в цьому compatibility path. Реальний платний AI запит не запускався.
- Передумова — новий профіль і незареєстрований uniqueId. Це значення приходить від клієнта; device proof доводить володіння поданим ключем, а не справжність фізичного device ID. Уточнення після перевірки чинного фронту: він не надсилає planData і викликає ensureInitialState після створення; planData залишений для старих клієнтів. Проблема в прямому API/модифікованому клієнті. Rate limit і country guard залишаються, але не перевіряють покупку.
- Відмінність від NA-37: там authenticated legacy subscribe дозволяє зайвий trial/строк, тут public bootstrap допускає **платний Pro без IAP**. Обидва шляхи потребують узгодженого розділення server-owned trial creation і verified-store ingestion.
- Рекомендація: bootstrap завжди формує trial сервером за чинною eligibility і ніколи не довіряє paid status/tier/expiry із planData; legacy service має явну довірену межу store-verified input. Зберегти сумісність старого клієнта, який надсилає звичайний START. Не вимагати Play Integrity від усіх автоматично — це окреме продуктове рішення; усунення цього обходу не потребує зміни онбордінгу.
- Необхідні regression: anonymous bootstrap із paid basePlanId/підробленим token/status/далеким expiry відхиляє або ігнорує ці поля; legitimate new install дає тільки server-defined trial; returning/missing uniqueId не дає trial; реальний verified IAP та попередній released client продовжують працювати. Усі негативні кейси перевірити до durable writes/зовнішніх викликів.

### NA-43 — P2: confirm-email приймає OTP іншого призначення й може стерти адресу

- `src/auth/auth.controller.ts:29–40` type описаний лише TypeScript union; runtime DTO/allowlist немає. `AuthService.emailConfirmation:153` передає type прямо в CodeCore.verify. Будь-яке значення, відмінне від register_email, після успіху переходить у гілку email-change (:181): user.email=user.newEmail, newEmail=null, потім issueTokens.
- CodeCore правильно розділяє Redis keys за purpose та атомарно споживає код. Проблема вище: caller може попросити confirm-email перевірити існуючий delete_account/reset_pin/password_reset OTP. Frontend надсилає тільки два штатні type, тому звичайний UI тут не помиляється.
- **Оригінальні AuthService.emailConfirmation і CodeCore key/verify methods, synthetic Redis evaluator/repositories:** правильний synthetic delete_account або reset_pin code → accepted, email став null при newEmail=null, update1, issueTokens1. Неправильний password_reset code → rejected, update0, sessions0. Lua сам не виконувався; evaluator відтворював тільки lookup/hash/single-use для цього контрактного доказу. Реальні Redis/DB/email calls=0. Entity email nullable=true, додаткової заборони null у UsersService.update немає.
- Передумова — **відомий чинний код саме цього акаунта**, а не вхід без коду. Не називаємо це незалежним arbitrary account takeover: такий код уже приходить на пошту власника. Наслідок — обходиться призначення одноразового підтвердження, адресу може бути стерто або замінено старим pending newEmail, і видається нова сесія.
- Рекомендація: runtime allowlist register_email/email_change до verify, явні окремі гілки, nonempty/current pending newEmail для email_change; purpose і конкретну операцію не визначати лише довільним body string. Тести обох штатних flows і невідомих/чужих purpose; відмова до споживання OTP/зміни профілю, неправильний код без side effects.

### Контроль адміністративних агрегатів

- admin-user-growth, admin-user-overview, users-creation-stats: **3 suites / 26 PASS / 6 SKIP**. Optional PostgreSQL checks явно вимкнено тільки в середовищі дочірнього test process; жодного Docker/БД виклику. TypeORM використовував buildMetadatas/SQL generation, не initialize. Це не замінює runtime query plan/performance або permission findings NA-09/NA-41.
- Накопичено backend **827 PASS / 13 FAIL / 58 suites** (+6 пропущених optional PostgreSQL tests); frontend **279 PASS / 2 fixture failures / 1 blocked suite / 27 attempted suites**.

### Додаткові негативні перевірки — WebView bridge / admin auth / statistics

- WebView message handlers у TextReachEditor/TitleReachEditor та handleEditorMessageBase обробляють readiness, scroll/height і selection state; прямого native file deletion або читання ключів через ці message types не знайдено. MediaPlayer приймає лише media-error/video-size. Це звужує можливий вплив NA-25, але не доводить безпечність довільного rich HTML на Android.
- AdminJwtStrategy перевіряє актуального admin у БД, active і роль на кожному guarded запиті. Старий payload role/active не дає обійти деактивацію на цих API. KmsController encrypt/decrypt закоментовані, активних public crypto routes у ньому немає. ModelReviewController має admin-jwt guard.
- tokens.service, planner-statistics, user-statistics.service, diary-statistics-reminders: **4 suites / 42 PASS**, mocks, без DB/провайдерів. Накопичено backend **869 PASS / 13 FAIL / 62 suites** (+6 optional PG SKIP); frontend незмінно **279 PASS / 2 fixture failures / 1 blocked / 27 attempted suites**.

### NA-44 — P2: частковий збій денного обліку не відновлюється повтором створення статистики

- `user-statistics.service.ts:643–673` ensureUserActivityStat робить findOne → create/save, хоча UserActivityStats має unique(userId, day). Два перші запити дня можуть одночасно побачити відсутній рядок; один save відхилиться unique violation. Atomic increment після нього правильний, але саме створення рядка не atomic.
- `diary-statistics.service.ts:61–77,122–140`: createDiaryStat transaction комітиться до incrementEntryStat/incrementCheckinStat. Якщо increment/ensure впав, API повертає помилку після збереженої статистики, а markDiaryEntryCreated/markDiaryActivityCreated не викликається. Повтор того самого aiTraceId повертає created=false і пропускає обидві дії. Аналогічно лічильники dialog/checkin-dialog; independent userActivity repository використовується також усередині форумних transactions.
- **Оригінальні AST/VM methods, синтетичний repository із моделюванням наявного unique constraint:** 2 одночасних першоденних increments → ok +23505, 1 row/1 increment. Окремий post-commit failure probe: перша addEntryStat failed, retry ok, persisted=true, counterAttempts=1, notification bookkeeping calls=0. Реальних DB/HTTP/push calls=0. PostgreSQL concurrency integration не запускалась.
- Наслідок — розходження агрегатів/пропущений серверний облік diary activity; **не втрата локального запису чи планерного нагадування**. Live frontend useCreateEntryHandleSave та handleUserDialog надсилають статистику асинхронно з catch, тому помилка може бути непомітною користувачу. Не припускаємо, що звичайний повтор завжди відбудеться автоматично.
- Рекомендація: atomically ensure/upsert денний рядок і узгодити факт створення статистики з counter update; secondary bookkeeping має окремий ідемпотентний recovery path. Не збільшувати counter безумовно на будь-якому replay — це створить дублювання. Тести parallel first events, increment failure після stat commit, повтор однакового trace, normal successful replay; зберегти приватність та чинну notification policy.

### OPT-09 / надійність telemetry — великий batch повторюється й блокує нові події

- `diary-front/logging/eventLog.ts:121–164,231–264`: postBatch серіалізує цілий batch, на будь-яку HTTP помилку повторює незмінений payload, після maxRetries повертає його на початок queue. Є MAX_QUEUE=5000 **за кількістю подій**, тому не називаємо чергу безмежною. Обмеження bytes/розбиття 413/ізоляції несеріалізованої події немає.
- Live root runtime встановлює цей transport і setupGlobalErrorHandlers; console.warn/error передає довільні args. Backend configureBodyParsers залишає `/logs` на стандартному JSON limit (100 KiB), більший 1 MiB стосується інших AI routes. На production proxy може бути ще інший limit, його не перевіряли.
- **Оригінальний eventLog module у VM із fake fetch413/timers:** synthetic error з 103000 ASCII characters + normal-1 формують 103343-byte batch. Після відмови додавання normal-2 повторно надсилає тільки старі large-error/normal-1; queued=3, normal-2 не доставлений. Реальних network calls=0. Після витіснення старої події за cap або перезапуску стан може змінитися; не називаємо це вічним блокуванням за всіх умов.
- Наслідок — повторні марні передачі й затримка діагностики; volume/RSS на телефоні не вимірювали, зв'язок із попереднім native crash не доведено. Fetch тут також без application timeout; звичайні мережеві помилки можливі, але blackhole request не гарантує швидкої відмови.
- Рекомендація: byte budget і redaction для діагностичних payloads, розбиття batch/карантин однієї oversized або nonserializable події, окрема retry policy transient vs413; адекватний transport watchdog із гарантованим finally. Не обмежувати збереження журналу/медіа користувача заради telemetry. Тести mixed valid+oversized, circular args,413/500/offline recovery, pending transport cancellation і збереження owner snapshot (наявна правильна поведінка).

### Файлові й мережеві негативні перевірки

- AI debug filenames генеруються сервером: fixed last-ai-prompt, sanitized mode+UUID, або day/type/index. TraceId не підставляється в filesystem path у цих переглянутих writers; окремого path traversal через timingTraceId не знайдено. Privacy findings NA-26 залишаються.
- Прямі frontend apiClient media calls використовують фіксовані Nemory paths; replay cache owner/id перевіряються (positive safe integer, UUID), readback перед ack, delete очікує pending write й скасовує запит. Передачі Bearer на user-controlled external host у переглянутих consumers не виявлено.

### Додатковий контроль та уточнення після проходу

- Frontend eventLogTransport, eventLogOwnership, copyLibraryMedia, mediaLibrarySessionCache, apiClientPlanErrors: **5 suites / 50 PASS**. Накопичено frontend **329 PASS / 2 fixture failures / 1 blocked / 32 attempted suites**.
- Backend paid-plan-events та inactivity-cleanup.cron: **2 suites / 7 PASS**. Накопичено backend **876 PASS / 13 FAIL / 64 suites** (+6 optional PG SKIP). Реальних Telegram/БД викликів немає.
- Уточнення NA-44: hourly sendDiaryIdleReminders сам читає MAX(createdAt) entries/checkins і оновлює lastEntryAtSnapshot. Тому пропущений notification bookkeeping може наздогнати наступний успішний cron; це не доведена безстрокова втрата нагадування. Пропущені денні counters цей cron не ремонтує.
- Розширення OPT-05: restoreImagesFromArchive видаляє documentDirectory/nemory_images_import_* лише на успішному завершенні; unzip/conflict/copy failure залишає staging directory. У failed prepareEncryptedBackupRestore staging vault/key також створюються до durable pending record, а cancelPreparedRestore скасовує marker/freeze, не видаляє staging. Cleanup цих orphan roots у переглянутих cold-start paths не знайдено. Це дисковий cleanup candidate; не видаляти recovery/old account vaults навмання. Потрібні облік disposable staging і targeted cleanup після гарантованого abort, збереження original/committed/pending vault.
- Імпорт ZIP не має видимого preflight сумарного expanded size/free space; resource-exhaustion candidate разом із NA-23/OPT-08, **zip bomb не запускали, native crash не доводили**. Канонічна перевірка containment у бібліотеці залишається чинною (див. NA-24).
- Backup checksum у v2 — явно unkeyed SHA256 для випадкового пошкодження, не MAC; AES-CBC залишається конфіденційним шифруванням, але deliberate tamper authentication цим checksum не забезпечується. Не називаємо це доведеним обходом пароля. Можливий майбутній versioned authenticated envelope із backward read compatibility — окремий hardening, не термінове переписування backup.

### OPT-10 — погодинні diary-idle reminders: зайві save та можливість дубля при overlap

- PushNotificationsService.sendDiaryIdleReminders (:430–550) щогодини агрегує всю entries/checkins history по user, потім робить findOne state для кожного. Для недосягнутого nextReminderDay/lastReminder<1day викликає save незміненого state. Це repository call; фактичний UPDATE SQL залежить від TypeORM dirty checking, тому не заявляємо 1 UPDATE на кожного без SQL trace.
- **Оригінальний метод і helper, synthetic repositories:** 10 недавніх users →2 aggregate reads,10 state reads,10 save calls,0push. Production EXPLAIN/тривалість не виміряні; оптимізація — прибрати no-op persistence, batch/due selection і перевірити indexes за реальним планом.
- Обробник не має running/distributed claim. Два паралельні оригінальні виклики для одного due user із незалежними snapshots →2 mocked push calls/2saves. Передумова — overlap довгої обробки або два backend workers; поточну production топологію не встановлено. Одна нормальна коротка cron execution не є дублем. Це не стосується UserRemindersService, який уже використовує transaction + FOR UPDATE SKIP LOCKED.
- Рекомендація: узгоджений claim/outbox/idempotency для idle delivery, без зміни погодженого розкладу. Врахувати crash after provider acceptance: проста DB lock навколо HTTP не гарантує exactly-once. Тести concurrent claim, provider failure, persisted accepted state, нова diary activity під час виконання; не перевіряти реальними push на користувачах.

### Питання політики для ранкового розбору — inactive account із купленим балансом

- У чинному коді warning150/delete180 днів, active paid subscription захищена; purchased-credit balance окремо не перевіряється. `diary-landing/app/[locale]/privacy/page.tsx:459–468` наразі описує 90 днів без активної підписки, Terms посилаються на цю політику. Це read-only звірка local source, не висновок про юридичну відповідність або live сайт.
- У переглянутому продуктовому документі не знайшов явного рішення, чи ненульові куплені кредити повинні блокувати inactive deletion. Не оголошуємо відсутній виняток доведеним багом: потрібне рішення користувача. Узгодити також 90/180 у тексті/коді, зберігши довший чинний захисний період до рішення; нічого не змінено.

### NA-45 / P2 — AI preferences: перевірка rowVersion не захищає від паралельного збереження

- `src/ai/ai-preferences.service.ts:76–106`: patchForUser читає current, порівнює baseRowVersion у JS, потім зберігає повний merged prefsJson через repo.save. Немає atomic WHERE row_version=expected або блокування між read/check/write. Entity має VersionColumn, але саме збільшення версії не є compare-and-swap. `changeByPreset` також зберігає snapshot без такого контролю.
- Live frontend `store/thunks/ai/updateAiPreferences.ts` надсилає baseRowVersion із Redux. Це справжній consumer механізму конфліктів; передумова сценарію — два паралельні saves, наприклад із двох пристроїв. Звичайне послідовне редагування не доводить проблему.
- **Оригінальний patchForUser + original defaults/derive, VM mocked repository:** обидва запити читають version1; перший змінює tone, другий humor; обидва fulfilled, final tone повертається до warm, humor=off. Saves повернули versions2/3. Це логічне відтворення без PostgreSQL/HTTP; точний SQL concurrency на production не тестувався.
- Наслідок — тиха втрата однієї зміни власних налаштувань, не доступ до чужого акаунта. Рекомендація: atomic conditional update/transaction lock із перевіркою актуальної версії, однакова політика для preset та patch; старі клієнти без baseRowVersion мають зберегти документовану сумісність.
- Після майбутньої правки: parallel two changes same base → один успіх, один409; retry після reread зберігає обидві зміни; послідовні patch/preset, legacy undefined version. Нових тестових файлів/правок коду зараз немає.

### Негативні перевірки notification actions та службових routes

- Habit notification action має stable checkin ID з notification ID/date/action і повторну перевірку всередині createHabitCheckinTx. Повтор одного action не слід автоматично зараховувати як дублювання; source guards уже є. Фактичну міжпроцесну конкуренцію Android у цьому проході не запускали.
- SeedsController методи закоментовані; generic email send test також не активний. TestController headers екранує &,<,> перед вставленням JSON у HTML; reflected script injection через ці headers не підтверджена. System-users mutation/read захищені admin-jwt.

### Контроль після NA-45

- Frontend habitGoalReminders, habitCheckinsService, habitActionsService: **3 suites / 57 PASS**, native notifications і database mocked. Накопичено frontend **386 PASS / 2 fixture failures / 1 blocked / 35 attempted suites**; backend без нового Jest run: **876 PASS / 13 FAIL / 64 suites** (+6 optional PG SKIP). VM concurrency probe NA-45 рахується окремо.
- Пошук прямих вкладених inTx/inWriteTx/inReadTx/withDbLock та global getAll/getOne/run у transaction callbacks під db (без seeds) не виявив таких викликів. Це вузька static перевірка, не доказ відсутності deadlock через непрямі helper calls. Переглянутий deleteEntryByIdTx передає db у repositories.
- Debug screen доступний тільки за чинним canAccessDebug (дозволені акаунти/ADMIN); ordinary user route не рендерить Debug. Локальний debug export plaintext тому не трактуємо як анонімний remote endpoint. Скомпільований production bundle/телефон тут не перевіряли.
- Admin-forum sort перетворюється на дві fixed columns; clearTable локально приймає тільки identifier regex. У цих місцях SQL injection від довільного імені поля не підтверджена. SMS service має30s timeout, але live sendSms consumer не знайдений, тому можливі provider-response нюанси не виносимо як активний дефект.

### Auth UI regression контроль

- GoogleSignInButton та EmailVerificationCodeForm пройшли; разом із signInWithGoogle thunk suite результат **18 PASS / 1 FAIL / 3 suites**. Накопичено frontend **404 PASS / 3 fixture failures / 1 blocked / 38 attempted suites**.
- Failure у settings-success test не є підтвердженим regression Google-входу: test mock localVault експортує тільки PENDING_ACCOUNT_SESSION, тоді як чинний saveAuthenticatedAccountSettings викликає initialiseLocalVault/ownerKey. Original preferenceStorage у VM з тим самим mock відтворює `initialiseLocalVault is not a function` до запису settings. Інші settings-absent cases проходять. Потрібно оновити fixture при майбутній роботі, зараз файли не змінені.
- Backend Google token verifier використовує google-auth-library verifyIdToken з audience=GOOGLE_CLIENT_WEB_ID; відсутність перевірки підпису/аудиторії за нормальної конфігурації не підтверджена. Refresh DTO відкидає non-number timestamp; окремий inline recover-anon body має слабшу runtime validation, але потребує правильних uuid/hash і підпису — не оголошуємо missing timestamp самостійним обходом володіння.
- MediaProcessor використовує execFile з array args, fixed temporary input, format/protocol whitelist; shell interpolation у переглянутому шляху немає. Resource-concurrency candidate OPT-03 залишається окремо.

### NA-46 / P2 — перше створення KMS-ключа зберігає застарілий повний User

- `src/kms/user-keys.service.ts:36–54`: ensureUserEdk читає повний User, чекає GenerateDataKey, записує dekEncrypted і передає весь старий entity у users.save. Реальні consumers — CryptoService.encryptForUser для input media, replay та image generation; наявний dekEncrypted пропускає цю гілку. Підготовки ключа при кожній реєстрації у переглянутих users/auth consumers не знайдено.
- Передумова — у користувача ще немає EDK, а між read та відповіддю KMS інша операція змінює його профіль/пароль. Не потрібна зміна акаунта на телефоні; можливий паралельний запит із іншого пристрою. Частоту/латентність реального KMS не вимірювали.
- **Оригінальні ensureUserEdk/kmsCtx + реальний SubjectChangedColumnsComputer встановленого TypeORM, synthetic User metadata:** mocked KMS під час очікування змінює name/password у synthetic database snapshot; наступний save визначає changedColumns=[name,password,dekEncrypted] і повертає старі name/password разом із новим EDK. Жодних AWS calls/DB connections, справжніх паролів або writes немає. Це перевіряє ORM diff, не production end-to-end.
- Наслідок — втрата паралельної зміни профілю; якщо збіглося зі зміною пароля, можливе повернення попереднього password hash. Не стверджуємо доведене захоплення акаунта. Окрема duplicate-key race не означає автоматичну втрату всіх старих ciphertext: кожен CipherBlob містить власний edk.
- Рекомендація: вузький conditional update тільки key fields (`WHERE dekEncrypted IS NULL`) та reread переможного EDK; не зберігати цілий snapshot користувача після зовнішнього очікування. Не тримати довгу DB transaction навколо AWS без потреби. Тести concurrent profile/password update зберігається, два first-key requests узгоджені, existing key не генерується повторно, AWS failure не змінює user.

### Уточнення NA-29 — reviewed_by посилається на іншу сутність

- Поточний live consumer: `diary-landing/app/(admin)/admin/reports/page.tsx` бере `session.id` адміністратора → `ReportsClient` → `ReportsTable.handleChangeStatus` → `updateStatus` передає `adminId`.
- `forum-reports.service.ts:updateReportStatus` записує цей ID у `reviewedBy`, але `ForumReport.reviewer` має `ManyToOne(() => User)`, тоді як адміністративна сесія належить окремому `Admin`.
- За чинного FK це означає: без User із тим самим числовим ID оновлення може завершитися FK-помилкою; за випадкового збігу ID запис перевірки посилається на стороннього звичайного користувача. Наявність/стан FK на проді не перевірялися, запити запису не виконувалися.
- До рекомендації NA-29 додається узгодження reviewer relation з Admin та міграція з перевіркою вже записаних ID; не можна автоматично трактувати старі User ID як Admin ID. Тест: адміністратор, для ID якого немає User; адміністратор із числовим збігом ID іншого User; читання історії перевірки.

### Фінансові звіти — додатковий ізольований контроль

- Пройшли 5 suite / 50 тестів: `fx-rates.service`, `admin-finance.service`, `admin-finance-report`, `google-order-finance`, `token-statistics.service`.
- Перевірено mock/pure-шляхами датовані курси, відновлення після помилки провайдера, дедуплікацію квитанцій, неповні фінансові дані та guard нового фінансового маршруту. Реальні Google/NBU/БД не викликалися.
- Сукупно backend: **926 PASS / 13 FAIL / 69 suites**, окремо 6 optional PG SKIP. Раніше описані 13 невдалих перевірок не запускалися повторно й не виправлялися. Frontend без зміни: 404 PASS / 3 fixture FAIL / 1 blocked / 38 attempted suites.

### Уточнення NA-36 — community_changed випереджає commit

- `ForumTopicsService.createTopic` та `ForumCommentsService.createComment` викликають `emitCommunityUnreadChanged()` усередині транзакції, до додаткових DB-записів і очікування зовнішнього Telegram / push.
- Live frontend: `app/_layout.tsx` → `useCommunitySync` → socket `community_changed` → через 400 мс `CommunityEvents.emit` та запит unread summary. Ця затримка не гарантує, що транзакція вже committed.
- Оригінальний `createTopic`, витягнутий TypeScript AST і виконаний у VM з deferred Telegram/repository mocks: trace **emit before commit → await Telegram → commit**, спостерігач до commit бачить 0, після — 1; emitted один раз. Реальних БД, socket, Telegram не було. Production-таймінг не вимірювався.
- Наслідок: за повільного зовнішнього виклику інші клієнти перечитують старі дані й можуть не побачити нову тему/лічильник до наступного оновлення. За rollback сигнал також уже надісланий. Це доповнення до NA-36, не окремий security finding.
- При майбутньому виправленні: сигнал про доступні зміни після commit; зовнішню доставку відокремити з повторюваним/idempotent обліком. Перевірити повільний Telegram, його помилку та успішний commit; не додавати довільну більшу паузу клієнту як заміну правильному порядку.

### NA-47 / P2 — невдала публікація залишає текст заблокованим як дублікат на 10 хвилин

- `ForumAbuseGuardService.checkOrThrow` виконує `SET forum:duplicate:... EX 600 NX` до baseline/AI moderation, транзакційного запису та зовнішніх побічних дій. У `src` немає компенсації цього ключа після тимчасової помилки наступних етапів.
- Live шляхи: `ForumModerationService.moderateOrThrow` → створення/редагування тем і коментарів. Для createTopic зовнішній Telegram також може відкотити транзакцію після успішного guard (NA-36).
- Оригінальні методи guard витягнуто AST, виконано у VM з Map Redis: перша перевірка `allowed`; змодельовано downstream failure без committed comment; повторний ідентичний текст → `FORUM_DUPLICATE_CONTENT_RECENTLY_POSTED`, TTL 600 с. Реальних Redis, provider, DB або повідомлень не було. Сам failure змодельовано, native UI не перевірявся.
- Це не обхід антиспаму: це хибне блокування відновлення після серверного збою. Ліміт частоти 3 теми / 10 коментарів за 10 хвилин існує окремо; він також рахує спроби.
- Рекомендація на розбір: розрізняти reservation/in-flight, успішну публікацію й policy-rejection; звільняти власну reservation після підтвердженого незбереження через технічну помилку, не видаляти ключ чужої паралельної успішної спроби. Не прибирати антидубль цілком.
- Мінімальні майбутні тести: тимчасова помилка AI або rollback → повтор дозволений; успішна публікація → дублікат відхилений; дві паралельні однакові спроби не створюють двох записів; відхилений політикою контент не може спамити дорогою модерацією.

### Додаткові межі висновків — спільнота

- Не підтверджено необмежені платні moderation-виклики через звичайне редагування: той самий guard перевіряє create та update, DTO обмежують довжину тексту. Підміна IP із NA-07 не прибирає цей user-scoped Redis guard.
- Community socket надсилає порожній `{}` для глобальної інвалідації, Plan socket — порожній `{}` у кімнату ID з перевіреного JWT. Прямої передачі приватного контенту через ці події не виявлено. Перевірку строку JWT у тривалому AI socket описано в NA-32.
- Monthly forum quota має окремі read/check та increment без atomic admission. За увімкнених monthly limits паралельні різні публікації можуть пройти біля межі; default FREE і grandfather/paid policy означають, що це не доведена поточна production-проблема. User rate guard зменшує кількість одночасно допустимих спроб, але не є атомарною місячною квотою. Залишено умовним уточненням принципу NA-20, без окремого номера.

### AI lifecycle — додатковий контроль

- 3 suites / 184 PASS: conversation.service, periodic-analysis, periodic-analysis.provider. Зокрема owner mismatch, duplicate request admission, cancellation та shared provider accounting. Провайдери й repositories підставні; реальні AI-запити/списання не запускалися.
- Сукупно backend: **1110 PASS / 13 FAIL / 72 suites**, окремо 6 optional PG SKIP. Frontend: 404 PASS / 3 fixture FAIL / 1 blocked / 38 attempted suites.

### Frontend vault / boot / media — додатковий контроль

- 4 attempted suites: `localVault`, `rootBootFlow`, `Backup`, `prepareEntryAiMedia`. **47 PASS / 3 FAIL / 1 blocked suite** у цьому запуску.
- `localVault` та `rootBootFlow` пройшли. `Backup` не запустив тести через спільний mock Reanimated/Worklets (`getUIRuntimeHolder is not a function`), як уже відома environment-проблема pinSetup.
- Три `prepareEntryAiMedia` failures падають у `collectAiMediaReplayBackup` з `LOCAL_ACCOUNT_LOCKED` до перевірки власне replay. Fixture задає owner лише в Redux `mockOwner`, тоді як чинний `readStoredOwner` читає SecureStore `user`; fixture його не встановлює та localVault не mock-ає. Отже це missing authenticated-storage fixture, не доказ native втрати медіа або обходу account isolation. Джерела тестів не змінювалися.
- Оновлений frontend підсумок: **451 PASS / 6 fixture FAIL / 2 blocked suites / 42 attempted suites**. Backend без зміни: 1110 PASS / 13 FAIL / 72 suites (+6 optional PG SKIP).
- Негативні probes: installed `deepmerge` відкидає `__proto__`/`constructor.prototype` payload, Object prototype не змінений. AST-перевірка прямих `apiRequest({...})` у utils/store/hooks/components не знайшла top-level Axios options, які поточна обгортка мовчки ігнорує; отже недосконалий TypeScript interface сам по собі не записаний runtime defect.

### NA-48 / P1 — приватний ключ сервісного акаунта збережено в Git фронтенду

**Подальше уточнення 29.10.2026:** користувач окремо дозволив прибрати всі три файли з відстеження, залишивши локально й не чіпаючи історію. Виконано `git rm --cached` для цих трьох шляхів; локальні SHA-256 до/після збігаються, правила ignore діють. Видалення з індексу підготовлені до коміту; commit/push не виконувалися. Попередні коміти та ключі незмінні. Це замінює нижче статус «залишаються tracked», але не закриває історичну експозицію/відкладену перевірку ключів.

**Рішення користувача 29.10.2026:** відкласти розбір/винесення секретів та історії до залучення інших розробників; за повідомленням користувача доступ до приватного репозиторію має лише він. Зараз додати відсутнє правило `.gitignore`; keystore і notes вже покриваються правилами. Файли залишаються tracked та в історії, ключі не відкликані, проблема не позначається виправленою. Перед стороннім доступом — окремий приватний репозиторій із перевіреним кодом без секретів та без старої `.git`/історії; старий лишається особистим архівом. Нічого не видаляти/не змінювати в signing material без перевірки чинного build/submit.

- `diary-front/nemory-e642e.json` відстежується Git і вже присутній у HEAD. Без виведення вмісту перевірено JSON type=service_account, client_email формату service account та успішний `crypto.createPrivateKey` для RSA private_key як у робочому файлі, так і в HEAD. Це синтаксично справжній приватний ключ, не доказ його чинності або конкретних IAM/Play permissions; Google ним не викликався.
- Також Git відстежує `my-release-key.keystore` (2740 байт, ASN.1-контейнер, HEAD збігається) та `keystore.txt` (непорожній, містить password label у HEAD). Вміст пароля/контейнера не виводився, keystore не розшифровувався. Не встановлено, чи цей ключ є поточним upload/app-signing key. Останній commit цих шляхів: e1173f53, 2026-05-15.
- `.gitignore` містить правила keystore/jks, але вони не прибирають уже відстежувані файли. `.easignore` цих правил не містить: локальна перевірка через встановлений ignore показала excluded=false для service-account JSON, keystore notes/container, jks та .env/.env.production. [Expo документує](https://docs.expo.dev/build-reference/easignore/), що за наявності .easignore саме він замінює .gitignore для project upload. Repo root перевірено: diary-front. Фактичний EAS archive/upload не створювався й не досліджувався; наявність цих файлів у APK/AAB не доведена. app.config.googleServicesFile вказує на інший, звичайний google-services.json.
- Наслідок: особа з доступом до Git/history отримує приватний ключ; зайві секрети також не виключені з контексту cloud build. Це не твердження про публічний репозиторій, сторонній доступ або вже здійснене захоплення Google/Play.
- Рекомендація на ранок: спочатку встановити власника/роль/чинність цього service-account key та актуальність signing material; узгодити ротацію або відкликання, винесення до захищеного secret/credentials storage, правила Git/EAS і очищення історії лише окремо погодженим способом. Не видаляти/міняти signing key навмання: потрібно зберегти можливість оновлення застосунку. Нічого з цього в аудиті не виконувалось.
- Перевірки після виправлення: repository/history secret scan без друку значень; offline EAS archive manifest не містить service-account/паролів/непотрібних keystores; чинний build/submit використовує призначене сховище; старий service-account key відкликаний після безпечного переходу. Наявність публичного google-services.json сама по собі не прирівнюється до private service-account key.

### Додатковий контроль RTDN скасування

- `iap/utils/rtdn`, `credit-refund-reconciliation`, `credit-pack.catalog`: **3 suite / 20 PASS**. Перевірено consumed cancellation, повтори/конкурентний voided event, mismatch product/order, transient Google failure та missing wallet без реального Google/БД. Це не виправляє й не спростовує NA-12 (довіра до джерела callback).
- Сукупний backend результат: **1130 PASS / 13 FAIL у 75 suites**, ще 6 optional PostgreSQL SKIP; попередні невдалі fixtures не перезапускались. Frontend залишається **451 PASS / 6 fixture FAIL / 2 blocked у 42 attempted suites**.

### Міграції локальної бази — додатковий контроль

- **18 suites / 32 PASS**: goal upgrade build269, повторні міграції, збереження дочірніх rows, savepoint rollback при невдалому відновленні triggers, дати/прив'язки/медіа/пам'ять. SQLite працював тільки в `:memory:`, решта tests на mock executors; телефон/користувацькі DB не відкривались.
- Frontend підсумок: **483 PASS / 6 fixture FAIL / 2 blocked у 60 attempted suites**. Backend: **1130 PASS / 13 FAIL / 75 suites**, 6 optional PostgreSQL SKIP.
- Додаткова failure-injection перевірка оригінального `plannerCivilDatesMigration`: ALTER start_day_local успішний, перший UPDATE штучно відхилений, повтор міграції успішний, але start_day_local залишається NULL (backfill викликано тільки раз); deadline_day_local заповнений. Причина: backfill знаходиться всередині `if (!columnExists)`, а createSchema не огортає цю пару в транзакцію.
- **Умовний reliability-кандидат, не нова критична security finding:** `goals.repo.ts` має fallback localScheduleAt(..., old timestamp), тому original timestamp/запис не втрачається. Пропущене закріплення civil day може залишити стару залежність від timezone, доки дату явно не перезбережено. Розглядати атомарність ALTER+backfill або окремий resumable backfill лише для legacy NULL без зміни явно заданих дат; перевірити failure/retry та timezone. Звичайний success/idempotent test цього проміжного збою не покриває.

### Видалення вкладень — контроль і уточнення OPT-05

- `deleteTodayEntry`, `deleteTodayEvent`, `imageLibraryDeletion`, `dialogMedia`: **4 suites / 47 PASS**, synthetic DB/file/notification mocks. Frontend сумарно **530 PASS / 6 fixture FAIL / 2 blocked / 64 attempted suites**.
- Окрема fault injection оригінального `deleteImageLibraryItem` підтвердила неузгодженість post-commit cleanup: entry update + image row deletion + commit виконано, помилка `FileSystem.deleteAsync` після commit відхиляє всю операцію. Trace: tx-start → entry-updated → media-row-deleted → tx-committed → file-cleanup-failed; жодних реальних файлів не видалялось.
- Живий `app/(tabs)/images.tsx:1208–1270` після такого rejection переходить у toast/catch і не доходить до оновлення items/session snapshot/EntryEvents. Отже вкладення вже прибране з DB, але бібліотека може показувати старий елемент і помилку до повторного завантаження. Це не доказ видалення неавторизованого запису. Today delete вже розділяє commit та best-effort file cleanup; library шлях — ні.
- Розбирати як reliability-доповнення до OPT-05: окремий committed outcome + черга/повтор cleanup, оновлення UI після durable delete, збереження видимої помилки при справжньому rollback. Не ковтати всі помилки до commit й не видаляти файли до успішної DB операції. Тести failure до commit / після commit для photo/audio/video та dialog media.

### AI streaming та контекст — додатковий контроль

- Backend: `response-cache-continuity`, `conversation.context`, `openai-prompt-cache`, `anthropic-prompt-cache`: **4 suites / 28 PASS**. Сукупно **1158 PASS / 13 FAIL / 79 suites**, окремо 6 optional PostgreSQL SKIP. Реальних provider/DB викликів не було.
- Frontend: `runAIStream`, `handleAssistantDialog`: **2 suites / 50 PASS**. Сукупно **580 PASS / 6 fixture FAIL / 2 blocked / 66 attempted suites**.
- Перевірений шлях збереження відповіді обробляє repository failure: `finalizeAssistantDialog` catch сигналізує error і не лишає успішне завершення незбереженої відповіді. Generic callback API допускає throwing handlers, але підтвердженого live сценарію зависання на цьому шляху не знайдено; окремий finding не додано.
- AST-пошук прямих вкладених `inTx/inReadTx/inWriteTx/withDbLock` та repository-викликів без переданого transaction db в inline callbacks не знайшов кандидатів. Додатково переглянуто викликані DB helpers; це обмежений негативний результат, не формальний доказ відсутності deadlock у всьому графі викликів.

### Уточнення NA-35 — direct-message API та обмеження відправника

- Зареєстрований у ForumModule `POST /forum/messages` захищений user JWT і перевіряє профіль/DM-дозвіл одержувача, взаємні user blocks і blocked conversation. Профіль/бан/active posting restriction відправника не читаються; `ForumUserRestrictionsService` тут не підключений.
- Оригінальний `sendMessage`, AST → VM, synthetic repositories: profileLookups=[202], sender=101 без профілю, messageSaves=1. Реальних повідомлень/DB=0. JWT strategy перевіряє підпис/expiry, але не forum ban.
- Frontend consumer DM API у чинних app/components/utils не знайдено; це доступна серверна поверхня, а не доведений сценарій натискання в поточному UI. Чи має posting restriction поширюватися на приватні повідомлення — уточнити як продуктову політику; не прирівнювати вимкнені DM одержувача до обходу (вони перевіряються).
- На ранок розглянути разом із NA-35: явно визначити права sender для DM або вимкнути не використовуваний API, зберігши сумісність випущених клієнтів. Мінімальні перевірки: normal sender, banned/restricted sender за узгодженою політикою, recipient DM disabled, взаємне блокування, сторонній nonmember read/delete.

### Локальні налаштування, subscription transport, analytics outbox

- 4 suites / **35 PASS**: accountSettingsCommit (destination-vault та unbound owner), creditPacksApi (wallet/legacy response), getSubscriptionApi (AI та advertising entitlement розділення), analyticsOutbox (облік доставки по destinations, retry/concurrent first actions). API/SDK/storage mocked, ніяких зовнішніх подій чи покупок.
- Сукупно frontend: **615 PASS / 6 fixture FAIL / 2 blocked / 70 attempted suites**; backend: **1158 PASS / 13 FAIL / 79 suites**, окремо 6 optional PostgreSQL SKIP. Це автоматичні ізольовані перевірки, не нові user-accepted телефонні тести.

### NA-49 / P2 — подія іншої покупки того самого типу завершує поточне очікування

- `diary-front/context/IapContext.tsx:227–329`: purchaseUpdatedListener зіставляє pending лише за kind (credit-pack/subscription). Збережені `pending.sku` / basePlanId не зіставляються з event; після await перевірки читається mutable pending.current, а finally очищує його за тим самим kind.
- Оригінальний callback витягнуто TypeScript AST → VM, provider/store/API mocked: pending SKU=40000, отримано event іншого token для SKU=20000 → resolve(result SKU20000), pendingCleared=true, один refresh event. Реальних Play викликів, покупок, credits writes=0.
- Живий `components/subscription/Plans.tsx:301–337` після будь-якого успішного result показує кількість із **запитаного** sku (у прикладі 40000), а не підтвердженого event. Передумова — запізніла/повторна подія іншої законної покупки під час нового очікування; event без доступу до Play не підроблявся.
- Наслідок: хибний success toast/раннє закриття очікування або помилка поточної покупки через failure старої. Неправильне серверне нарахування/втрата грошей не доведені: бекенд перевіряє token/product і має ідемпотентність. Background verification старої покупки сама по собі потрібна.
- Рекомендація на розбір: відділити фонову обробку purchase events від завершення конкретної UI-операції; зв'язати pending із стабільною identity операції та відповідними product/base-plan/token ознаками. Для однакового SKU одного порівняння sku недостатньо. finally не повинен очищувати новий pending, який з'явився під час старого await.
- Мінімальні майбутні тести: старий інший SKU під час нової покупки, старий failure, новий pending під час verify, нормальна покупка, повтор того самого token, legitimate restore. Не додавати довільний короткий timeout і не блокувати background recovery.

- Додатково чинний `IapContext.test.js`: **1 suite / 30 PASS**, Google Play/API повністю mocked. Новий event-correlation сценарій NA-49 не входив у ці штатні тести й перевірений окремим AST/VM probe, тому їх успіх не спростовує finding. Frontend підсумок **645 PASS / 6 fixture FAIL / 2 blocked / 71 attempted suites**; backend **1158 PASS / 13 FAIL / 79 suites** (+6 optional PG SKIP).

### Обробка пошкодженого rich HTML — обмежений reliability-кандидат

- `utils/diary/html.ts:getRichTextVisibleCharacterCount` декодує numeric entities через String.fromCodePoint без перевірки Unicode range. Оригінальна функція у VM: `&#1114112;` та `&#x110000;` → RangeError, валідний emoji entity → count4 для `ok + emoji`, escaped literal `&amp;#1114112;` не падає.
- `TitleReachEditor.tsx:152–164,422–426` викликає цю функцію при render/state initialization і onChange. Для збереженого/імпортованого title HTML із таким entity компонент може не відкритися; full native error-boundary/процесне падіння не перевірено. Звичайний набір такого рядка в браузерному редакторі має escaping; не стверджуємо, що user може відтворити це звичайним plain-text paste.
- Розглянути tolerant entity decoding / Unicode replacement для malformed HTML разом із імпортною валідацією NA-25. Зміни не внесені; це нижчий пріоритет, ніж auth/billing findings. Перевірки valid supplementary Unicode, invalid >0x10FFFF, escaped literals і незмінність форматування.
- Штатні `handleUserDialog`, `createEntryValidation`, `visibleEntryDialogs`, `html`: **4 suites / 21 PASS**. Frontend сумарно **666 PASS / 6 fixture FAIL / 2 blocked / 75 attempted suites**. Backend без змін: 1158 PASS /13 FAIL /79 suites (+6 optional PG SKIP).

### Межі DEV-діагностики — додатковий контроль

- `context-audit`, `logs.context-audit`, `ai-request-debug`, `memory-review-file-log`: **4 suites / 18 PASS**. File operations та fetch mocked. Production guard і відокремлення context fragments від звичайної logs DB перевірені. Це стосується конкретних DEV helpers, а не redaction у загальному telemetry transport (NA-26).
- Backend підсумок **1176 PASS / 13 FAIL / 83 suites**, окремо 6 optional PostgreSQL SKIP. Frontend **666 PASS / 6 fixture FAIL / 2 blocked / 75 attempted suites**.

### Серверні settings contracts — контроль та уточнення NA-45

- 6 suites / **140 PASS**: settings/model normalization, checkin-settings, metric-tracking, theme-selection, onboarding-config, atomic registration-write. Providers/DB не запускались; зокрема перевірені legacy values, archived metric preservation, відкидання device URI з theme selection та registration ownership predicate.
- Backend підсумок **1316 PASS / 13 FAIL / 89 suites**, ще 6 optional PostgreSQL SKIP; frontend **666 PASS / 6 fixture FAIL / 2 blocked / 75 attempted suites**.
- Окремо підтверджено споріднену з NA-45 проблему read/full-row-save для звичайних налаштувань: `UsersService.updateUserSettings:1557–1567` зберігає `{...settings,...safeSettingsUpdate}`. Два незалежні часткові запити font / timeFormat читають стару копію; другий save передає старий font, хоча його запит цього поля не містив.
- Original method + original pickEditableUserSettings у VM, repository snapshot mocks: payloads `[Montserrat,12h]`, `[Manrope,24h]`, підсумок `[Manrope,24h]` — зміна font втрачена. Це перевірка сформованого stale save payload/очікуваної ORM merge семантики; live PostgreSQL concurrency не запускався. TypeORM full-row diff механізм окремо перевірено в NA-46.
- **Не поширювати висновок на themeSelection/onboardingVariant:** код уже прибирає їх із full-row save та оновлює окремо (write-once attribution/conditional theme initialization). Identity whitelist із SEC14 також працює; це не довільна підміна owner/id.
- На ранок розглянути разом із NA-45/46: column-level partial updates для незалежних scalar settings, атомарність валідованих залежних metric/checkin snapshots. Не замінювати всі save на update механічно. Мінімальний regression: два незалежні concurrent patches зберігають обидві зміни, тема не відкочується, owner незмінний, legacy preservation зберігається.

### Advertising access / lifecycle — ізольований контроль

- `nativeAdCache`, `advertisingPolicy`, `advertisingSdk`, `useInterstitial`: **4 suites / 34 PASS**. SDK, native hooks і час mocked; запитів AdMob або телефонних дій немає. Перевірені owner/entitlement gates, billing activity, DEV test configuration, повтори після no-fill/discarded та cache release під тиском пам'яті.
- Це не діагностика production no-fill і не повторне приймання ручних G7-SCROLL тестів. Native ad fill/візуальну стабільність за unit tests не оголошуємо підтвердженими.
- Frontend підсумок **700 PASS / 6 fixture FAIL / 2 blocked / 79 attempted suites**; backend **1316 PASS / 13 FAIL / 89 suites** (+6 optional PostgreSQL SKIP).

- Окремий `interstitial.test.js`: **34 PASS / 1 suite**, включно з privacy request payload та failure/dispose lifecycle. Frontend підсумок **734 PASS / 6 fixture FAIL / 2 blocked / 80 attempted suites**. Фактичний SDK/рекламний сервер не викликався.

### Контроль міграцій backend

- 6 suites / 9 PASS: AddCheckinTokenUsageType, AddDiaryStatAiInput, AddDiaryStatEntryId, AddAiUsageOperationTypes, SplitCheckinAiAnalysisDefault, AddOnboardingVariant. QueryRunner mocked; PostgreSQL та production migration ledger не змінювались.
- Сукупно backend **1325 PASS / 13 FAIL / 95 suites**, окремо 6 optional PostgreSQL SKIP. Frontend **734 PASS / 6 fixture FAIL / 2 blocked / 80 attempted suites**. Ці тести не доводять безпечність повторного ручного запуску всіх історичних migrations; штатний runner застосовує їх за ledger.

### NA-50 / P1 — неперевірений next у вході вебадмінки, JavaScript URL

- Живий `diary-landing/app/(admin)/admin/auth/page.tsx` рендерить `components/admin/auth/Login.tsx`. Query-параметр next без перевірки передається у window.location.href після успішного POST /api/admin/login. Proxy сам генерує локальний next, але пряме посилання на публічну login page дозволяє передати інше значення.
- Оригінальний onSubmit витягнуто AST та виконано у VM/JSDOM з synthetic success fetch. Для `javascript:window.__auditMarker=1;void(0)` marker став true. Реальні облікові дані, HTTP login та browser admin session не використовувались; зовнішніх запитів немає. JSDOM не реалізує звичайну navigation, тому external redirect підтверджений sink/code, не фактичним переходом браузера.
- Передумова: адміністратор відкриває спеціально сформоване login-посилання та успішно входить. Це не автоматичний unauthenticated takeover. HttpOnly cookie не читається JavaScript, але same-origin дії можуть використовувати cookie. CSP у переглянутих next.config/proxy/app/lib не знайдено; production reverse-proxy CSP не перевірена і може обмежувати JavaScript URL.
- На ранок: дозволяти лише нормалізовані same-origin admin paths, відкидати javascript/data/absolute/protocol-relative URLs, fallback /admin. Не вважати лише startsWith('/') достатнім через //host та backslash normalization.
- Мінімальні тести: нормальний /admin path + query, відсутній next, external https, //host, backslash variants, javascript/data та encoded schemes. Без виправлень під час аудиту.

### Обмеження передачі результатів аудиту

- Оновлення Memora 2870 відхилене automatic approval review: зовнішня передача деталей вразливостей приватного repository потребує окремого дозволу. Користувачу повідомлено, поставлено запит дозволу; до відповіді нові результати зберігаються тільки в цьому локальному звіті. Обхід іншими каналами не виконується.
- Окремий попередній запит дозволу на npm audit (передача dependency inventory registry.npmjs.org) також залишається без відповіді. Це не блокує локальний read-only аудит.

### Адаптери AI — контроль без provider requests

- `qwen`, `opus5`, `openai-responses`: **3 suites / 78 PASS**. Provider clients та billing/user services mocked; calls до OpenAI/Anthropic/Qwen та платних операцій не виконувались. Перевірки не є оцінюванням якості реальних відповідей моделей.
- Backend сукупно **1403 PASS / 13 FAIL / 98 suites** (+6 optional PostgreSQL SKIP); frontend **734 PASS / 6 fixture FAIL / 2 blocked / 80 attempted suites**.

### Перевірка повних меж запиту та допоміжних AI flows

- Повторно звірено NA-22/42 з global ValidationPipe, controller-level BlockedCountriesGuard і create-by-uuid proof branch. Inline body має Object metatype, geo guard перевіряє тільки країну. Для вже наявного anonymous UUID код вимагає підпис device session; цей окремий захист працює за структурою коду й не позначається обходом. Новий anonymous bootstrap і purchase-token recovery — різні paths.
- `ai-timing`, `entry-flow-debug`, `estimate-non-openai-tokens`, `response-length`, `source-compression-policy`, `structured-reflection-progress`, `capsule-content-blocks`, `saved-source-message`, `prompt-token-breakdown`: **9 suites / 57 PASS**. No provider/DB requests, debug file writes mocked. Backend сукупно **1460 PASS / 13 FAIL / 107 suites** (+6 optional PG SKIP), frontend **734 PASS / 6 fixture FAIL / 2 blocked / 80 attempted suites**.
- Landing internal send-email: route source має local JWT role check без live DB lookup, але UI consumer нині не рендериться/закоментований, proxy i18n reachability не встановлена. Не додаємо як підтверджену експлуатацію revoked admin; live backend AdminJwtStrategy перевіряє DB active/role.

### Завершальна звірка HTTP-поверхні та додаткові contracts

- TypeScript AST inventory: **243 HTTP handlers у 59 controller files**. Статичний граф @Module imports від AppModule охопив усі знайдені класи цих controller files; AppModule не запускався. Dynamic third-party modules не інспектувались цим графом. Це coverage check, не 243 виконаних HTTP запити й не доказ безпеки кожного endpoint.
- Anonymous auth/OTP/session recovery мають свої secrets/proof flows; відсутність UseGuards не прирівнюється до дефекту. Відкриті admin/read/write flows звірено з попередніми NA-01/02/03/09/11/12, без дублювання номерів.
- `tokensToCredits`, `admin-new-users`, `forum-content-moderation-log.entity`: **3 suites / 38 PASS**. Admin statistics використовує metadata/SQL generation без DataSource.initialize/DB; billing conversion перевіряється локально. Backend підсумок **1498 PASS / 13 FAIL / 110 suites** (+6 optional PG SKIP). Frontend **734 PASS / 6 fixture FAIL / 2 blocked / 80 attempted suites**.
- Android config явно має usesCleartextTraffic:false; HTTP LAN URLs знайдені в development EAS profile. Не позначаємо це як доведений plaintext production transport. Generated release manifest/APK не оглянуто. WebView universal file access/mixed-content flags уже враховані в межах NA-25, без нового недоведеного твердження про читання SecureStore.

### Frontend sync / notification contracts — додаткові результати

- `localAccountTransition`, `useSubscriptionSync`, `useCommunitySync`, `localEntityNotifications`, `calendarReminderDeletion`, `localTimeNotifications`: **6 suites, 35 PASS / 2 fixture FAIL**. Expo notifications, filesystem, repositories, network/socket mocked; реальних сповіщень/видалень/акаунтів не було.
- Обидва failures у localEntityNotifications — старий fixture для dropDatabaseFiles не ініціалізує/не mock-ає activeVault. Поточний db/debug.ts спочатку викликає vaultDbDirectory(activeVault()), тому отримує LOCAL_ACCOUNT_LOCKED до cancellation; очікуваний тестом OS failure не досягається. Код і fixture не змінені. Це не доказ production-зависання чи втрати нагадувань.
- Сукупно frontend **769 PASS / 8 fixture FAIL / 2 blocked / 86 attempted suites**; backend **1498 PASS / 13 FAIL / 110 suites** (+6 optional PG SKIP). Нових ручних phone acceptance не зараховано.

### Уточнення доказу NA-22 — справжній ValidationPipe

- AST-extracted original syncUser method, constructor/decorators, TypeScript emitDecoratorMetadata та встановлений Nest ValidationPipe із точними main.ts options: body metatype=Object. Missing/null/empty purchaseToken усі проходять pipe і досягають synthetic service (3 виклики, DB/network=0). Empty-string forwarding саме по собі не доводить account takeover: ORM empty-string lookup має WHERE; небезпечний unfiltred lookup доведений раніше для missing/null.
- Спроба окремого disposable Nest HTTP harness з підставним service не виконала request: sandbox connect EACCES на loopback ephemeral port; app закрито у finally. Не викликали реальний port3001, permissions не обходили. Тому цей додатковий доказ — pipe/controller invocation, не успішний HTTP end-to-end тест.

### Memory pressure / media preprocessing

- `useMemoryPressureGuard`, `memoryPressure`, `aiVideoPreparation`, `mediaSavePermission`: **4 suites / 23 PASS**, native/file/encoder mocks. Підтверджено відсутність cleanup лише через високий PSS, повторне використання підготовленого відео, cleanup ownership і permission cancel semantics у відповідних тестах. Реальної пам'яті телефона/нативного encoder/AdMob не вимірювали.
- Frontend сукупно **792 PASS / 8 fixture FAIL / 2 blocked / 90 attempted suites**. Backend **1498 PASS / 13 FAIL / 110 suites** (+6 optional PG SKIP).

### NA-51 / P2 — невдале «Відкласти» прибирає показане сповіщення без заміни

- `diary-front/notifications/goalReminderSnooze.ts:46–94` спочатку dismiss delivered notification, потім setup channels і schedule. `futureEventReminders.ts:381–424` має той самий порядок. Мета негайного відгуку UI записана в коментарі й врахована; проблема — failure після dismiss, а не сама швидка реакція.
- Original snoozeGoalReminderNotification AST/VM, native stubs: trace delivered-dismissed → channels-ready → schedule-failed; promise rejects. Real native/phone/DB calls=0. Це відтворює втрату конкретного snooze при справжній відмові schedule/channel setup, не каже, що звичайне відкладання зламане.
- Живі callers: app/_layout.tsx → useNotificationListeners (foreground snooze catch порожній), index.js → backgroundNotificationTask (warn + Failed без явного відновлення). Ні користувацького повідомлення у foreground, ні retry/replacement у цих гілках не знайдено. Автоматичний retry з боку ОС не перевірено й не обіцяється.
- Наслідок: користувач натиснув «10 хвилин/година», повідомлення зникло, але повтор не запланований. Це reliability, не security exploit. Наступні незалежні occurrences серії не оголошуються втраченими.
- На розбір: узгодити transactional-like порядок «schedule confirmed → dismiss» там, де це допускає UX/ОС, або зберегти негайний відгук із явним відновленням/повтором та видимою помилкою. Не додавати довільну паузу, не показувати хибний success. Мінімальні тести failure setup/schedule після action, успішний snooze без дубля, повтор action same identifier, foreground feedback/background recoverable failure.

### Штатні reminder regressions

- 8 suites: futureEventReminders, deadlineGoalReminders, goalReminderSnooze, plannerTaskNotifications, calendarReminderNotifications, reminderPresentationRefresh, nemoryReminders, setupAndroidNotificationChannels. **95 PASS / 1 fixture FAIL**. Native queue/repositories/HTTP mocked; не повторне ручне приймання N6-REM-RESTORE.
- reminderPresentationRefresh fixture позначає елемент current лише reminderPresentationVersion=2, але не задає чинні localTimePolicy та scheduledTimezone. Код правильно вважає його застарілим для timezone migration. Це fixture contract drift, не доведене зайве перепланування справді актуальної черги.
- Frontend підсумок **887 PASS / 9 fixture FAIL / 2 blocked / 98 attempted suites**; backend **1498 PASS / 13 FAIL / 110 suites** (+6 optional PG SKIP). NA-51 перевірений окремим fault injection і не входить у 95 PASS.

### Додатковий reliability-сценарій: звернення до підтримки вже збережене, але клієнт отримує помилку

- `SupportService.createMessage` записує support row, потім await EmailsService.send. Mailgun/template failure відхиляє request після збереження. SupportController бере userId з JWT — підміни owner через DTO тут не знайдено; contact email навмисно окремий.
- Original createMessage AST/VM + synthetic repos/mail: дві однакові спроби дали trace save → mail-fail → caller-error двічі, savedRows=2. Ніяких листів/DB writes. Live client sendMessageApi → settings/support/Support; помилку користувач може сприйняти як незбережене звернення й повторити.
- Розглянути разом із post-commit notification handling NA-36, але **це не unhandled process crash**: send await-иться. Нижчий пріоритет, ніж відкриті support admin routes NA-01. Майбутнє рішення — durable notification delivery/outbox та недубльований підтверджений результат збереження; не ховати DB failure. Тести mail failure after save, retry idempotency, DB failure before mail.
- Support email template використовує escaped {{...}} для користувацьких полів; HTML injection через ці поля не підтверджена.

### Recurrence — додатковий локальний контроль

- recurrenceOverlap: **26 PASS**. recurrenceEnd suite заблокований Jest ESM transform для react-native-toast-message через imported future-events.service → recordPlannerCreation → apiRequest; тести цього suite не виконались. Runtime код/конфіг не змінено, provider/API не викликані.
- Frontend сукупно **913 PASS / 9 fixture FAIL / 3 blocked / 100 attempted suites**; backend **1498 PASS / 13 FAIL / 110 suites** (+6 optional PG SKIP).

### Startup / insertion completion contracts

- appContentBoot, mainAfterAuthBoot, useAppContentNotifications, useOfflineNotice, useMediaInsertionCompletion: **5 suites / 33 PASS**, storage/native/network dependencies mocked. No live app restart, phone interaction or provider calls.
- Frontend cumulative **946 PASS / 9 fixture FAIL / 3 blocked / 105 attempted suites**. Backend unchanged **1498 PASS / 13 FAIL / 110 suites** (+6 optional PG SKIP). These are automated results, not additional user acceptance.

### NA-52 / P2 — AI comment finalization does not settle after local failure; analytics failure can mark a saved reply as failed

- Live `diary-front/hooks/entry/useCreateEntryHandleSave.ts:1101,2780` contains two finalizeAiComment branches. Both catch local persistence/after-save failures, emit persistence-error, set ERROR and stop the loader, but return without handlers.onError/onDone. `logging/ai.ts` waits for one of those callbacks; its 60-second timer only records a warning. `runAIStream.ts` does not await the async onDone callback.
- Original AST-extracted finalizers + original runAIWithLogging in isolated VM, synthetic repository/analytics/storage only: both branches hit the injected repository error, returned from callback, set ERROR, and left the logging promise unsettled with no terminal result. Four probes also cover successful repo followed by analytics-storage refusal. Corrected branch-2 harness supplied localEntrySavePromise/newEntryId/aiTiming before counting evidence; no ReferenceError is presented as a product defect.
- With successful repo then rejected trackFirstAiReplyOnce: action sequence set-content → saved → error in both branches. Thus a durable answer is reported as failed because enqueueOnceAnalyticsEvent cannot read/write AsyncStorage. This is not failure of an external analytics destination: those sends normally run in the background. Ordinary successful analytics is not claimed broken.
- Scope: no proof of whole-app freeze, data deletion or continuous loader here (stopLoading explicitly runs). Unsettled operation/absent terminal telemetry is proven; downstream UI impact beyond ERROR needs a focused device test. Existing hooks tests replace runAIWithLogging with run({}, request-id), so they cannot catch this integration contract.
- Morning proposal: separate authoritative reply persistence from best-effort analytics, and settle the existing operation on every persistence failure. Preserve the error and recovery UI; do not add an arbitrary timeout. Minimal tests: repo refusal in both paths; repo success + analytics enqueue refusal keeps SAVED; success; ensure the real logging wrapper settles once with the correct outcome. No source changes performed.

### Public profile avatar / PIN settings checks

- usePublicProfileAvatar and SetPin: **14 PASS / 1 outdated presentation assertion**, two suites. Camera, upload, PIN storage and events mocked; no photos, uploads or PIN changes occurred.
- SetPin expected removed explicit Background props (settings-background/paddingTop=10); current component uses shared V2 Background/SettingsContainer. This assertion does not establish PIN bypass or a visual regression. PIN-save error/success behavior tests passed; no phone visual acceptance added.
- Frontend cumulative **960 PASS / 10 fixture or outdated assertion FAIL / 3 blocked / 107 attempted suites**. Backend unchanged **1498 PASS / 13 FAIL / 110 suites** (+6 optional PG SKIP).

### Remaining backend entrypoint / period validation regressions

- users.service, users.controller, plans.controller, daily-capsule, monthly-capsule-context, formatDateForPrompt: **84 PASS / 2 stale mock-arity FAIL / 6 suites**. Repositories/auth/paid providers mocked; no bootstrap AppModule or real account change.
- UsersController's two failures expect the old createUserByUUID argument list; live method now passes optional creationProof as a final undefined argument for these fixtures. No failed owner/geo assertion or runtime request error was demonstrated by those failures. This does not negate independently proven NA-22/NA-42: the happy-path tests do not reject the malicious inputs.
- Additional negative check: periodic-analysis service calls validateAnalysisPeriod before monthly snapshot expansion; valid day/week/month/year ranges are bounded to 31/366 days with real-date/timezone checks. Do not extend NA-09 unbounded public-statistics span to these guarded period-analysis flows.
- Backend cumulative **1582 PASS / 15 FAIL / 116 suites** (+6 optional PG SKIP). Frontend unchanged **960 PASS / 10 fixture/outdated assertion FAIL / 3 blocked / 107 attempted suites**.

### Prompt/normalization regressions and dynamic SQL review

- memory-capsule-v2, longitudinal-response-guidance, response-system-prompt: **117 PASS / 5 FAIL / 3 suites**, original functions with mocked provider/accounting. No paid generations, prompt changes or seed execution.
- Failures: three assertions call removed private helpers (buildDialogResponseDiscipline once, buildUserMemoryNormalizationDiagnostics twice); one expects an old literal deduplication sentence; one expects recordAiUsage without the newer final optional undefined argument. Current user-memory instructions still explicitly prohibit duplicate underlying facts across kinds and cap the combined problems/userMemory result. A sentence mismatch alone does not establish degraded model output. No live AI-quality conclusion follows from these unit assertions.
- Backend cumulative **1699 PASS / 20 FAIL / 119 suites** (+6 optional PG SKIP). Frontend **960 PASS / 10 fixture/outdated assertion FAIL / 3 blocked / 107 attempted suites**.
- Narrow dynamic SQL negative review: user-list sortSpec and admin-forum orderColumn select fixed server expressions; statistics granularity selects fixed SQL fragments, dates/timezone in the reviewed diary/user paths are bound parameters. No direct attacker-controlled ORDER BY expression demonstrated. Unknown granularity can still fail validation/execution; do not label it SQL injection without an executable expression path. Existing NA-09 range/auth issues remain.

### NA-53 / P2 — community avatar path can change the image request host

- Authenticated PATCH /forum/profiles/me accepts avatarUrl as optional string (max 500), without restricting it to an uploaded avatar path. ForumPublicProfilesService.updateMe trims and persists that field explicitly. Ownership of the profile is checked; this is not mass assignment.
- Live community TopicCard and topic/comment/reply avatar consumers build source.uri by directly concatenating EXPO_PUBLIC_API_URL and authorProfile.avatarUrl. The local production env has an origin-only HTTPS API URL without a trailing slash (only URL shape inspected; no credentials printed).
- Offline proof used the original DTO decorators and AST-extracted updateMe with a mocked repository: avatarUrl `@avatar-audit.invalid/pixel.png` passes validation (0 errors), is persisted unchanged, and concatenation with synthetic `https://api.example` resolves to host avatar-audit.invalid, with api.example parsed as userinfo. Network requests: 0. No production profile changed.
- Installed expo-image Android SourceMap constructs GlideUrl, and its Glide module routes remote loads through OkHttpUrlLoader. TopicCard supplies only uri, no Authorization header. No on-device external request was performed; native request execution remains unverified. The verified defect is accepting/persisting an address that changes the intended origin in the live source construction.
- Risk: a forum author can cause image loads toward a host they control when other users view their topic/comment, potentially exposing viewer IP/timing. Do not classify this as server SSRF, token theft, arbitrary native execution or proven authenticated cross-origin request. Disk caching may reduce repeated requests.
- Morning proposal: validate avatar paths against the existing upload namespace at the backend, and resolve/check image origins centrally in frontend consumers. Preserve existing valid uploaded avatars. Minimal checks: ordinary uploaded path accepted; @host, absolute URL and protocol-relative URL rejected; cards/comments/replies use the expected origin. No fixes applied.

### Additional frontend authentication and permission regressions

- requestNotificationPermission + entryAiAnalysisNotification: **16 PASS / 2 suites**, native notification/storage/event operations mocked. Existing tests cover refused permission, cancellation, returning from settings and analysis-card refresh fallback; no phone permissions changed.
- Three additional UI suites could not start: LoginForm and RegisterForm hit the already observed react-native-worklets/getUIRuntimeHolder test-environment mismatch; ProfileAccountModals supplies a react-i18next mock without initReactI18next, which fails after the current logout path imports i18n through switchAccountVault. These are blocked test setups, not evidence of failed real login, logout or deletion.
- Frontend cumulative **976 PASS / 10 fixture or outdated assertion FAIL / 6 blocked / 112 attempted suites**. Backend unchanged **1699 PASS / 20 FAIL / 119 suites** (+6 optional PG SKIP).
- In-memory-cache negative review: embedding in-flight promises remove themselves in finally; requestTimesByUser prunes stale users above its threshold. FX caches have size bounds, and failed NBU fetch removes its pending promise so retries can recover. AI error fingerprint cache prunes at its size bound. No unconditional permanent memory leak established in these paths; this is source review, not heap profiling.

### Follow-up negative checks: avatar deletion, OTP source and Android backup rules

- Original updateAvatar/deleteLocalAvatarFile executed with two synthetic profiles referencing the same avatar and mocked filesystem. Replacing one profile's avatar kept the other reference; unlink calls = 0. A slash traversal input also produced no unlink. Do not extend NA-53 to deletion of another user's current avatar: the existing remaining-reference check prevents this scenario.
- The Math.random-based genCode in common/utils/crypto.ts has no live OTP consumer in the reviewed imports (UsersService imports only sleep). CodeCore uses crypto.randomInt. No predictable-live-OTP finding added.
- Installed expo-secure-store backup/extraction XML includes shared preferences only and excludes SecureStore for cloud backup and device transfer. This does not establish that diary files/photos are automatically uploaded by Android; no such finding added. No merged release manifest/APK or actual OS transfer was inspected.

### Chat persistence / pending UI regression checks

- Four newly run suites (useEntryHandleAnswer, useChatSendWithMemory, usePendingAssistantDialogCommit, usePendingAiCommentCommit): **19 PASS**. Network, provider, repository and review-prompt effects mocked. Covered pending commit ordering, cancellation/preflight boundaries and stable message timestamps; no messages or media sent.
- Frontend cumulative **995 PASS / 10 fixture or outdated assertion FAIL / 6 blocked / 116 attempted suites**. Backend unchanged **1699 PASS / 20 FAIL / 119 suites** (+6 optional PG SKIP).
- Scope refinement for NA-52: the separate handleAssistantDialog finalizer explicitly calls handlers.onError on persistence rejection, unlike the two AI-comment finalizers. Ordinary entry first/second analytics run inside fireAndForget after saved state, and trackFirstActionOnce catches its own enqueue failure. Do not generalize NA-52 to all entry/chat saves or every analytics event.

### OPT-11 — community invalidations refetch a full per-topic unread snapshot

- ForumService.getUnreadSummary builds an unpaginated joined/grouped result for unread published topics and returns each topic UUID repeatedly across ID arrays and count/new maps. The settings.lang query is still executed although its language SQL predicate is commented out.
- Live flow: app/_layout.tsx mounts useCommunitySync; authenticated sockets join the shared community room; topic/comment mutations emit community_changed to that room. The client debounces events for 400 ms then fetches /forum/unread/summary even when the community tab is not foreground. Debouncing prevents one request per event during a short burst; it does not make the payload incremental. Do not claim duplicate summary fetch from the communityChanged screen listener: that listener refreshes topics only.
- AST-extracted original getUnreadSummary with synthetic rows and no database/network: 100 unread new topics -> 16,454 JSON bytes; 1,000 -> 163,155 bytes; 10,000 -> 1,630,156 bytes. These are uncompressed serialization sizes, not measured mobile wire traffic or current production counts. Actual SQL latency and compressed size remain unmeasured.
- Optimization candidate: measure production unread distribution and query plans first; separate cheap global badge totals from visible-topic details, reuse a shared revision/snapshot or targeted invalidation, and omit unused language lookup if behavior is intentionally language-neutral. Preserve existing/previous clients and new/watched/read semantics. Do not introduce an arbitrary unread cutoff or drop old unread topics silently.
- Minimal future checks: badge totals remain exact; loaded pages show correct per-topic unread state; read/mute/new-topic changes invalidate correctly; burst events coalesce; reconnect recovers missed changes; old clients retain their contract. No optimization applied.

### Notification entry / account appearance follow-up checks

- appPushPromptGate + openCalendarReminder: **13 PASS / 2 suites**, native and storage dependencies mocked. accountThemeSync: **18 PASS / 1 suite**, account-switch generation/revision checks and failed-save preservation included. No phone permissions, notifications, account or appearance settings changed.
- Frontend cumulative **1026 PASS / 10 fixture or outdated assertion FAIL / 6 blocked / 119 attempted suites**. Backend unchanged **1699 PASS / 20 FAIL / 119 suites** (+6 optional PG SKIP).
- Negative auth review: changeUserAuthData resolves the JWT email but verifyUser also compares the supplied hash and password against that resolved account. A stale JWT email alone does not demonstrate cross-account mutation after email reuse. No such finding added.

### NA-54 / P2 — landing mail route retains access after backend admin deactivation

- Backend AdminJwtStrategy.validate reads the current admin and rejects inactive/deleted accounts on every guarded request. In contrast, diary-landing/lib/auth.ts verifies the signature/expiry of admin_session and requireRole trusts active/role embedded in that token. It never consults current administrator status.
- Actual Next route app/internal/admin/send-email/route.ts exports POST, calls requireRole('ADMIN'), then its local Mailgun adapter. The protected action does not pass through the backend AdminJwtStrategy. This is a routable server handler even if its SendEmailDialog UI is currently not rendered: reviewed tables have an unused import or a commented invocation. No claim of a currently visible mail button.
- Offline original lib/auth + original POST route, genuine jose HS256 signature with an ephemeral synthetic secret, mocked cookies and mail transport: a previously active signed token remains accepted (200, one mocked send) when the authoritative admin is now inactive. Altering the signature returns 401 with no additional send. Original AST-extracted backend validate against the same synthetic inactive admin rejects with Admin inactive. Real HTTP/DB/Mailgun calls = 0.
- Prerequisite: possession of a previously issued, unexpired admin token. This is not anonymous access or signature forgery. Backend login defaults to a 30-day JWT lifetime unless configured otherwise; the actual deployed TTL and reachability of this landing route were not checked. Disabling the administrator does not invalidate the embedded active flag for this separate action.
- Proposal: route privileged mail through the shared backend authorization authority, or check current administrator status through that authority before sending. Preserve the existing role rules and handle authority unavailability without sending. Do not add a second independent admin revocation store.
- Minimal future tests: active admin can send; the same cookie after deactivation/deletion cannot; role downgrade cannot retain a higher role; invalid/expired token fails before transport; failed authorization lookup causes no email. No implementation changes made.

### Additional media access / cancellation checks

- aiMediaPolicy, prepareAiVideo, useAiMediaCatalog, reusedEntryMedia: **17 PASS / 2 fixture FAIL / 4 suites**. The two reusedEntryMedia cases fail with LOCAL_ACCOUNT_LOCKED because the old fixture does not initialize/mock the current activeVaultRoot boundary; this is not evidence that real media copies are broken. Native encoder, file storage and provider calls were mocked.
- Frontend cumulative **1043 PASS / 12 fixture or outdated assertion FAIL / 6 blocked / 123 attempted suites**. Backend unchanged **1699 PASS / 20 FAIL / 119 suites** (+6 optional PG SKIP).
- Negative review: AiResponseText renders native text from MarkdownIt with html:false, permits only http/https/mailto links and renders model image descriptions without fetching their URLs. Do not extend the imported-editor HTML issue NA-25 to automatic execution of ordinary AI response HTML.

### NA-55 / P2 — failed audio/video persistence drains pending attachments before metadata commit

- utils/files/entryMedia.ts persistPendingMedia drains the whole module queue with splice(0), then saves files sequentially and returns metadata only after every item succeeds. A failure in any savePrivateMedia discards the metadata accumulated so far and leaves no pending items for retry.
- Live consumers: TextReachEditor queues inserted video/audio; useSaveEditedEntry commits the entry and marks it saved before fire-and-forget attachment persistence. Both branches catch attachment failure as a console log and finally clearPendingMedia; upsertEntryMediaRepo is reached only after the complete persistPendingMedia call succeeds. useCreateEntryHandleSave has the same all-items-before-upsert ordering and logs the failure. This is an error-handling issue, not a claim about successful normal saves.
- Offline original entryMedia module, mocked active vault/filesystem and two synthetic video files: first file copied, second copy injected ENOSPC -> promise rejected; after removing the fault, retry returns zero metadata, pending count remains zero, first permanent copy remains without the batch's DB metadata. Original cache files remain in this probe; real filesystem writes/deletes = 0.
- getEntryCardMedia relies on attachment rows and returns no visible attachments when no rows exist; it does not reconstruct this drained queue from the orphan files. Consequently a saved entry can lack its newly inserted audio/video in card media, despite part of the batch having copied. Full phone playback/cache recovery was not tested; do not call this proven deletion of all original media.
- Proposal: preserve ownership and pending status until each attachment's file+metadata persistence succeeds, and expose/retry partial failure through the existing save lifecycle. Avoid clearing another operation's pending work or silently reporting all attachments saved. Do not fix with a timeout or by removing the account-vault boundary.
- Minimal future tests: second copy fails after first succeeds; metadata write fails after files copied; retry after storage recovery; new save while older cleanup finishes; normal photo/audio/video save and card visibility. No source changes performed.
- Follow-up confirms an overlapping-save variant without any disk failure: original AST-extracted shouldPersistImages branch from useSaveEditedEntry plus the original entryMedia module. Hold entry A's image-copy promise, queue A's video, then queue B's video before releasing the image promise. The original branch copies both videos, filters returned metadata to A's currentMediaIds, stores only A's row, and drains/clears B's pending item. B's later persist call returns zero metadata. All files/repos mocked, real writes = 0. The hook returns before this background branch settles; waitForPostSaveUiIdle waits only UI signals, not attachment completion. No account switch or malicious input is needed for the queue overlap. Actual phone timing/frequency remains unmeasured. Treat this as the same queue-ownership defect, not a second independent finding.

### Remaining periodic prompt contract check

- periodic-analysis.prompt: **5 PASS / 1 suite**, prompt assembly/token counting only, no provider or database. Backend cumulative **1704 PASS / 20 FAIL / 120 suites** (+6 optional PG SKIP). Frontend unchanged **1043 PASS / 12 fixture/outdated assertion FAIL / 6 blocked / 123 attempted suites**.
- Remaining backend suites were not blindly executed: system-profile-avatar starts an HTTP harness (earlier isolated bind was denied), and seed-forum-system-users is not required for the current auth/billing audit. No AppModule/seed execution performed.

### NA-56 / P1 — landing uses a vulnerable Next.js proxy authorization path

- Local installed package and lockfile: Next.js 16.0.10, sharp 0.34.5; React/react-dom 19.2.3. Production installed artifacts were not inspected. No package updates performed.
- Official Next.js advisory [GHSA-267c-6grr-h53f](https://github.com/vercel/next.js/security/advisories/GHSA-267c-6grr-h53f) includes 16.0.10 in the affected range for App Router segment-prefetch authorization bypass. [Follow-up GHSA-26hh-7cqf-hhc6](https://github.com/vercel/next.js/security/advisories/GHSA-26hh-7cqf-hhc6) records an incomplete Turbopack fix; the original 16.2.5 recommendation alone is insufficient for the follow-up.
- Current proxy.ts protects /admin and /admin-v2 but skips dotted paths both in config.matcher and its pathname.includes('.') branch. Shared AdminShell reads getAdminSession only for presentation and renders children even when session is null; both admin layouts use it. The admins page adds requireRole separately, but reviewed support/user-info pages do not. Backend guards still independently protect guarded APIs; public data routes NA-01/02/09 remain separate defects.
- Offline original proxy + installed Next getMiddlewareMatchers and pathname normalizers, no server/HTTP/private data: /admin/support matches and unauthenticated proxy execution redirects; /admin/support.rsc does not match and direct proxy execution returns next. Installed RSC normalizer maps the latter to /admin/support. The segment-specific normalizer likewise extracts /admin/support from /admin/support.segments/_tree.segment.rsc while the matcher skips it. These are confirmed matcher/normalizer inconsistencies, not a full deployed RSC content extraction. Initial generic-normalizer output for the segment URL was superseded by checking the specific normalizer; do not infer production routing order from that harness.
- Recommendation: coordinated Next/React dependency update and authorization at the actual protected data/action boundary, rather than sole reliance on proxy URL matching. Validate release/lockfile and deployment artifacts; maintain API authorization even after proxy is patched. No live bypass/DoS/RCE request was sent.
- Other advisories were checked for prerequisites, not counted as automatic additional exploits. No use-cache functions or use-server directives were found in app/components/lib; therefore [typed-array cache RCE](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr) and [Server Actions DoS](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r) are not demonstrated reachable here. Their October patched Next release is 16.4.1, which supersedes the earlier May patch floor; recheck maintained releases when implementing.
- [next/og RCE GHSA-vcvr-r3jv-pc5j](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j) covers >=16.2.0 <16.3.6, not this installed version. The current OpenGraph route also reduces locale to uk/en and uses fixed text/assets. Do not label it vulnerable merely because ImageResponse is imported.
- [SVG optimizer advisory GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw) requires attention to sharp and Linux deployment, but current default dangerouslyAllowSVG=false and remotePatterns=[] provide relevant input restrictions. Actual attacker-controlled SVG delivery/glibc runtime were not demonstrated. Do not claim proven remote execution from the version alone.
- Minimal future verification: unauthenticated normal/RSC/segment routes reveal no protected content; active admin works; expired/deactivated credentials fail; direct backend APIs remain protected; locale routing, images and admin login work after upgrade. Only public official advisories were fetched; private dependency inventories were not uploaded and the blocked npm audit was not retried.

### Additional media UI / recording contract checks

- DialogMediaActions, SavedDialogMedia, entryCardMedia, recordAudioResult: **20 PASS / 4 suites**. File/native/database dependencies mocked; no recordings, private files or phone state changed.
- Frontend cumulative **1063 PASS / 12 fixture or outdated assertion FAIL / 6 blocked / 127 attempted suites**. Backend unchanged **1704 PASS / 20 FAIL / 120 suites** (+6 optional PG SKIP).
- Additional negative route check: users/get-one-by and ai-response-monitoring are protected by admin-jwt; forum reports list/status likewise require admin-jwt, while own mentions/watchers/views derive the principal from jwt. Do not infer these are public merely from nearby unguarded controllers.

### Registration / image generation / editor bridge checks

- RichEditorBridge, imageGenerationApi, createAnonymousUserApi, registerUserApi: **41 PASS / 4 suites**. These include rejecting pending editor reads on unmount/native failure, stale registration-session response rejection and image-reference compatibility/error handling. No backend/provider/phone calls.
- Frontend cumulative **1104 PASS / 12 fixture or outdated assertion FAIL / 6 blocked / 131 attempted suites**. Backend unchanged **1704 PASS / 20 FAIL / 120 suites** (+6 optional PG SKIP).
- Forum mentions read route is registered and loads full mentionedByUser; apply the shared public-user projection review from NA-10 there too. No current caller of ForumMentionsService.createMany was found, so populated mentions through the current ordinary workflow are not claimed or tested. Forum views has a DB unique user/topic constraint inside its transaction; concurrent first views may fail rather than double-count, so no proven double-count finding.

### Additional API adapter checks

- communityEndpoints, signInWithGoogleApi, subscriptionWithoutPlanApi, classifyApiError: **22 PASS / 1 outdated assertion FAIL / 4 suites**. The failing subscriptionWithoutPlanApi assertion expects an exact old request object; current updateUserApi also supplies showErrorToast:true. Route, method and submitted user flag match. This does not demonstrate a failed subscription operation; no real request was made.
- Frontend cumulative **1126 PASS / 13 fixture or outdated assertion FAIL / 6 blocked / 135 attempted suites**. Backend unchanged **1704 PASS / 20 FAIL / 120 suites** (+6 optional PG SKIP).
- Admin-role review: do not infer SUPER_ADMIN-only policy for change-user-role solely from the admins page. The same role/status dialogs are actively rendered in user-info as well. Backend uses admin-jwt and these are User roles, not Admin entity roles. No demonstrated unauthenticated/admin-token privilege escalation was added from this UI difference.

### NA-57 / P2 — null API error body breaks the common error handler

- Frontend utils/api/apiRequest.ts safely normalizes response.data in extractErrorMessage, but then directly reads err.response.data.statusCode/code. An HTTP error whose parsed JSON body is null throws a new TypeError before the original error/toast/telemetry marker is returned.
- Original module transpiled and executed in VM with a rejecting synthetic transport: status500 + data:null yielded `Cannot read properties of null (reading 'statusCode')`, preserved original error=false, toast count0. Controls data:'' and ordinary JSON object preserved the original error and emitted one toast each. No HTTP request was made. An empty HTTP body commonly becomes an empty string; do not incorrectly equate every empty response with this null case.
- Risk: caller loses status/error classification and common user feedback for this malformed/unusual response. A caller's finally still runs; this probe alone does not prove an indefinitely stuck loader. Real production occurrence has not been observed.
- Morning proposal: normalize the error payload once, preserve the original Axios error, and use status/statusText fallback when JSON structure is missing. Minimal cases: null, string/HTML, normal API object, moderation and plan errors. No fix applied.

### OP-05 — ordinary frontend requests lack an application deadline; error feedback can await another native call

- apiClient is created with baseURL only; no timeout/signal assignment was found later in that module. getTopicByIdApi and other ordinary community requests pass no config timeout. The same installed Axios default is timeout0; NETWORK_TIMEOUT_MS=30000 exists and is explicitly used by onboarding/subscription/refresh paths, while media/AI use their longer budgets.
- Source trace: ViewTopic waits for loadTopic before the loading lifecycle finally can settle. It already has an independent offline UI branch, so this is not a claim that the previously accepted offline test regressed. A connection still reported online with no completed server response lacks this application's own deadline; transport/OS may eventually fail independently. No real blackhole request or indefinite phone hang was produced.
- Separate bounded original-module VM check: after transport already rejected, apiRequest with showErrorToast=true stayed pending until the mocked NetInfo.fetch promise resolved; immediately after resolving it the original request rejected normally. Native NetInfo hanging in practice is not established. Network-state lookup currently gates propagation of an already known transport failure merely to choose toast wording.
- Morning proposal: retain sufficiently generous existing transport budgets, distinguish ordinary/media/AI requests, and avoid making network-error settlement depend on optional diagnostic lookup. Do not add 2–3-second UI cutoffs or abort successful local work. Minimal tests: normal slow response, online/no response, immediate transport failure with pending NetInfo, explicit cancellation, existing offline topic recovery.

### Further frontend regression checks

- useRichEditorFormatting, useMediaInsertionFocus, themeSessionMigration, onboardingConfigApi, backgroundMetadata, addStatsApi, recordPlannerCreation: **69 PASS / 7 suites**. All mocked/local; no application account, file exports or provider requests changed.
- Frontend cumulative **1195 PASS / 13 fixture or outdated assertion FAIL / 6 blocked / 142 attempted suites**. Backend unchanged **1704 PASS / 20 FAIL / 120 suites** (+6 optional PG SKIP).
- Confirmed installed Axios default timeout0 locally for OP-05. Export copy helper review agrees with its already-run 19 tests: bounded chunks, closes handles, validates byte count and destination size, cleanup targets only its newly created destination. Do not label legitimate user-selected export location reuse as an automatic cross-account data disclosure.
- AI replay backup validates asset UUIDs and key namespace, filters restored entries to the selected owner, and reads opaque authenticated ciphertext. No new plaintext export or owner-bypass finding from that path; existing replay-cache checks are not rerun solely for more counts.

### NA-58 / P2 — entry/check-in stream disconnect skips partial usage accounting

- Live entry/check-in gateway callbacks throw AI_STREAM_CLIENT_DISCONNECTED when client.disconnected becomes true. AiService.generateComment passes onToken into executeResponse and supplies runtime.outputLimit/outputPurpose, but no AbortSignal. streamOpenAiChat catches stream/callback errors and only returns partial usage when runtime.signal.aborted is true; otherwise it rethrows before executeTextResponse reaches persistAiUsage. Gateway then suppresses the expected disconnect error.
- Original AST-extracted executeTextResponse + streamOpenAiChat + the exact handleStreamAiComment callback executed in a VM. Provider, account affordability, pricing/token estimation and persistence were mocks; no real AI/network/DB calls. Normal control: 3 generated/delivered chunks, iterator closed, persistedUsage=1. Flip client.disconnected after the first emitted chunk: 2 generated, 1 delivered, iterator closed, persistedUsage=0, rejection AI_STREAM_CLIENT_DISCONNECTED. This establishes missing bookkeeping on that execution path, not a measured production cost or a full free completed response.
- Actual frontend useCreateEntryHandleSave and runMemoryRetrievalReflectionV2 still call stream_ai_comment/stream_ai_checkin with supportsStructuredProgress:true. The structured progress helper synchronously forwards partial text to the same callback without isolating its rejection. The probe used the plain streaming branch; the current structured branch was traced in source, not separately provider-tested. Claude has the same signal-only catch pattern in source; do not count that as a separate executed provider test.
- Contrast within the implementation: conversation/periodic handlers already use an AbortController, and an existing provider test covers recording observed partial usage before abort rejection. Current executeTextResponse explicitly states received partial answers remain billable. This is a gap between live adapters, not a proposal to charge operations that never began or failed before delivering any answer.
- Morning proposal: connect entry/check-in disconnects to the existing cancellation/accounting lifecycle, preserve observed/provider usage according to the agreed policy, and prevent follow-up work/completed-result persistence after cancellation. Do not catch every arbitrary provider error and pretend it is successful. Minimal tests: disconnect after partial answer, before first answer, normal completion, structured progress, provider failure, and existing periodic/conversation cancellation. No fix applied.

### Server boundary follow-up refinements

- NA-34 caller trace reconfirmed: legacy recordAiUsage calls calculateCredits before syncLegacyPlanToUserPlanState, without a surrounding row lock/transaction. The V2 path uses a separate pessimistic-write transaction; no extension of the legacy lost-update finding to V2.
- /admin/forum/ai-moderation-results also uses ordinary jwt and returns complete moderation-result rows, but no live caller of its create service was found. Treat as a related NA-28 guard-hardening scope with unknown populated data, not another demonstrated current data leak. The test-email route is commented out and is not an executable public mail endpoint.

### Subscription, diagnostics and native-file follow-up

- Eight frontend suites (setupGlobalErrorHandlers, consoleError, publicProfileSlice, publicProfileThunks, subscriptionSlice, getUserSubscription, plans, subscriptionAccess): **38 PASS**. Five further suites (patchExpoFileSystemSafHandle, withForegroundOnlyExpoAudio, saveImageToGallery, entryBackgroundThumbnail, buildMediaLibraryRows): **18 PASS**. Patch tests transform synthetic source strings only; no postinstall/native build was run.
- Frontend cumulative **1251 PASS / 13 fixture or outdated assertion FAIL / 6 blocked / 155 attempted suites**. Backend unchanged **1704 PASS / 20 FAIL / 120 suites** (+6 optional PG SKIP).
- No generated application android/ checkout exists in this working tree. Installed expo-sharing and expo-file-system manifest sources declare their providers exported=false, grantUriPermissions=true. Broad files/cache paths therefore do not alone establish external arbitrary-file access: an actual URI grant is needed. App config blocks broad photo/video read permissions; custom notification receiver is declared exported=false. Final merged release manifest/APK was not inspected and no prebuild/device operation was performed.
- Diagnostics reinitialization probe: three original setupGlobalErrorHandlers calls followed by one synthetic fatal error invoked eventLog/crashLog three times and the original platform handler once. Root cleanup does not restore that wrapper; this is a minor repeat-initialization hardening candidate. Both real telemetry sinks already deduplicate identical events within800ms, so do NOT report this as three actual network uploads or the cause of prior1GB DEV memory usage. No heap/profile evidence or ordinary production repeated-root-init frequency was established.
- Session-manager storage read/write failures are caught internally. The bare root onAppLaunch promise is not, by itself, proof of an unhandled ordinary storage error.

### OPT-08 backup checkpoint follow-up — bounded real SQLite fixture

- Current db/backup/backup.service.ts createEncryptedBackup drains the existing JS DB queue once, executes wal_checkpoint(TRUNCATE) with execAsync (no result inspection), then separately reads the main DB file. Backup screen only sets its own loading state; it does not hold the DB queue barrier over snapshot creation. cloneVault already uses getFirstAsync and rejects checkpoint.busy!=0, but that is a separate account-copy flow.
- Disposable node:sqlite WAL fixture with two synthetic rows and a second connection holding an old read snapshot: row2 committed before checkpoint; checkpoint returned {busy:1,log:1,checkpointed:0}; copying only source.db produced count1 while live source count2, and copied quick_check still returned ok. Temporary source/copy/WAL files were removed after both connections closed. No Nemory database, SQLCipher key or phone was accessed.
- Evidence boundary: ordinary app DB reads/writes use one shared getDb connection and withDbLock; the additional openVaultDb connection is used by account/restore helpers. A simultaneous reader connection during normal backup in the actual app was NOT demonstrated. This proves the consequence of ignoring a busy checkpoint under that prerequisite, not that current backups routinely lose rows. Native SQLCipher file-copy concurrency remains untested. Retain as OPT-08 reliability candidate rather than another confirmed P1/P2 incident.
- A write beginning after a successful checkpoint can also leave later work outside the exported main file, but omission of work that began after the snapshot point is not automatically a defect. Define the intended snapshot boundary before changing this flow; prefer a consistent supported SQLite snapshot or a short scoped barrier and checked checkpoint, preserving normal background operation outside that boundary.

### Onboarding and media regression follow-up

- TextReachEditorMediaControls, NemoryMediaPicker, ToolbarMediaDialogs, MediaSourceDialog: **33 PASS / 4 suites**. initAnonymousUser, persistListener, updateUserName: **24 PASS / 3 FAIL / 3 suites**. No phone, real storage, network or account operations.
- updateUserName failure expects two arguments while the current API call also supplies {showErrorToast:undefined}; successful name-update behavior is not disproved. Two persistListener assertions read raw AsyncStorage key settings, while current saveSettings imports account/preferenceStorage and scopes settings to the current vault. These old unscoped assertions cannot establish a real settings-loss regression; account-scoped persistence requires its own fixture. Test sources unchanged.
- Frontend cumulative **1308 PASS / 16 fixture or outdated assertion FAIL / 6 blocked / 162 attempted suites**. Backend unchanged **1704 PASS / 20 FAIL / 120 suites** (+6 optional PG SKIP).
- Refined NA-04: admin_session is host-only, and the landing login uses its own /api proxy path. Do not assert API-host HTML automatically gains the landing's authenticated session. Actual deployment cookie/upload topology and security headers must be checked before calling this an administrator compromise. No exploit against real accounts performed.

### NA-59 / P2 — overlapping Google subscription verification can apply an older snapshot last

- src/subscriptions/subscriptions.service.ts syncGooglePlaySubscription fetches Google state before acquiring the transaction's StoreSubscription row lock. After the lock, it merges the fetched snapshot without checking whether that row changed since verification began. Any different lastOrderId is treated as a new credit cycle. The expectedCurrent guard is used by elapsed-period reconciliation, not ordinary handleGooglePlayPubSub. GooglePlaySubscriptionsService.verifyAndroidSubscription has no per-token serialization around the API request; the reviewed RTDN controller directly awaits this service.
- Executed original AST methods handleGooglePlayPubSub, syncGooglePlaySubscription, deriveStoreAccessStatus/Reason with original catalog, enums, deferred-cycle and store-access helpers. Fake repositories/serialized transactions and a deferred Google mock only; no AppModule, Google, production or DB calls. Request A starts against the old cycle and remains pending. Request B returns renewal ..1, expiry2030-12-01 and commits. Fixture then records123 used credits. A finally returns older ..0, expiry2030-11-01: final stored order becomes ..0, expiry moves back to November, usedCredits becomes0. A same-order control preserved123. Four mock provider calls total.
- A transaction row lock serializes writes but cannot make an already fetched response current. This requires overlapping verification snapshots straddling a real state change; mere out-of-order notification delivery is not sufficient because each event normally fetches current Google state. No occurrence/frequency or financial loss in production demonstrated. Financial-details enqueue and external event logging were replaced by inert mocks/omitted optional adapter; this probe establishes subscription/credit state behavior, not their downstream effects.
- Morning proposal: serialize or version the existing verify-and-apply lifecycle per purchase token across relevant workers, or detect a changed persisted revision and reverify before applying. Do not simply take the maximum expiry or forbid every shorter period: legitimate refunds, revocations and entitlement changes must still work. Avoid holding a database transaction over an unbounded network call. Tests: old verification delayed past renewal, same-cycle repeats, normal renewal, refund/cancellation, deferred downgrade, ownership transfer and multiple workers. No fix applied.

### Additional bounded checks

- deferredSetup, attribution, initialConversationLanguage, previewMode: **44 PASS / 4 suites**; usePeriodicAnalysisReports and removeUserMemoryFtsMigration: **4 PASS / 2 suites**. Frontend cumulative **1356 PASS / 16 fixture or outdated assertion FAIL / 6 blocked / 168 attempted suites**; backend unchanged **1704 PASS / 20 FAIL / 120 suites** (+6 optional PG SKIP). NA-59 is a separate VM probe, not an extra Jest suite.
- Home-page JSON-LD uses a fixed locale choice and escapes less-than signs after JSON serialization; no additional script-context injection found there. Existing dangerous notification-table HTML is already covered by NA-03 rather than counted twice.
- Ten-minute credit jobs currently target pending financial details and pending consumption. Do not confuse these with a recurring scan of all completed purchases for refunds; no such scan was inferred from the scheduler interval alone.
- useHabitStatsForDay and useGoalMilestoneCompletion: **12 PASS / 2 suites**; rootRuntimeEffects: **8 PASS / 1 suite**. Frontend cumulative **1376 PASS / 16 fixture or outdated assertion FAIL / 6 blocked / 171 attempted suites**. These are local mocked regressions, not additional phone acceptance.
- Negative lookup check: UsersService.findByEmail explicitly returns null for a missing/empty email before calling TypeORM. Do not generalize NA-22's undefined purchase-token lookup to every email-based endpoint. Reset/delete OTP purpose checking and bounded attempts remain separate existing protections.

### NA-60 / P1 — active Socket.IO dependency chain contains published parser/transport DoS defects

- Verified installed manifests, package-lock and actual module resolution: Nest platform-socket.io -> socket.io4.8.1 -> socket.io-parser4.2.4 and engine.io6.6.4. Engine.IO resolves its own nested ws8.17.1, not the root ws8.18.3. Thus checking only the top-level ws version would miss the active server dependency. No package installation/update or inventory upload performed.
- Maintainer advisories: [parser unbounded attachments](https://github.com/socketio/socket.io/security/advisories/GHSA-677m-j7p3-52f9) fixes4.2.6; [zero-attachment retention](https://github.com/socketio/socket.io/security/advisories/GHSA-2m8v-j782-fhvr) additionally needs4.2.7. A bounded local original Decoder probe used only3 one-byte buffers: a zero-attachment packet was emitted once, yet its reconstructor retained buffers1,2,3; a declared100-attachment control also retained these3. Decoder.destroy called afterwards. No socket, large allocation, flood or OOM test.
- [Engine.IO protocol mismatch](https://github.com/socketio/socket.io/security/advisories/GHSA-2gc4-cqfq-p2gv) affects6.6.0–before6.6.10; [polling connection exhaustion](https://github.com/socketio/socket.io/security/advisories/GHSA-r635-g3xr-vw7x) affects this6.6.4 as well. Current gateways configure CORS but no transport/upgrade restrictions; default installed options allow polling+websocket and upgrades. No custom adapter/allowRequest override found in src. Installed onWebSocket forwards an existing session's upgrade without comparing protocol revisions. Protocol-crash exploit was NOT run.
- Original Polling.onDataRequest invoked once on synthetic protocol4 request/response mocks: invalid binary content calls onError once but writeHead/end zero times. This matches the advisory's missing response cleanup; no real connections opened or leaked. Nest HTTP guards do not constitute proof of protection for Engine.IO's lower-level transport handling; production reverse-proxy restrictions remain unknown.
- [ws fragment exhaustion](https://github.com/websockets/ws/security/advisories/GHSA-96hv-2xvq-fx4p) includes nested8.17.1 and root8.18.3, fixed in8.21.0. Version/reachability evidence only, no fragment flood. Separate [TypedArray close-reason disclosure](https://github.com/websockets/ws/security/advisories/GHSA-58qx-3vcg-4xpx) has an extra application-misuse prerequisite not demonstrated here; do not claim a live secret disclosure merely from the version.
- Morning proposal: controlled compatible Socket.IO dependency update resolving parser>=4.2.7, Engine.IO>=6.6.10 and its nested ws>=8.21.0 (then verify current supported patches), with lockfile verification. Do not blindly force major upgrades or disable transports without checking previous released clients. Minimal regressions: auth rejection, AI streaming/cancellation, community/plan notifications, reconnect and polling-to-websocket upgrade. New isolated malformed-packet tests should be bounded and should verify rejection/cleanup rather than attempting resource exhaustion. No fixes applied.
- Frontend locally resolves socket.io-client4.8.3 with parser4.2.6: include that parser in the update review for the zero-attachment advisory, but client exploitation requires receiving malicious transport data. The ordinary trusted backend's current messages were not shown to trigger it; no extra independent frontend vulnerability ID assigned.

### Preferences and catalog follow-up

- calendar/today preferencesStore, planning sort/archive/appearance preferences, saveMetricTracking, saveCheckinSettings: **38 PASS / 7 suites**. Frontend cumulative **1414 PASS / 16 fixture or outdated assertion FAIL / 6 blocked / 178 attempted suites**; backend unchanged **1704 PASS / 20 FAIL / 120 suites** (+6 optional PG SKIP). Local mocked tests only; no phone acceptance implied.
- Shared createPreferencesStore serializes changes and publishes the next value only after persistent storage succeeds. Metric/check-in save thunks check the account identity and returned settings before merging that specific field into current state. No additional lost-write finding established from these paths.
- The shared memory-tag catalog is populated from fixed seeds; the reviewed markUsed path increments usageCount/lastUsedAt for existing keys. No creation of personal user tag names in that global catalog was found, so no cross-user personal-tag disclosure claimed.
- Backend prompt-usage diagnostics are disabled in production and prune aged entries; debug cache-comparison collection is capped. These observations do not explain the phone's previously reported DEV memory growth, for which no current heap evidence was collected.

### NA-61 / P2 — consolidation cleanup removes provenance needed to forget a deleted source

- Frontend db/services/user-memory-consolidation.service.ts runs deletePreviouslyAbsorbedUserMemoryItemsRepo at the start of a later consolidation cycle. That helper physically deletes absorbed V2 rows. Both foreign keys in userMemoryConsolidationMigration use ON DELETE CASCADE, so their lineage links disappear too. The retained consolidated row has source_id=NULL.
- deleteEntryByIdTx correctly calls deleteUserMemoryItemsBySourceRepo. Its recursive query starts from memory rows whose source_id matches the deleted entry and traverses surviving lineage links. After the cleanup above, neither starting row nor link remains; the consolidated fact stays active despite containing information derived from the deleted entry.
- Bounded original-code proof: extracted original apply/consolidation-cleanup/source-deletion functions, original migration and original user_memory_items CREATE statement executed against node:sqlite :memory: with foreign_keys=ON. Two synthetic source rows -> one combined row. Control without cleanup: deleting entry-a invalidated the combined row and restored source-b to active. With cleanup first: two absorbed rows deleted, links fell from2 to0, then deleting entry-a left the combined A+B row active with source_id=NULL. No real database, disk file, journal, AI call or seed was used.
- Live reachability: saveAssistantMemoryCapsuleV2Repo schedules consolidation after ordinary unwrapped capsule persistence; entry-create and check-in consumers call it. The next due batch performs cleanup. runMemorySemanticSearchShadowV2 reads all active user memory while its context-limit flag is false, so an active orphaned consolidated row remains eligible in that mode. Relevant-only vector retrieval additionally requires an embedding (separate NA-62 below); do not claim every orphaned row is always selected. Actual later model response was not executed. This is local retention/retrieval risk, not demonstrated cross-account or external disclosure.
- Morning proposal: preserve sufficient source provenance for deletion/recomputation while avoiding unnecessary duplicate full text. Extend the existing lineage mechanism rather than introducing an unrelated memory store. Test deletion before and after subsequent cleanup, multilevel consolidation and mixed surviving/deleted sources. Do not simply delete all consolidated memory or remove requested cleanup without reviewing its purpose. No fix applied.
- Existing mocked consolidation repository/service suites both pass (**19 tests**), but test cleanup and source deletion separately. They do not cover the combined real-SQL cascade sequence reproduced here.

### Additional persistence and access checks

- memoryCapsulePersistenceV2, originalMemorySources, entryEmbedding, checkinEmbeddingSave: **39 PASS / 4 suites**. Consolidation suites above add **19 PASS / 2 suites**. Frontend cumulative **1472 PASS / 16 fixture or outdated assertion FAIL / 6 blocked / 184 attempted suites**; backend unchanged **1704 PASS / 20 FAIL / 120 suites** (+6 optional PG SKIP). SQLite probe is separate from Jest counts.
- Account-switch follow-up: prepareAccountVault freezes storage and restartAccountRuntime reloads the JS runtime; getDb calls activeVault and refuses the frozen/mismatched runtime. A missing account variable inside consolidation alone therefore does not establish a write into the next account's journal. No duplicate account-race finding assigned.
- PIN foreground behavior is a product-policy question, separate from NA-27: reviewed root/auth code authenticates at initial entry and has no automatic PIN re-lock on ordinary AppState background/active. The similarly named sessionManager only tracks analytics sessions. Settings promise four digits for entry but do not specify a re-lock interval. No cold-start PIN bypass or device exploit demonstrated; discuss whether return-from-background protection is desired before changing accepted behavior.

### NA-62 / P2 — newly consolidated memories have no vector for relevant-only retrieval

- applyUserMemoryConsolidationGroupsRepo creates a new memory UUID and marks its input rows absorbed, but neither it nor runUserMemoryConsolidation indexes the new combined content. The ordinary embedding writer is saveEntryRetrievalIndexV2Tx, scoped to memory rows belonging to the current entry; consolidated rows have source_id=NULL. No production backfill/reindex consumer was found; debug seed writers are not a runtime recovery mechanism.
- findSimilarUserMemoryByEmbeddingsV2 joins the active-memory list with embedding rows by memoryItemId and verifies contentHash. Source vectors cannot match the new consolidated UUID, and absorbed inputs are absent from the active list. runMemorySemanticSearchShadowV2 uses these vector matches for user memory once embeddingFilteringActive/context-limit mode is enabled; before that, all-context mode can still include the combined text.
- Bounded in-memory SQLite proof used original schema/migrations, original apply/read/write helpers and rankUserMemoryByEmbeddingsV2, synthetic two-dimensional vectors only. Before consolidation: active[a,b], indexed[a,b], matches[a,b]. After consolidation: active[combined], indexed[a,b], matches[]. Synthetic control inserting a vector for combined restored matches[combined]. The evidenceCount SELECT expression was simplified in the harness; that field is not involved in matching. No provider request, file, actual index or seed changed.
- Effect: semantic retrieval loses the combined long-term fact in relevant-only mode. Not a claim that all AI context disappears: full original-entry retrieval and the earlier all-context mode remain separate paths. Actual model response/phone acceptance not tested.
- Morning proposal: extend the existing indexing lifecycle to newly combined content, track/retry indexing failures, and preserve a safe retrieval path until replacement indexing succeeds. Never reuse a source vector for different combined text merely to satisfy the ID lookup. Tests: before/after consolidation in both context modes, index failure/retry, model change, and deletion/provenance from NA-61. No fix applied.

### NA-63 / P2 — consolidation scanning can remain stuck on its first incomplete page

- runUserMemoryConsolidationIfDue reads at most MAX_PENDING_SOURCE_SCAN=500 sources from completedSourceCount. If their remaining active facts total less than6000 tokens, it returns without advancing or continuing to the next page. Subsequent calls read exactly the same page even when later sources would fill the batch. Source registration is based on assistant capsule completion, not on the existence of extracted long-term facts; deletion also can leave early sources without active facts.
- Original runUserMemoryConsolidationIfDue and token-batch selector executed in VM with synthetic repositories/token counter. Fixture:501 registered sources, first500 with no active facts, source501 sufficient to reach the threshold. Two ordinary attempts both requested offset0/limit500, performed0 consolidations, cursor stayed0. Control beginning after the empty first500 reached source501 and advanced to501. Token counter was deliberately mocked (12 for empty wrapper,6001 with the synthetic final fact); no claim of a measured token volume or actual user dataset. No AI/DB/seed calls.
- This is pagination starvation under a concrete prerequisite, not a blanket objection to numeric limits or a claim that every user with500 entries is affected. The first scanned page usually consolidates normally when it reaches the threshold. Increasing the cap merely moves the same boundary.
- Morning proposal: continue scanning bounded pages while accumulating the pending batch, or explicitly account for processed empty sources while retaining nonempty under-threshold facts. Preserve retryability after AI failure and avoid silently discarding short memories. Test empty/sparse first page plus later eligible facts, an ordinary one-page batch, and failure/retry without cursor loss. No fix applied.

### Civil-time and transaction follow-up

- entityCreationTime, entryCivilTravel, plannerCivilTravel: **65 PASS / 3 suites**, using mocks and an in-memory SQLite fixture. calendarRemindersDay could not start because its current import chain reaches untransformed react-native-toast-message ESM. This is a test-environment blockage, not evidence of broken reminder dates. No Jest/source configuration changed.
- Frontend cumulative **1537 PASS / 16 fixture or outdated assertion FAIL / 7 blocked / 188 attempted suites**; backend unchanged **1704 PASS / 20 FAIL / 120 suites** (+6 optional PG SKIP).
- Focused AST scan of db/services found no direct inTx/inReadTx/inWriteTx/withDbLock or *Tx calls inside those transaction callbacks. This only rules out that direct shape; it does not establish absence of indirect lock cycles across the whole application. The DB queue releases after rejection so an ordinary rejected transaction alone does not poison every later queued operation.

### NA-64 / P2 — legacy reminder worker can undo a successful cancellation

- src/push-notifications/user-reminders.service.ts claims pending rows as processing, then awaits a batch push. cancel allows processing -> cancelled. When the earlier worker resumes, both its success and failure updates filter only by reminder.id, without the claimed status/revision. A failed push attempt therefore changes a concurrently cancelled reminder back to pending (or failed), allowing a later worker to send it again.
- Original processDueReminders and cancel methods executed in VM with synthetic repository/claim/push adapters. Deferred first push, successful cancel returned cancelled, first push then reported no accepted token: persisted status became pending, attempts1. Next worker with a successful push mock ended sent; mock push invocations2. No real row, token, phone notification, provider or cron invocation.
- Reachability: authenticated cancel controller and PushNotificationsCron still call these services. Current clients keep new reminder content locally and migrate legacy server reminders; this finding is scoped to existing server-backed reminders/previous released clients. It does not invalidate accepted current local-reminder tests. Cancellation after a push has actually been delivered cannot unsend it; the demonstrated defect is restoring a cancelled item for another future attempt.
- Morning proposal: conditional worker updates tied to the existing claim/status/revision, so a newer cancellation or reschedule wins. Retain retry handling for unchanged failed attempts and recovery for abandoned claims. Tests: cancel while batch pending then failure/success, reschedule while old batch pending, ordinary transient retry and stale-lock recovery. No fix applied.

### SQL interpolation review refinement

- Focused TypeScript AST scan located interpolated query/where/order expressions. In reviewed runtime hits, logs search values are PostgreSQL parameters, query fragments are assembled from fixed clauses/placeholder indexes, reminder lock timeout is a server constant, and inactivity/user-stat aliases are internal. No new client-controlled SQL expression proved. Migration enum strings read existing schema labels and are outside the unauthenticated request path; a database administrator changing those labels is not a remote input exploit. This is scoped review, not a complete SQL-injection guarantee.
