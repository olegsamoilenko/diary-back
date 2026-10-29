# NA-10 / NA-28 — безпечні відповіді спільноти й модерації

Дата: 2026-10-29. Локальна реалізація; бекенд деплоїть користувач.

## Контракт і сумісність

- Спільний HTTP response interceptor відбирає дозволені поля пов'язаних User/Admin, включно з вкладеними відповідями, попередніми коментарями, закладками та результатами змін. Паролі, хеші, коди, токени й ключі користувачів не віддаються.
- Звичайний клієнт отримує `id`, `role` та публічний профіль автора (нік, ім'я профілю, аватар тощо), без приватного email, UUID та справжнього імені з User.
- Адмінська відповідь використовує чинну `toAdminUser`: збережено `id`, `uuid`, `name`, `email`, `role`, `settings.lang`. Для модератора/адміністратора, який наклав обмеження: `id`, `name`, `role`.
- `authorId`, `targetUserId`, `userId`, `createdByAdminId`, причина, строк та статус обмеження залишаються. Адмінка банить і розбанює через `authorId`; очищення відповіді не змінює ідентифікатор.
- Внутрішні ORM-об'єкти не мутуються. Перевірки власника, учасника розмови, логіка запису в БД та push не змінені.
- `/admin/forum/moderation-logs` і пов'язаний `/admin/forum/ai-moderation-results` тепер вимагають `admin-jwt`, як решта адмінки. Звичайний JWT застосунку не підходить. Для другого контролера поточний writer не підтверджений — це виправлення доступу, а не твердження про наявність реальних даних.

Охоплено: topics, comments/replies/context, bookmarks, conversations/messages, notifications/actor, mentions, user-blocks, admin topics/comments/moderation target/user lookup, moderation logs, reports, moderation mutations, active restriction details. Для mixed public/admin controllers interceptor встановлений на відповідні методи.

## Реальні споживачі, перевірені в коді

- `diary-landing/components/admin/community/CommunityTable.tsx`, `ModerationTopicCard.tsx`, `ModerationCommentCard.tsx`: ім'я автора, мова, `authorId`; активне обмеження також показує `createdByAdmin.name`.
- `ModerationRestrictUserDialog.tsx`, `ModerationUnrestrictUser.tsx`, `lib/api/moderation.ts`: ID цілі передається в `/forum/user-restrictions/:id/restrict|unrestrict`.
- Мобільні картки тем/коментарів читають публічний `authorProfile`; `authorId` лишається для дій власника. Зміст, пагінація, лічильники, ознаки вподобання та видалені (`null`) автори збережені.

## Автоматичні перевірки

Результат: **142/142 backend PASS**, **4/4 landing compatibility PASS** (один новий сценарій бану/розбану та три попередні). `tsc --noEmit`, ESLint зміненого форумного коду й `git diff --check` в обох репозиторіях — PASS.

- `src/forum/forum-response-security.spec.ts`: реальні контролери, interceptors та JWT strategies, синтетичні сервіси/репозиторії. HTTP reads/mutations без секретів; anonymous та звичайний JWT на admin routes відхиляються. Реальні ownership checks conversation/message service залишають nonmember з 403. Окремо — отримання цілі, бан/розбан за тим самим ID та безпечна відповідь активного обмеження.
- `diary-landing/tests/admin-report-compatibility.test.mjs`: чинні API wrappers отримують ID із проєктованого автора й надсилають правильні ban/unban запити зі збереженим cookie transport. Мережа підмінена.
- Це ізольовані перевірки контракту, не перевірка реального блокування користувача в БД чи надсилання push. Реальних користувачів не банили.

Команди:

```text
node node_modules/jest/bin/jest.js --cacheDirectory=.tmp/jest-admin-report --runInBand --runTestsByPath src/forum/forum-response-security.spec.ts
node node_modules/typescript/bin/tsc --noEmit --pretty false
node --test tests/admin-report-compatibility.test.mjs  # у diary-landing
```

Після деплою достатньо під час наступної звичайної перевірки спільноти відкрити тему з відповідями та закладки: нік/аватар/текст і дії власника мають лишитися. Окрему велику ручну матрицю адмінки не додаємо, за рішенням користувача.

NA-29 (довіра до переданого actor/admin ID у mutation body та атомарність) — окремий пункт аудиту; цей патч його не оголошує виправленим.
