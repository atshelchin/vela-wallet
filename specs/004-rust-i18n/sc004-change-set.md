# SC-004 / SC-003: the user-visible change set

**Generated, not hand-written** — regenerate with the script in this feature's
quickstart. This is the complete set of strings that render differently on a
native build after adopting the Rust engine, and it exists so the change is
**reviewed rather than discovered**.

Native builds today have no `Intl.PluralRules` (Hermes 0.14.1 compiles `Intl`
with Collator, DateTimeFormat and NumberFormat only), so i18next silently falls
back to `count === 1 ? one : other`. Web and Jest run full ICU and already
produce the right-hand column — which is why no existing test catches this.

```
SC-004 change set: 26 of 675 resolutions change on native

## pt-BR  (4)
  send.recipientCount @ 0
    before (native today): "0 destinatários"
    after  (Rust engine): "0 destinatário"
  send.batchApply @ 0
    before (native today): "Importar 0 destinatários"
    after  (Rust engine): "Importar 0 destinatário"
  send.batchRejected @ 0
    before (native today): "0 linhas ignoradas (inválidas ou duplicadas)."
    after  (Rust engine): "0 linha ignorada (inválida ou duplicada)."
  contacts.sends @ 0
    before (native today): "0 envios"
    after  (Rust engine): "0 envio"

## fr  (4)
  send.recipientCount @ 0
    before (native today): "0 destinataires"
    after  (Rust engine): "0 destinataire"
  send.batchApply @ 0
    before (native today): "Importer 0 destinataires"
    after  (Rust engine): "Importer 0 destinataire"
  send.batchRejected @ 0
    before (native today): "0 lignes ignorées (invalides ou en double)."
    after  (Rust engine): "0 ligne ignorée (invalide ou en double)."
  contacts.sends @ 0
    before (native today): "0 envois"
    after  (Rust engine): "0 envoi"

## ru  (18)
  send.recipientCount @ 2
    before (native today): "2 получателей"
    after  (Rust engine): "2 получателя"
  send.recipientCount @ 3
    before (native today): "3 получателей"
    after  (Rust engine): "3 получателя"
  send.recipientCount @ 21
    before (native today): "21 получателей"
    after  (Rust engine): "21 получатель"
  send.recipientCount @ 101
    before (native today): "101 получателей"
    after  (Rust engine): "101 получатель"
  send.batchApply @ 21
    before (native today): "Импортировать 21 получателей"
    after  (Rust engine): "Импортировать 21 получателя"
  send.batchApply @ 101
    before (native today): "Импортировать 101 получателей"
    after  (Rust engine): "Импортировать 101 получателя"
  send.batchRejected @ 2
    before (native today): "Пропущено 2 строк (неверные или дубликаты)."
    after  (Rust engine): "Пропущено 2 строки (неверные или дубликаты)."
  send.batchRejected @ 3
    before (native today): "Пропущено 3 строк (неверные или дубликаты)."
    after  (Rust engine): "Пропущено 3 строки (неверные или дубликаты)."
  send.batchRejected @ 21
    before (native today): "Пропущено 21 строк (неверные или дубликаты)."
    after  (Rust engine): "Пропущена 21 строка (неверная или дубликат)."
  send.batchRejected @ 101
    before (native today): "Пропущено 101 строк (неверные или дубликаты)."
    after  (Rust engine): "Пропущена 101 строка (неверная или дубликат)."
  contacts.sends @ 2
    before (native today): "2 отправок"
    after  (Rust engine): "2 отправки"
  contacts.sends @ 3
    before (native today): "3 отправок"
    after  (Rust engine): "3 отправки"
  contacts.sends @ 21
    before (native today): "21 отправок"
    after  (Rust engine): "21 отправка"
  contacts.sends @ 101
    before (native today): "101 отправок"
    after  (Rust engine): "101 отправка"
  contacts.groupMembers @ 2
    before (native today): "2 участников"
    after  (Rust engine): "2 участника"
  contacts.groupMembers @ 3
    before (native today): "3 участников"
    after  (Rust engine): "3 участника"
  contacts.groupMembers @ 21
    before (native today): "21 участников"
    after  (Rust engine): "21 участник"
  contacts.groupMembers @ 101
    before (native today): "101 участников"
    after  (Rust engine): "101 участник"

Regressions (localised -> English): 0
```

## Reading this

- **Every change is wrong → right.** There are no regressions: no string moves
  from correct localised text to English, and none becomes less grammatical.
- **Before FR-017 there were 42 changes, 16 of them regressions.** fr, it, es-MX
  and pt-BR lacked the CLDR `many` form, so at large counts MODE A selected
  `many`, missed, and fell through to English — `1000000 sends` mid-sentence.
  Adding those 16 entries is what turned a mixed change set into a clean one.
- **ru dominates (18 of 26)** because it is the only shipped locale with a
  four-category rule. Its `_few` and `_many` translations already existed in the
  corpus and were simply unreachable on device.
- **fr and pt-BR change only at count = 0**, where CLDR puts zero in `one`
  (`i = 0,1`) and the legacy stub puts it in `other`.
