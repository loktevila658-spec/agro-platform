import assert from "node:assert/strict";
import { chmod, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { NestFactory } from "@nestjs/core";
import { Module } from "@nestjs/common";
import { ActualOperationService } from "../dist/modules/agronomy/actual-operation.service.js";
import { ActualOperationRegistry } from "../dist/modules/agronomy/actual-operation.registry.js";
import { ActualOperationSync } from "../dist/modules/agronomy/actual-operation.sync.js";
import { ActualOperationController } from "../dist/modules/agronomy/actual-operation.controller.js";
import { TasksService } from "../dist/modules/tasks/tasks.service.js";
import { TasksRegistry } from "../dist/modules/tasks/tasks.registry.js";
import { TasksSync } from "../dist/modules/tasks/tasks.sync.js";
import { SyncService } from "../dist/modules/sync/sync.service.js";
import { SyncRegistry } from "../dist/modules/sync/sync.registry.js";
import { UnauthorizedException } from "@nestjs/common";
import { uuidv7 } from "../dist/modules/master-data/master-data.validation.js";
import { AgronomyService } from "../dist/modules/agronomy/agronomy.service.js";
import { AgronomyController } from "../dist/modules/agronomy/agronomy.controller.js";
import { AgronomyRegistry } from "../dist/modules/agronomy/agronomy.registry.js";
import { IdentityService } from "../dist/modules/identity/identity.service.js";
import { FarmService } from "../dist/modules/farm/farm.service.js";
import { FarmRegistry } from "../dist/modules/farm/farm.registry.js";
import { MasterDataService } from "../dist/modules/master-data/master-data.service.js";
import { MasterDataRegistry } from "../dist/modules/master-data/master-data.registry.js";
import { InboxService } from "../dist/modules/events/inbox.service.js";
import { OutboxDispatcherService } from "../dist/modules/events/outbox-dispatcher.service.js";
import {
  loadAndValidateContracts,
  validateJsonSchema,
} from "../../../packages/contracts/scripts/lib/contracts.mjs";
import { validateAction } from "../dist/modules/tasks/tasks.validation.js";
const { Pool } = pg;
const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const image =
  process.env.POSTGIS_TEST_IMAGE ?? "agroplatform/wp49-003-postgis:test";
function docker(args) {
  return spawnSync("docker", args, { cwd: repositoryRoot, encoding: "utf8" });
}
function assertCommand(result, action) {
  assert.equal(
    result.status,
    0,
    `${action} failed\n${result.stdout}\n${result.stderr}`,
  );
}
test(
  "Actual operation real PostGIS deterministic capture, review, correction and sync",
  { timeout: 900000 },
  async (t) => {
    const container = `agro-wp49-033-actual-${process.pid}`;
    const password = "wp49_027_ephemeral_test_only";
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "agro-agronomy-integration-"),
    );
    const psqlWrapper = join(temporaryDirectory, "psql");
    let pool;
    const previousMode = process.env.AGRO_DEPLOYMENT_MODE;
    process.env.AGRO_DEPLOYMENT_MODE = "LOCAL_PRIMARY";
    let started = false;

    try {
      await writeFile(
        psqlWrapper,
        `#!/bin/sh\nexec docker exec -i ${container} psql "$@"\n`,
        "utf8",
      );
      await chmod(psqlWrapper, 0o700);
      const imageCheck = docker(["image", "inspect", image]);
      if (imageCheck.status !== 0 && !process.env.POSTGIS_TEST_IMAGE) {
        assertCommand(
          docker([
            "build",
            "--tag",
            image,
            "--file",
            "database/test/Dockerfile.postgis",
            ".",
          ]),
          "PostGIS image build",
        );
      } else {
        assertCommand(imageCheck, "PostGIS image lookup");
      }
      assertCommand(
        docker([
          "run",
          "--detach",
          "--rm",
          "--publish",
          "127.0.0.1::5432",
          "--volume",
          `${repositoryRoot}:${repositoryRoot}:ro`,
          "--name",
          container,
          "--env",
          `POSTGRES_PASSWORD=${password}`,
          "--env",
          "POSTGRES_DB=agro_test",
          image,
        ]),
        "PostgreSQL test container start",
      );
      started = true;
      const portResult = docker([
        "inspect",
        "--format",
        '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
        container,
      ]);
      assertCommand(portResult, "PostgreSQL port lookup");
      const port = portResult.stdout.trim();
      const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/agro_test`;
      const socketUrl =
        "postgresql:///agro_test?host=%2Fvar%2Frun%2Fpostgresql&user=postgres";
      pool = new Pool({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 1000,
      });

      let ready = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          const probe = await pool.query(
            "SELECT current_database() AS name, pg_is_in_recovery() AS replica",
          );
          if (probe.rows[0].name === "agro_test" && !probe.rows[0].replica) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      }
      assert.equal(ready, true, "PostgreSQL did not become ready");

      const migration = spawnSync(process.execPath, ["database/migrate.mjs"], {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, DATABASE_URL: socketUrl, PSQL_BIN: psqlWrapper },
      });
      assertCommand(migration, "Database migrations");
      assert.match(migration.stdout, /migration 19 applied/);

      const tenantId = randomUUID(),
        subjectId = randomUUID(),
        reviewerId = randomUUID(),
        organizationId = randomUUID(),
        deviceId = randomUUID(),
        employeeId = randomUUID(),
        otherTenant = randomUUID(),
        operationTypeId = uuidv7(),
        referenceRevision = randomUUID();
      const actor = {
          tenantId,
          userId: subjectId,
          deviceId,
          sessionId: randomUUID(),
        },
        reviewer = { ...actor, userId: reviewerId, deviceId: randomUUID() },
        owner = { tenantId, subjectId },
        at = "2026-11-18T00:00:00Z",
        ctx = () => ({
          idempotencyKey: randomUUID(),
          correlationId: "wp033-fixed-demo",
          causationId: "fixture",
        });
      await pool.query(
        "INSERT INTO org.tenant(id,code,name,timezone,created_by) VALUES($1,'ACTUAL-A','Fixture','UTC',$2)",
        [tenantId, subjectId],
      );
      await pool.query(
        "INSERT INTO org.organization(id,tenant_id,code,name,organization_type,created_by) VALUES($1,$2,'ACTUAL-ORG','Fixture org','FARM',$3)",
        [organizationId, tenantId, subjectId],
      );
      let ownerAllowed = true,
        allowed = true,
        referenceAllowed = true;
      const fr = new FarmRegistry(),
        mr = new MasterDataRegistry();
      fr.installPolicy(async () => ownerAllowed);
      mr.installPolicy(async () => ownerAllowed);
      mr.registerSourcePolicy({
        tenantId,
        version: 1,
        dataOwnerId: subjectId,
        stewardId: subjectId,
        fields: {},
      });
      const farm = new FarmService(pool, fr, undefined, undefined),
        master = new MasterDataService(pool, mr, undefined);
      const unit = await master.createUnit(
          owner,
          {
            code: "fixture",
            name: "Explicit fixture unit",
            dimension: "COUNT",
            precision: 2,
          },
          ctx(),
        ),
        material = await master.createMaterial(
          owner,
          {
            code: "fixture-resource",
            name: "Fixture resource",
            itemType: "RAW",
            baseUom: unit.code,
            organizationId,
          },
          ctx(),
        );
      const field = await farm.createField(
          owner,
          {
            organizationId,
            code: "F-033",
            data: {
              name: "Fixture field",
              nominalAreaHa: "3",
              status: "ACTIVE",
              allocations: [],
            },
            effectiveAt: at,
            reason: "Fixture",
          },
          ctx(),
        ),
        season = await farm.createSeason(
          owner,
          {
            organizationId,
            data: {
              name: "Fixture season",
              year: 2027,
              startDate: "2026-09-01",
              endDate: "2027-08-31",
              status: "PLANNED",
            },
            effectiveAt: at,
            reason: "Fixture",
          },
          ctx(),
        ),
        fs = await farm.createFieldSeason(
          owner,
          {
            fieldId: field.entityId,
            seasonId: season.entityId,
            data: { plannedAreaHa: "3", status: "PLANNED" },
            effectiveAt: at,
            reason: "Fixture",
          },
          ctx(),
        );
      const pr = new AgronomyRegistry();
      pr.install({
        authorize: async () => ownerAllowed,
        reference: async (_t, _a, k, id) =>
          k === "OPERATION" && id === operationTypeId
            ? { id, revisionId: referenceRevision }
            : undefined,
        formula: async () => false,
      });
      const planning = new AgronomyService(pool, pr, farm, master),
        opId = uuidv7();
      const create = (kind, data) => ({
          kind,
          organizationId,
          data,
          effectiveAt: at,
          reason: "Fixture plan",
        }),
        change = (r) => ({
          expectedVersion: r.version,
          effectiveAt: at,
          reason: "Fixture publish",
        });
      let template = await planning.create(
        owner,
        create("TEMPLATE", {
          name: "Fixture template",
          operations: [
            {
              id: opId,
              operationTypeId,
              sequence: 1,
              quantity: "3",
              unit: unit.code,
              unscheduled: true,
              resources: [],
            },
          ],
        }),
        ctx(),
      );
      template = await planning.command(
        owner,
        template.id,
        "Approve",
        change(template),
        ctx(),
      );
      template = await planning.command(
        owner,
        template.id,
        "Publish",
        change(template),
        ctx(),
      );
      let map = await planning.create(
        owner,
        create("TECH_MAP", {
          name: "Fixture map",
          fieldSeasonId: fs.entityId,
          template: { entityId: template.id, revisionId: template.revisionId },
          operations: [],
        }),
        ctx(),
      );
      map = await planning.command(
        owner,
        map.id,
        "Approve",
        change(map),
        ctx(),
      );
      map = await planning.command(
        owner,
        map.id,
        "Publish",
        change(map),
        ctx(),
      );
      const tr = new TasksRegistry();
      tr.install({
        authorize: async (a, _k, r) =>
          a.tenantId === tenantId &&
          (!r || r.organization_id === organizationId),
        resolveEmployee: async (_a, id) =>
          id === employeeId ? [subjectId] : [],
        operationType: async (_a, id) => id === operationTypeId,
        quantityRequired: async () => true,
        offlineTtlSeconds: 3600,
      });
      const tasks = new TasksService(pool, tr, farm),
        sr = new SyncRegistry();
      new TasksSync(sr, tasks).onModuleInit();
      const registry = new ActualOperationRegistry();
      registry.install({
        authorize: async (a, _k, org) =>
          allowed &&
          a.tenantId === tenantId &&
          [subjectId, reviewerId].includes(a.userId) &&
          org === organizationId,
        reference: async (_t, _a, k, id) =>
          referenceAllowed &&
          ((k === "OPERATION" && id === operationTypeId) ||
            (k === "EMPLOYEE" && [subjectId, employeeId].includes(id)))
            ? { id, revisionId: referenceRevision, organizationId }
            : undefined,
        validateOperation: async () => referenceAllowed,
        captureScopes: async () => [
          { fieldSeasonId: fs.entityId, organizationId },
        ],
        rules: {
          maxFutureSkewMs: 0,
          requireIndependentConfirmation: true,
          offlineTtlSeconds: 3600,
        },
      });
      const service = new ActualOperationService(
        pool,
        registry,
        farm,
        master,
        tasks,
        planning,
      );
      new ActualOperationSync(sr, service).onModuleInit();
      const oldCursor = process.env.SYNC_CURSOR_KEY;
      process.env.SYNC_CURSOR_KEY = "wp033-fixture-cursor-key-32-bytes-minimum";
      const auth = "Bearer fixture",
        reviewAuth = "Bearer review";
      const sync = new SyncService(pool, sr, {
        async authenticate(a) {
          if (a === auth) return { ...actor };
          if (a === reviewAuth) return { ...reviewer };
          throw new UnauthorizedException();
        },
      });
      await sync.register(auth, {
        deviceId,
        installationId: randomUUID(),
        schemaVersion: 1,
      });
      await sync.register(reviewAuth, {
        deviceId: reviewer.deviceId,
        installationId: randomUUID(),
        schemaVersion: 1,
      });
      let seq = 0,
        rseq = 0;
      const data = () => ({
        organizationId,
        fieldSeasonId: fs.entityId,
        operationTypeId,
        startedAt: at,
        completedAt: "2026-11-18T01:00:00Z",
        actualQuantity: "2.25",
        unit: unit.code,
        executors: [subjectId],
        materials: [
          { materialId: material.id, quantity: "1.25", unit: unit.code },
        ],
        labor: [{ employeeId, quantity: "2.5", unit: unit.code }],
        sourceType: "USER_MOBILE",
        plannedOperation: {
          mapId: map.id,
          revisionId: map.revisionId,
          operationId: opId,
        },
      });
      function intent(
        action,
        payload,
        key = fs.entityId,
        version = 0,
        review = false,
      ) {
        const cid = uuidv7();
        return {
          localCommandId: cid,
          idempotencyKey: cid,
          deviceSeq: review ? ++rseq : ++seq,
          aggregate: {
            type: action === "Capture" ? "AgronomyCapture" : "ActualOperation",
            id: key,
          },
          baseVersion: version,
          type: `ActualOperation.${action}`,
          commandVersion: 1,
          observedAt: at,
          offlineAuthId: action === "Capture" ? "fixture-offline" : "online",
          payload,
          provenance: { source: "manual", correlationId: "wp033-fixed-demo" },
          attachments: [],
        };
      }
      const send = async (c, review = false) =>
        (
          await sync.push(review ? reviewAuth : auth, {
            deviceId: review ? reviewer.deviceId : deviceId,
            scopeVersion: 1,
            schemaVersion: 1,
            commands: [c],
          })
        ).results[0];
      const accept = async (c, review = false) => {
        const r = await send(c, review);
        assert.equal(r.status, "ACCEPTED", JSON.stringify(r));
        return r.canonical;
      };
      let fact, capture;
      try {
        await t.test(
          "capture pins plan/material/labor, one fact on replay and no Task or planning mutation",
          async () => {
            capture = intent("Capture", {
              data: data(),
              reason: "Fixture capture",
            });
            fact = await accept(capture);
            assert.deepEqual((await send(capture)).canonical, fact);
            assert.equal(fact.id, capture.localCommandId);
            assert.equal(
              fact.sourceReferences.materials[0].material.revisionId,
              material.revisionId,
            );
            assert.deepEqual(
              (await planning.read(owner, map.id)).data,
              map.data,
            );
            assert.equal(
              (await pool.query("SELECT count(*)::int n FROM tasks.work_order"))
                .rows[0].n,
              0,
            );
            await assert.rejects(
              send({
                ...capture,
                payload: { ...capture.payload, reason: "different" },
              }),
              /IDEMPOTENCY_PAYLOAD_MISMATCH/,
            );
          },
        );
        await t.test(
          "maker-checker, review, rejection, stale conflict and correction preserve confirmed history",
          async () => {
            fact = await accept(
              intent("Submit", { reason: "Submit" }, fact.id, fact.version),
            );
            assert.equal(
              (
                await send(
                  intent("Confirm", { reason: "Self" }, fact.id, fact.version),
                )
              ).status,
              "REJECTED",
            );
            fact = await accept(
              intent(
                "Confirm",
                { reason: "Independent" },
                fact.id,
                fact.version,
                true,
              ),
              true,
            );
            const original = fact.confirmedRevisionId,
              v = fact.version;
            fact = await accept(
              intent(
                "Correct",
                {
                  data: { ...data(), actualQuantity: "2.5" },
                  reason: "Correction",
                },
                fact.id,
                v,
              ),
            );
            assert.equal(fact.confirmedRevisionId, original);
            assert.equal(
              (
                await send(
                  intent(
                    "Correct",
                    { data: data(), reason: "Stale" },
                    fact.id,
                    v,
                  ),
                )
              ).status,
              "CONFLICT",
            );
            fact = await accept(
              intent("Submit", { reason: "Submit" }, fact.id, fact.version),
            );
            fact = await accept(
              intent(
                "Reject",
                { reason: "Reasoned rejection" },
                fact.id,
                fact.version,
                true,
              ),
              true,
            );
            fact = await accept(
              intent(
                "Correct",
                {
                  data: { ...data(), actualQuantity: "2.75" },
                  reason: "Resolve",
                },
                fact.id,
                fact.version,
              ),
            );
            fact = await accept(
              intent("Submit", { reason: "Submit" }, fact.id, fact.version),
            );
            fact = await accept(
              intent(
                "Confirm",
                { reason: "Independent corrected" },
                fact.id,
                fact.version,
                true,
              ),
              true,
            );
            const h = await service.history(actor, fact.id);
            assert.equal(h[0].data.actualQuantity, "2.25");
            assert.equal(h.at(-1).data.actualQuantity, "2.75");
            assert.notEqual(fact.confirmedRevisionId, original);
          },
        );
        await t.test(
          "permission/replay, tenant, precision, future time, unresolved owners and Local-only negatives",
          async () => {
            allowed = false;
            await assert.rejects(send(capture), /PERMISSION_CHANGED_OFFLINE/);
            await assert.rejects(service.read(actor, fact.id));
            allowed = true;
            await assert.rejects(
              service.read({ ...actor, tenantId: otherTenant }, fact.id),
            );
            for (const patch of [
              { actualQuantity: "1.123" },
              { completedAt: "2099-01-01T00:00:00Z" },
              { operationTypeId: uuidv7() },
              { organizationId: randomUUID() },
            ])
              assert.equal(
                (
                  await send(
                    intent("Capture", {
                      data: { ...data(), ...patch },
                      reason: "Negative",
                    }),
                  )
                ).status,
                "REJECTED",
              );
            ownerAllowed = false;
            assert.equal(
              (
                await send(
                  intent("Capture", { data: data(), reason: "Revoked owner" }),
                )
              ).status,
              "REJECTED",
            );
            ownerAllowed = true;
            process.env.AGRO_DEPLOYMENT_MODE = "CLOUD_REPLICA";
            await assert.rejects(
              send(intent("Capture", { data: data(), reason: "Cloud" })),
              /AUTHORITY_MODE_MISMATCH/,
            );
            process.env.AGRO_DEPLOYMENT_MODE = "LOCAL_PRIMARY";
          },
        );
        await t.test(
          "stale owner reference cannot be confirmed and privileged offline intent is refused",
          async () => {
            let f = await accept(
              intent("Capture", {
                data: data(),
                reason: "Stale owner fixture",
              }),
            );
            f = await accept(
              intent("Submit", { reason: "Submit" }, f.id, f.version),
            );
            await master.correctMaterial(
              owner,
              material.id,
              {
                expectedVersion: material.rowVersion,
                reason: "Owner changes material",
                patch: { name: "Changed fixture reference" },
              },
              ctx(),
            );
            const stale = await send(
              intent(
                "Confirm",
                { reason: "Stale owner confirmation" },
                f.id,
                f.version,
                true,
              ),
              true,
            );
            assert.equal(stale.status, "CONFLICT");
            const before = await service.read(actor, fact.id),
              offline = intent(
                "Correct",
                { data: data(), reason: "Offline correction refused" },
                fact.id,
                fact.version,
              );
            offline.offlineAuthId = "fixture-offline";
            assert.equal((await send(offline)).status, "REJECTED");
            assert.deepEqual(await service.read(actor, fact.id), before);
          },
        );
        await t.test(
          "Task completion is reused once through its owner; no duplicate execution/lifecycle effect",
          async () => {
            const key = uuidv7();
            let v = 0;
            for (const [action, payload] of [
              [
                "Create",
                {
                  operationTypeId,
                  targetType: "FIELD_SEASON",
                  targetId: fs.entityId,
                  plannedQty: "3",
                  uom: unit.code,
                  priority: 50,
                },
              ],
              ["Plan", {}],
              ["Assign", { employeeIds: [employeeId] }],
              ["Accept", {}],
              ["Start", {}],
              ["Complete", { actualQty: "2.25", uom: unit.code }],
            ]) {
              const c = intent("Submit", payload, key, v);
              c.type = `Task.${action}`;
              c.aggregate.type = "Task";
              if (action === "Complete") c.observedAt = "2026-11-18T01:00:00Z";
              const r = await send(c);
              assert.equal(r.status, "ACCEPTED", JSON.stringify(r));
              v = r.aggregateVersion;
            }
            const before = await tasks.read(actor, key),
              linked = {
                organizationId,
                fieldSeasonId: fs.entityId,
                taskId: key,
                materials: [],
                labor: [{ employeeId, quantity: "1", unit: unit.code }],
                sourceType: "USER_MOBILE",
              };
            const f = await accept(
              intent("Capture", { data: linked, reason: "Reuse Task" }),
            );
            assert.equal(f.data.actualQuantity, "2.250000");
            assert.equal(
              (
                await send(
                  intent("Capture", {
                    data: linked,
                    reason: "Duplicate source",
                  }),
                )
              ).status,
              "CONFLICT",
            );
            assert.deepEqual(await tasks.read(actor, key), before);
            assert.equal(
              (
                await pool.query(
                  "SELECT count(*)::int n FROM tasks.operation_fact",
                )
              ).rows[0].n,
              1,
            );
          },
        );
        await t.test(
          "audit/outbox rollback includes receipt and feed; historical facts reject modification",
          async () => {
            const counts = async () =>
              (
                await pool.query(
                  "SELECT (SELECT count(*) FROM agronomy.actual_fact) f,(SELECT count(*) FROM agronomy.actual_revision) r,(SELECT count(*) FROM agronomy.actual_audit) a,(SELECT count(*) FROM agronomy.actual_outbox_event) o,(SELECT count(*) FROM sync.command_receipt) c,(SELECT count(*) FROM sync.change) d",
                )
              ).rows[0];
            await pool.query(
              "CREATE FUNCTION agronomy.fixture_actual_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'ACTUAL_FIXTURE_ROLLBACK'; END $$",
            );
            for (const table of ["actual_audit", "actual_outbox_event"]) {
              const before = await counts();
              await pool.query(
                `CREATE TRIGGER fixture_actual_fail BEFORE INSERT ON agronomy.${table} FOR EACH STATEMENT EXECUTE FUNCTION agronomy.fixture_actual_fail()`,
              );
              await assert.rejects(
                send(intent("Capture", { data: data(), reason: "Rollback" })),
                /ACTUAL_FIXTURE_ROLLBACK/,
              );
              await pool.query(
                `DROP TRIGGER fixture_actual_fail ON agronomy.${table}`,
              );
              assert.deepEqual(await counts(), before);
            }
            for (const table of [
              "actual_revision",
              "actual_audit",
              "actual_outbox_event",
            ])
              await assert.rejects(
                pool.query(`DELETE FROM agronomy.${table}`),
                /IMMUTABLE/,
              );
            await assert.rejects(
              pool.query(
                "UPDATE agronomy.actual_revision SET reason='overwrite'",
              ),
              /IMMUTABLE/,
            );
          },
        );
        await t.test(
          "outbox/inbox failed delivery retry and catalog payloads converge exactly once",
          async () => {
            const { events } = await loadAndValidateContracts(),
              defs = new Map(events.events.map((e) => [e.name, e])),
              all = (
                await pool.query(
                  "SELECT event_name,payload FROM agronomy.actual_outbox_event",
                )
              ).rows;
            for (const e of all)
              assert.deepEqual(
                validateJsonSchema(defs.get(e.event_name).schema, e.payload),
                [],
              );
            let failure = true,
              handled = 0;
            const d = new OutboxDispatcherService(
              pool,
              [
                {
                  name: "wp033-fixture",
                  handle: async (tx, e) => {
                    if (e.source !== "agronomy-actual") return;
                    if (failure) throw Error("FIXTURE_RETRY");
                    await tx.query("SELECT 1");
                    handled++;
                  },
                },
              ],
              new InboxService(pool),
            );
            await d.dispatchAvailable(1000);
            failure = false;
            for (let n = 0; n < 10; n++) {
              await pool.query(
                "UPDATE platform_events.outbox_delivery SET next_attempt_at=clock_timestamp() WHERE source='agronomy-actual' AND delivered_at IS NULL",
              );
              await d.dispatchAvailable(1000);
            }
            assert.equal(handled, all.length);
            await d.dispatchAvailable(1000);
            assert.equal(handled, all.length);
          },
        );
        await t.test(
          "real HTTP capture/read/history/context authentication and pull permission purge",
          async () => {
            class FixtureModule {}
            Module({
              controllers: [ActualOperationController],
              providers: [
                { provide: ActualOperationService, useValue: service },
                { provide: SyncService, useValue: sync },
              ],
            })(FixtureModule);
            const app = await NestFactory.create(FixtureModule, {
              logger: false,
            });
            await app.listen(0, "127.0.0.1");
            try {
              const url = await app.getUrl(),
                headers = {
                  authorization: auth,
                  "content-type": "application/json",
                };
              const res = await fetch(url + "/v1/agronomy/operations", {
                method: "POST",
                headers,
                body: JSON.stringify({
                  scopeVersion: 1,
                  command: intent("Capture", { data: data(), reason: "HTTP" }),
                }),
              });
              assert.equal(res.status, 200);
              const r = (await res.json()).results[0];
              assert.equal(r.status, "ACCEPTED");
              assert.deepEqual(
                await (
                  await fetch(
                    url + "/v1/agronomy/operations/" + r.canonical.id,
                    { headers },
                  )
                ).json(),
                r.canonical,
              );
              assert.equal(
                (
                  await (
                    await fetch(
                      url +
                        "/v1/agronomy/operations/" +
                        r.canonical.id +
                        "/history",
                      { headers },
                    )
                  ).json()
                ).revisions.length,
                1,
              );
              assert.equal(
                (await fetch(url + "/v1/agronomy/operations/" + r.canonical.id))
                  .status,
                401,
              );
              assert.equal(
                (
                  await (
                    await fetch(
                      url + "/v1/agronomy/operations/capture-contexts",
                      { headers },
                    )
                  ).json()
                ).items.length,
                1,
              );
              const { generateKeyPairSync } = await import("node:crypto");
              const old = process.env.SYNC_GRANT_PRIVATE_KEY;
              process.env.SYNC_GRANT_PRIVATE_KEY = generateKeyPairSync(
                "ed25519",
              ).privateKey.export({ type: "pkcs8", format: "pem" });
              try {
                const b = await sync.bootstrap(auth, {
                  deviceId,
                  schemaVersion: 1,
                });
                assert.deepEqual(
                  b.grants
                    .filter((g) => g.commands[0].startsWith("ActualOperation."))
                    .map((g) => g.commands[0]),
                  ["ActualOperation.Capture"],
                );
                let cursor = b.initialCursor;
                const ids = new Set();
                for (let n = 0; n < 30; n++) {
                  const p = await sync.pull(auth, {
                    deviceId,
                    scopeVersion: 1,
                    cursor,
                    limit: 2,
                  });
                  for (const x of p.changes)
                    if (x.entityType === "ActualOperation" && x.op === "UPSERT")
                      ids.add(x.entityId);
                  cursor = p.nextCursor;
                  if (!p.hasMore) break;
                }
                assert.ok(ids.has(r.canonical.id));
                allowed = false;
                const p = await sync.pull(auth, {
                  deviceId,
                  scopeVersion: 1,
                  cursor: b.initialCursor,
                  limit: 500,
                });
                assert.ok(
                  p.changes
                    .filter((x) => x.entityType === "ActualOperation")
                    .every((x) => x.op === "PURGE"),
                );
                allowed = true;
              } finally {
                if (old === undefined)
                  delete process.env.SYNC_GRANT_PRIVATE_KEY;
                else process.env.SYNC_GRANT_PRIVATE_KEY = old;
              }
            } finally {
              await app.close();
            }
          },
        );
      } finally {
        if (oldCursor === undefined) delete process.env.SYNC_CURSOR_KEY;
        else process.env.SYNC_CURSOR_KEY = oldCursor;
      }
    } finally {
      if (pool) await pool.end();
      if (started) docker(["rm", "--force", container]);
      await rm(temporaryDirectory, { recursive: true, force: true });
      if (previousMode === undefined) delete process.env.AGRO_DEPLOYMENT_MODE;
      else process.env.AGRO_DEPLOYMENT_MODE = previousMode;
    }
  },
);
