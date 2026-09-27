# CODEX INSTRUCTIONS

## Canonical task preamble (DOC50)

You are implementing exactly one WP49 manifest.
Use Document 50 as release/execution baseline and Documents 48/47 as scope/authority sources.
Do not invent requirements.
Do not edit deniedPaths.
Do not directly write foreign bounded-context tables.
Preserve LOCAL_PRIMARY, offline/idempotency, permissions, audit and outbox contracts.
If a required change is outside the WP or conflicts with frozen scope: STOP the scope change, create an explicit issue/ADR/CR proposal, and continue only with work that remains inside the manifest.
Completion is accepted only with required tests, deterministic demo and Completion Report evidence.

## Execution sequence

1. **Load WP manifest** — Получить ровно один WP49-xxx и frozen specRefs.
2. **Prerequisite gate** — Все dependsOn merged; schema/API/event versions совместимы.
3. **Red tests/contracts** — Сначала acceptance/contract fixtures для observable behavior.
4. **Migration/contracts** — DB/OpenAPI/events/permissions/workflows изменяются вместе.
5. **Minimal vertical implementation** — Только allowedPaths; deniedPaths не трогать.
6. **Local test suite** — Unit/integration/contract/offline/permissions/audit.
7. **Cross-module validation** — Архитектурные boundary rules + no direct foreign-table writes.
8. **Deterministic demo** — Запустить нужный DEMO27 scenario с фиксированными seed/clock.
9. **Evidence report** — Changed files, migrations, diffs, tests, demo, limitations.
10. **Merge/unlock** — Следующий WP разблокируется только после PASS.

## Global rules

- **INV-01 LOCAL_PRIMARY** — Local Server предприятия является единственным authoritative write-node для operational business facts.
- **INV-02 No PostgreSQL multi-master** — Local↔cloud PostgreSQL multi-master запрещён; cloud — async replica/analytics.
- **INV-03 Offline-first** — Критические mobile workflows должны продолжаться без WAN; sync — отдельный stateful contract.
- **INV-04 Single-entry** — Данные вводятся один раз и переиспользуются; QR/GPS/photo/voice/NFC/RFID минимизируют ручной ввод.
- **INV-05 Evidence-first** — IoT/GPS/PLC/AI/vision дают evidence; они не пишут business facts напрямую.
- **INV-06 Domain commands** — Любое authoritative изменение проходит command validation, permissions, state machine, audit и outbox.
- **INV-07 1C boundary** — Платформа не превращается во вторую бухгалтерию/payroll/treasury.
- **INV-08 AI advisory** — AI не имеет неконтролируемого write-access к business facts; proposal -> guardrails -> human/domain command.
- **INV-09 Module ownership** — Нет прямых cross-module writes в чужие таблицы; интеграция через contracts/events/application services.
- **INV-10 Immutable provenance** — Исторические facts/specifications/results исправляются correction/supersession/amendment, а не silent overwrite.
- **INV-11 Hardware optional** — Приложение обязано работать manual-only; retrofit повышает автоматизацию, но не является prerequisite.
- **INV-12 Safety boundary** — PLC/E-stop/interlocks/safety logic не заменяются платформой; V1 OT read-only.
