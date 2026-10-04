# Lite / Terra: 18 вересня — зрозумілість пояснень

Read-only audit of the next actual Sep18 seed in frontend/backend context-audit-2026-10-03.jsonl, after07:18Z through07:31:05Z. No runtime or prompt changes, no data mutations, no paid reruns. The wording below is a proposal only.

## Execution, context and cost

Seed8/8 completed: two entries, two check-ins, one main entry analysis, one dialogue; user manually generated the daily summary. Primary gpt-5.6-terra, capsules gpt-5.6-luna, Lite. All three primary provider messages include both accepted mechanism and historical-link instructions. Actual style: friend/warm/normal length/balanced depth/explanations; a selected academic style does not explain the prose.

Entry context6262/6000,11records: fresh Sep16/17 morning+evening and Sep18 morning; relevant Sep17 household conflict, Sep11 fatigue/Marta, Sep15 evening walk, Sep7 evening check-in, Sep9 morning check-in, Sep14 scope clarification. Brief memories17/11/15/7/14. Whole provider input10977. Day context7511/7500 = current3303 plus daily capsules17/16/15/14; whole provider input10048. Both overages follow whole-last-unit policy, no retrieval failure.

One dialogue reused the source snapshot: cache9983/11698=85.3%, write1045. Entry-to-dialog comparison4identical leading messages,6->8messages, only response_format changed. This does not test a second follow-up.

Day capsule1079tokens, one pass26credits, Lite retry threshold1200; brief86tokens. Source334tokens deliberately retained (`short_original`); assistant digest551->427(~22.5%). Capsule records the dialogue's practical suggestions and marks the control/anxiety explanation as Nemory's hypothesis. Plans for household tasks and residual hurt remain distinct from completion/resolution. Capsule prose labels the walk19:00–19:50 using progress-record and entry times; those times should not be treated as verified start/end when the source says30minutes.

Covered operations: entry352credits, dialogue116calculated from actual usage/current rates, day377returned (main351+capsule26), total845. Not complete wallet reconciliation: separate helper memory/action extraction and embeddings not reconciled. Provider fresh input7580, cache read9983, cache write21073, output3115including reasoning. Audit-generated paid usage0.

Traces: entry6870ddd1-f487-4bb5-988a-eaa43b53eb63; dialog-a9af2a7e-47b5-471c-ba3b-1fa00d5e42e4; day355b275b-4511-4dbe-aa19-a0377b13ec50.

## Quality

Historical use improved in this case: both entry and day identify yesterday's cup/conflict, compare unclear household expectations with today's explicit agreement, and preserve that hurt remains. The user explicitly described returning to yesterday's conversation, so this is not proof of independent historical discovery or a controlled effect of the prompt. The broader Sep11 comparison is not developed.

The user's readability concern is supported by actual wording: “чашка стала носієм ширшого побоювання”, “витримування невизначеності після ясної домовленості”, “звичайному контакту існувати без остаточного вердикту”, “Довша ціна — роль наглядача”. Several abstractions and metaphors encode a simple chain without spelling it out. The reader must translate them back into who thinks/feels/does what. A high-level label is often presented where a concrete explanation would be clearer.

Not all the output has this problem. The dialogue about the household list uses concrete tasks, a proposed review time and example wording, making it easier to act on. The entry also explains a useful risk: repeatedly checking another person's chores can briefly reassure the checker while making the other person feel monitored. The problem is delivery and unsupported extension, not that psychological explanation itself should be removed or made empty/brief.

Specific overreach: the claim that calling his mother probably reduced the need for reassurance from Marta is not supplied by the source. A pleasant phone call is known, its effect on reassurance-seeking is not. Even tentative wording does not make this particular causal connection well supported. The model appears to fit peripheral details into the main explanatory theme.

Likely contributing instruction imbalance, not a proved single cause: repeated requirements for full mechanism/function/maintenance explanations are much more specific than existing “Speak naturally” and “connected short paragraphs”. They can produce an analytical register instead of ordinary speech. There is no evidence of intentional defiance. Other influences (model behavior, different source material) were not isolated by same-input testing.

## Proposed localized style replacement — NOT applied

Replace only the closing three sentences of the first STYLE AND LANGUAGE paragraph in journal-response-instructions.ts; no additional block, no changes to psychological depth, response lengths, context or model.

Before (51 o200k):

> Do not automatically praise/agree, retell, moralize, add generic motivation, formulaic introductions or “If you want, I can…”. Explain what worked and why. Use connected short paragraphs and useful lists; do not narrate these instructions.

After (58 o200k; +7):

> Explain thoughts, feelings, actions and causal links in everyday words; explain needed terms. One main idea per sentence, connected paragraphs, useful lists. Avoid abstract labels, stacked metaphors, recap, automatic praise/agreement, moralizing, generic motivation/openings/offers and narrating instructions.

Ukrainian meaning: пояснювати думки, почуття, дії та зв’язки між ними повсякденними словами; потрібні терміни відразу пояснювати. Одна головна думка в реченні, зв’язні абзаци, доречні списки. Уникати абстрактних ярликів, нагромаджених метафор, переказу, автоматичного схвалення/згоди, моралізування, шаблонної мотивації/вступів/пропозицій і переказу інструкцій.

Illustrative rewrite, not a generated rerun: “Хотілося перепитати про прання, щоб переконатися: Марта пам’ятає про свою частину. Це могло б на мить заспокоїти тебе. Але часті перевірки могли б дати їй відчути, що ти їй не довіряєш. Ви вже домовилися, тому можна дати їй виконати справу без повторних нагадувань; якщо план зміниться — обговорити це прямо.”

Next: discuss/approve localized wording, then evaluate natural comprehension and groundedness on a subsequent real reply. Do not promise the prompt change guarantees readability; preserve meaningful psychological explanation rather than shortening it by default.
