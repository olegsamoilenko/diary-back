> Оновлення 03.10: користувач погодив заміни й уточнив, що механізми потрібно пояснювати повно, без вимоги «стисло». Застосований текст і відкат: [mechanism-focus](prompt-history/20261003-mechanism-focus/README.md). Нижче збережено початкову пропозицію для історії.

# Lite / Terra: аудит 14 вересня та пропозиція уточнення промпту

Перевірено 3 жовтня 2026. Статус: аудит і конкретна пропозиція; production-промпти не змінено, платних повторних викликів не робили.

## Реальний прогін

- daily-scenario-2026-09-14-v1: 11/11 кроків, 4 джерела (2 записи, 2 чекіни), 1 первинний аналіз, 2 діалоги, ручний денний аналіз. gpt-5.6-terra, lite-m1.
- Trace запису: 050cb392-6503-4ea4-8b70-90a3c42dc5d7. Діалоги: dialog-d70151cd-2895-4702-a75a-535155468be4 і dialog-9059ee9a-27e0-44f2-b781-24f97b954791. День: 8f79aab7-3816-4885-83b8-96ed40abc132.
- Retrieval: 5918/6000 токенів, 10 джерел — 3 звичайні записи (7,9,10 вересня) та 7 чекінів (9,12,13,14). П'ять fresh_checkin, п'ять relevant; до recent-фази місця не залишилось. Короткі пам'яті: 7,10,13. Це блок відбору, не весь provider input.
- День: поточні 4 джерела та збережена пам'ять діалогу, планери/дії; попередні денні капсули 10–13. Контекст 7811/7500, overage311 за погодженим цілим останнім джерелом; повний provider input10346. Тижневої капсули немає.
- Денна капсула1015 o200k, одна Luna-спроба24кредити, поріг повтору1200. Відповідь запису548→415 токенів у капсулі Nemory.
- Діалоговий кеш9402/11111=84,6% і10443/11472=91,0%; обидва reused.
- API повернув342кредити за запис і355 за день з капсулою. Діалоги за provider tokens/current rates95+66. Разом покриті цими5provider-подіями операції858кредитів; не повна звірка гаманця й допоміжних memory/embedding викликів. Свіжий стандартний input7726, cacheWrite21750, cacheRead19845, output2734 включно з reasoning. Нових викликів під час аудиту0.

## Якість і причина запропонованої зміни

Твердження, що механізмів зовсім немає, не підтверджується: перші два абзаци відповіді запису пояснюють нечіткий запит, захисне розширення роботи для зменшення невизначеності та подальший тиск. Далі зростає частка повторення вже сформульованого героєм висновку. Денний підсумок значною мірою переказує події та вже обговорене «тривога лишається, дія змінилася».

Головний недорозібраний зв'язок у денних даних: чому після ясної домовленості й нейтральної реакції іншої людини тривають сумніви та бажання компенсувати уточнення зайвою роботою. Корисний розбір мав би розрізнити ясність самого завдання та побоювання оцінки власної старанності, пояснити можливу коротку функцію компенсації й чому вона підтримує цей спосіб реагування. Це версія для перевірки даними, не встановлений прихований мотив.

Спільна роль психолога, свобода обґрунтованих гіпотез і вимога пояснень уже є у фактично надісланому system. Причину не можна звести до відсутності ролі. Можлива слабкість формулювань: локальне завдання запису дозволяє «mechanism or the situation's meaning»; денне перелічує ситуації/почуття/плани/дії/результати. Пропонується сильніше визначити результат аналізу, не додавати заборон чи окремого Terra-промпту.

Чинні споживачі: AiService.generateComment → buildResponseSystemPromptParts → NEMORY_COMMON_INSTRUCTIONS/buildJournalTask; PeriodicAnalysisService.systemPrompt → buildResponseSystemPrompt + buildPeriodicAnalysisTask. Старі promptsFoDiary/promptsForDialog прочитані, але не використані як live reference. Стиль цього запуску friend/warm/balanced/explanations; його не змінюємо. Стислі підтвердження й фактичні питання не повинні перетворитися на примусовий психологічний розбір.

## Точні англомовні заміни (пропозиція, НЕ застосовано)

Підрахунок tiktoken o200k_base: common118→116; entry/checkin46→47; day25→26. Сума замін189→189. Роль, правила точності, службові дані, ліміти, структура JSON і Luna незмінні. Це перевірка довжини, не доказ майбутньої якості Terra; після застосування потрібен наступний реальний прогін.

### common_reasoning

Було:

```text
Connect observations → possible mechanism → useful change, without mandatory headings. Naming a concept alone is not an explanation. Explore grounded hypotheses freely, with no quota on hypotheses: explain supporting details and distinguish established psychological knowledge from its possible application to this person. Qualify the causal claim naturally, not every sentence. Adding “maybe” cannot justify an evidence-free story. Do not withhold useful explanations or practical guidance behind a clarification. Ask only when an answer could materially support, refine or disconfirm the explanation or change advice; otherwise finish without a question. Acknowledgments may need only brief closure.
```

Пропонується:

```text
Make explanation the main content, not recap. Cite facts briefly, then explain what triggers the reaction, how it is interpreted, what the response helps obtain or avoid, and how its immediate effect maintains or changes the pattern. Connect feasible steps to that mechanism and observable results. Develop what the user has not already explained. Explore grounded hypotheses freely, separating evidence from interpretation; qualify causes naturally, not every sentence. “Maybe” cannot justify invented causes. Explain now; ask only if an answer could refine the explanation or advice. No mandatory headings; acknowledgments may need only brief closure.
```

### entry_checkin_task

Було:

```text
- understand the experience from the user's perspective;
- notice grounded connections, contradictions, needs or changes;
- explain an important mechanism or the situation's meaning when supported;
- suggest practical actions matching the need and scale of the situation.
```

Пропонується:

```text
- briefly anchor the issue in the user's experience;
- explain why the reaction may arise and what sustains or changes it;
- develop understanding beyond what the user already concluded;
- show how a feasible next step acts on that mechanism.
```

### daily_task

Було:

```text
Analyze the lived day: significant situations, feelings, plans, actions and outcomes; compare supplied history and identify practical next steps.
```

Пропонується:

```text
Explain the day's psychological mechanisms using events as evidence, not a recap. Integrate history to deepen prior analysis and guide practical changes.
```
