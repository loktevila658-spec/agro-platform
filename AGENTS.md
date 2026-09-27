# AGENTS.md — AgroPlatform

This repository is governed by the frozen specification pack in `/spec` and `/codex`.

## Authority
1. DOC50 — final release/execution baseline.
2. DOC48 — frozen scope and RTM.
3. DOC47 — reconciliation/conflict decisions.
4. DOC49 — executable build graph and Work Packages.
5. DOC33 + MASTER_FUNCTIONAL.xlsx — product scope baseline.
6. DOC34–DOC46 — detailed domain/platform contracts in their areas.
7. DOC01–DOC32 — foundation/historical baseline where not superseded by DOC47–DOC50.

Never use “latest document wins” as a conflict rule.

## Execution discipline
- Implement exactly one `WP49-xxx` manifest at a time.
- Do not invent requirements or silently broaden scope.
- Respect `depends_on`, `allowed_paths_raw`, release, and exit criteria.
- If a needed change is outside the active WP, stop that scope change and create an ADR/CR proposal.
- Do not weaken acceptance tests to make an implementation pass.
- Do not move FUTURE/REJECTED items into implementation without approved change control.

## Architecture invariants
- `INV-01` **LOCAL_PRIMARY**: Local Server предприятия является единственным authoritative write-node для operational business facts.
- `INV-02` **No PostgreSQL multi-master**: Local↔cloud PostgreSQL multi-master запрещён; cloud — async replica/analytics.
- `INV-03` **Offline-first**: Критические mobile workflows должны продолжаться без WAN; sync — отдельный stateful contract.
- `INV-04` **Single-entry**: Данные вводятся один раз и переиспользуются; QR/GPS/photo/voice/NFC/RFID минимизируют ручной ввод.
- `INV-05` **Evidence-first**: IoT/GPS/PLC/AI/vision дают evidence; они не пишут business facts напрямую.
- `INV-06` **Domain commands**: Любое authoritative изменение проходит command validation, permissions, state machine, audit и outbox.
- `INV-07` **1C boundary**: Платформа не превращается во вторую бухгалтерию/payroll/treasury.
- `INV-08` **AI advisory**: AI не имеет неконтролируемого write-access к business facts; proposal -> guardrails -> human/domain command.
- `INV-09` **Module ownership**: Нет прямых cross-module writes в чужие таблицы; интеграция через contracts/events/application services.
- `INV-10` **Immutable provenance**: Исторические facts/specifications/results исправляются correction/supersession/amendment, а не silent overwrite.
- `INV-11` **Hardware optional**: Приложение обязано работать manual-only; retrofit повышает автоматизацию, но не является prerequisite.
- `INV-12` **Safety boundary**: PLC/E-stop/interlocks/safety logic не заменяются платформой; V1 OT read-only.

## Mandatory mutation path
Authoritative writes require server-side permission checks, domain validation/state transition, idempotency where applicable, transaction, audit/provenance, and transactional outbox/event handling.

## Boundaries
- No direct writes to another bounded context's authoritative tables.
- Redis is not durable business authority.
- Cloud cannot overwrite Local authoritative business facts.
- IoT/PLC/AI/CV outputs are evidence or proposals, never uncontrolled canonical mutations.
- 1C remains authority for accounting/tax/payroll/regulated accounting domains as specified.
- Core workflows must work without optional hardware and without AI.

## Done means evidence
A WP is DONE only when its applicable G0–G12 gates pass and the Completion Report is produced.
