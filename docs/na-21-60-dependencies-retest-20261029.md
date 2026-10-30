# NA-21/60 — завантаження файлів та сокети

Статус: залежності виправлені локально, цільові автоматичні тести PASS. Ручні тести **DEFERRED UNTIL ALL CORRECTIONS**, жоден не позначений PASS. Деплой виконує користувач. Memora2878.

## Ручна черга — лише необхідне

Ці сценарії об’єднати з уже запланованими перевірками медіа, AI та авторизації, а не проходити вдруге окремим набором.

- **NA21.1 / DEV — аватар:** у тестовому профілі спільноти встановити фото; після закриття й повторного відкриття профілю воно зберігається. Після всіх корекцій на оновленому DEV-беку.
- **NA21.2 / DEV, включити в основний PROD-сценарій медіа — медіа → AI:** у запис додати фото, коротке аудіо й відео; запустити відповідний аналіз і запитати про вкладення. Очікуємо успішне завантаження та завершену відповідь без завислого лоадера. Саме локальне вставлення медіа без AI не перевіряє серверний upload. Використати чинний розгорнутий сценарій запису/медіа.
- **NA60.1 / DEV — переривання й повернення зв’язку:** під час звичайної AI-розмови перервати з’єднання (вимкнути інтернет), повернути його й надіслати наступне повідомлення. Застосунок відновлює роботу, нова відповідь приходить один раз, немає вічного очікування. Поєднати з чинним тестом мережі/AI.
- **NA60.2 / PROD після деплою — встановлений клієнт:** без перевстановлення відкрити спільноту й отримати одну звичайну AI-відповідь. Поєднати з NA05.1; перевірити роботу через production proxy. Подію оновлення тарифу перевірити в уже запланованому NA12.2/тесті покупки, додаткову покупку для NA60 не робити.

Попередні підтверджені PASS не скидаються. Ручних навантажувальних атак та спеціально пошкоджених файлів на PROD не потрібно.

## Обсяг

Оновлюються лише серверні залежності та lockfile через точкові npm overrides, оскільки встановлені Nest adapters фіксують старі версії. Multer 2.5.0, Socket.IO 4.8.4, socket.io-parser 4.2.7, Engine.IO 6.6.11, ws 8.22.0. Dev dependency socket.io-client 4.8.1 потрібна для відтворюваної перевірки сумісності протоколу 4.x. Фронт, API payload, storage, тарифи та транспортні налаштування не змінюються.

Джерела: [Multer releases](https://github.com/expressjs/multer/releases/tag/v2.5.0), [Socket.IO parser](https://github.com/socketio/socket.io/security/advisories/GHSA-2m8v-j782-fhvr), [Engine.IO](https://github.com/socketio/socket.io/security/advisories/GHSA-2gc4-cqfq-p2gv), [ws](https://github.com/websockets/ws/security/advisories/GHSA-96hv-2xvq-fx4p).

## Автоматичні результати 29.10

- `test/dependency-transport-security.test.cjs`: **10 PASS**. Перевірка всіх вкладених версій у lockfile та реального ws із Nest → Socket.IO → Engine.IO; обмежені probes parser zero/excess attachments, звичайний binary packet, завершення некоректного polling HTTP response, відмова protocol mismatch, три tiny frames для ws fixture. Три реальні loopback-сценарії зі старим client4.8.1: polling, WebSocket та upgrade, binary acknowledgment, room events і автоматичний reconnect.
- `media-upload-http.spec.ts` + `system-profile-avatar.spec.ts`: **14 PASS**. Реальний Nest FileInterceptor/Multer, поточні media/avatar controllers, bytes/form fields фото/аудіо/відео, replay, malformed boundary/truncated body, чинне обмеження одного файла; avatar MIME/magic-number validation, права адміна, локальний файловий cleanup і збій persistence. Сервіси медіа/БД замінені синтетичними, аватари в ізольованій тимчасовій папці.
- `session-security.spec.ts`, `ai.gateway.spec.ts`, `conversation.gateway.spec.ts`: **25 PASS**, наявні JWT/recovery/socket-auth та AI event contracts.
- `dependency-stream-regression.spec.ts`: **1 PASS**, справжній AiGateway скасовує сигнал старої розмови після disconnect, не відсилає запізнілий chunk/done, прибирає listener і завершує наступний запит. AI provider синтетичний.
- Разом **50 цільових тестів PASS**. TypeScript noEmit, scoped ESLint, Node syntax check і `git diff --check` PASS. Жодного AppModule/bootstrap, реальної БД, Google/provider-запиту чи навантажувальної атаки.
- Початковий socket запуск у sandbox мав timeout на loopback; поза sandbox усі10 пройшли. Початковий avatar Jest запуск без VM modules повертав400 через неможливість завантажити ESM `file-type`; з `--experimental-vm-modules` усі14 HTTP-тестів пройшли без підміни file validation. У новому тесті виправлено повернення beforeEach (void). Ці початкові невдалі запуски не приховані й не оголошені PASS.

Повторювані команди з diary-back:

```powershell
npm run test:dependency-security
node --experimental-vm-modules node_modules/jest/bin/jest.js src/ai/media/media-upload-http.spec.ts src/forum/system-profile-avatar.spec.ts --runInBand
node node_modules/jest/bin/jest.js src/auth/session-security.spec.ts src/ai/gateway/ai.gateway.spec.ts src/ai/gateway/conversation.gateway.spec.ts src/ai/gateway/dependency-stream-regression.spec.ts --runInBand
```

Ліміти часу/низький fragment threshold у test harness є лише запобіжниками самого тесту; виробничі ліміти Nemory не змінені. Upstream ws/parser тепер мають виправлену обробку некоректних пакетів. Перевірки не підтверджують production deployment/проксі чи ручне приймання. Фронтовий parser із попереднього аудиту не змінювався: тут закрито саме серверну залежність; це не твердження, що весь dependency audit усіх репозиторіїв чистий.

Точні fresh/cached input/output tokens у цій сесії недоступні; грошових оцінок не вигадували.

## Деплой

Включити обидва файли package.json і package-lock.json; на сервері встановити залежності через `npm ci` у звичайному процесі збірки, зібрати й перезапустити backend. Самого копіювання dist недостатньо. Нових env, міграції БД і перебілду телефона для серверного виправлення немає. Тут деплой/перезапуск не виконуються.
