import { ScoutingService } from '../dist/modules/scouting/scouting.service.js';
import { ScoutingRegistry } from '../dist/modules/scouting/scouting.registry.js';
import { ScoutingSync } from '../dist/modules/scouting/scouting.sync.js';
import { ScoutingController } from '../dist/modules/scouting/scouting.controller.js';
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
  "Scouting real PostGIS deterministic observation, handoff and sync",
  { timeout: 900000 },
  async (t) => {
    const container = `agro-wp49-034-scout-${process.pid}`;
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
      assert.match(migration.stdout, /migration 20 applied/);

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

      let taskAllowed=true;
      const tr=new TasksRegistry();tr.install({authorize:async(a,_k,r)=>taskAllowed&&a.tenantId===tenantId&&(!r||r.organization_id===organizationId),resolveEmployee:async()=>[],operationType:async(_a,id)=>id===operationTypeId,quantityRequired:async()=>false});
      const tasks=new TasksService(pool,tr,farm),sr=new SyncRegistry(),registry=new ScoutingRegistry();
      registry.install({authorize:async(a,_k,org)=>allowed&&a.tenantId===tenantId&&a.userId===subjectId&&org===organizationId,captureScopes:async()=>[{organizationId,fieldSeasonId:fs.entityId}],observer:async()=>referenceAllowed?{employeeId,revisionId:referenceRevision}:undefined,form:async()=>referenceAllowed,offlineTtlSeconds:300});
      const service=new ScoutingService(pool,registry,farm,tasks);new ScoutingSync(sr,service).onModuleInit();new TasksSync(sr,tasks).onModuleInit();
      const oldCursor=process.env.SYNC_CURSOR_KEY;process.env.SYNC_CURSOR_KEY='wp034-fixture-cursor-key-32-bytes-minimum';
      const auth='Bearer fixture',sync=new SyncService(pool,sr,{async authenticate(token){if(token!==auth)throw new UnauthorizedException();return {...actor};}});
      await sync.register(auth,{deviceId,installationId:randomUUID(),schemaVersion:1});
      let seq=0;
      const data=()=>({organizationId,fieldSeasonId:fs.entityId,observationType:'GENERAL',note:'Manual field evidence',anomaly:true,sourceType:'USER_MOBILE'});
      function intent(action,payload,key=fs.entityId,version=0){const cid=uuidv7();return {localCommandId:cid,idempotencyKey:cid,deviceSeq:++seq,aggregate:{type:action==='Capture'?'ScoutingCapture':'Observation',id:key},baseVersion:version,type:`Scouting.${action}`,commandVersion:1,observedAt:at,offlineAuthId:action==='Capture'?'fixture-offline':'online',payload,provenance:{source:'manual',correlationId:'wp034-fixed-demo'},attachments:[]};}
      const send=async c=>(await sync.push(auth,{deviceId,scopeVersion:1,schemaVersion:1,commands:[c]})).results[0];
      const accept=async c=>{const r=await send(c);assert.equal(r.status,'ACCEPTED',JSON.stringify(r));return r.canonical;};
      try{
      let captured,original;
      await t.test('manual-only capture binds owner references and replays exactly once',async()=>{
       original=intent('Capture',{data:data(),reason:'Fixture observation'});captured=await accept(original);
       assert.equal(captured.id,original.localCommandId);assert.equal(captured.sourceReferences.fieldSeason.fieldId,field.entityId);assert.equal(captured.sourceReferences.fieldSeason.seasonId,season.entityId);assert.equal(captured.sourceReferences.fieldSeason.fieldRevisionId,field.revisionId);assert.equal(captured.sourceReferences.observer.employeeId,employeeId);assert.equal(captured.observedAt,new Date(at).toISOString());assert.equal(captured.data.location,undefined);assert.deepEqual(captured.attachments,[]);assert.deepEqual((await send(original)).canonical,captured);
       assert.equal((await pool.query('SELECT count(*) FROM scouting.observation')).rows[0].count,'1');
      });
      await t.test('GPS and optional media metadata survive missing upload and correction is immutable',async()=>{
       const c=intent('Capture',{data:{...data(),location:{latitude:54.123456789,longitude:36.123456789,accuracyMetres:8.21,observedAt:at,provider:'gps'},form:{id:operationTypeId,version:'1',answers:{soil:'dry',density:12.5}}},reason:'GPS evidence'});
       c.attachments=[{localAttachmentId:uuidv7(),ownerRef:`ScoutingCapture:${fs.entityId}`,evidenceType:'PHOTO',sha256:'a'.repeat(64),mime:'image/jpeg',sizeBytes:123,required:false},{localAttachmentId:uuidv7(),ownerRef:`ScoutingCapture:${fs.entityId}`,evidenceType:'VOICE',sha256:'b'.repeat(64),mime:'audio/mp4',sizeBytes:456,required:false}];
       const r=await accept(c);assert.equal(r.attachments.length,2);assert.equal(r.data.location.accuracyMetres,8.21);assert.deepEqual((await send(c)).canonical,r);
       assert.equal((await pool.query('SELECT ST_X(geom::geometry) AS x,ST_Y(geom::geometry) AS y FROM scouting.revision WHERE tenant_id=$1 AND id=$2',[tenantId,r.revisionId])).rows[0].x,36.123456789);
       const corrected=await accept(intent('Correct',{data:{...r.data,note:'Reasoned correction'},reason:'Clarification'},r.id,1));assert.equal(corrected.version,2);const h=await service.history(actor,r.id);assert.equal(h.length,2);assert.equal(h[0].data.note,'Manual field evidence');assert.equal(h[1].reason,'Clarification');
       await assert.rejects(pool.query('DELETE FROM scouting.revision WHERE id=$1',[r.revisionId]),/SCOUTING_IMMUTABLE/);
       assert.equal((await send(intent('Correct',{data:r.data,reason:'Stale'},r.id,1))).status,'CONFLICT');
      });
      await t.test('explicit anomaly handoff confirms one Task DRAFT and source provenance; replay/concurrency cannot duplicate',async()=>{
       const c=intent('CreateWork',{task:{operationTypeId,priority:70},reason:'Human follow-up'},captured.id,1);
       const r=await accept(c);assert.ok(r.taskId);const task=await tasks.read(actor,r.taskId);assert.equal(task.status,'DRAFT');assert.equal(task.definition.targetId,fs.entityId);assert.deepEqual((await send(c)).canonical,r);
       const trace=(await pool.query('SELECT provenance FROM tasks.transition WHERE tenant_id=$1 AND task_id=$2',[tenantId,r.taskId])).rows[0].provenance.intent.sourceObservation;assert.deepEqual(trace,{id:captured.id,revisionId:captured.revisionId,fieldSeasonId:fs.entityId});
       const another=intent('CreateWork',{task:{operationTypeId},reason:'Duplicate'},captured.id,2);assert.equal((await send(another)).status,'CONFLICT');assert.equal((await pool.query('SELECT count(*) FROM tasks.work_order')).rows[0].count,'1');
      });
      await t.test('task permission/validation failure rolls back both owners and their outboxes',async()=>{
       const r=await accept(intent('Capture',{data:data(),reason:'Fresh'}));taskAllowed=false;assert.equal((await send(intent('CreateWork',{task:{operationTypeId},reason:'Denied'},r.id,1))).status,'REJECTED');taskAllowed=true;
       assert.equal((await service.read(actor,r.id)).version,1);assert.equal((await pool.query('SELECT count(*) FROM tasks.work_order')).rows[0].count,'1');
       const bad=await send(intent('CreateWork',{task:{operationTypeId:uuidv7()},reason:'Invalid operation'},r.id,1));assert.equal(bad.status,'REJECTED');
       await pool.query("CREATE FUNCTION scouting.fail_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture rollback'; END $$; CREATE TRIGGER fixture_fail BEFORE INSERT ON scouting.outbox_event FOR EACH STATEMENT EXECUTE FUNCTION scouting.fail_event()");
       await assert.rejects(send(intent('CreateWork',{task:{operationTypeId},reason:'Atomic rollback'},r.id,1)),/fixture rollback/);await pool.query('DROP TRIGGER fixture_fail ON scouting.outbox_event');
       assert.equal((await pool.query('SELECT count(*) FROM tasks.work_order')).rows[0].count,'1');assert.equal((await service.read(actor,r.id)).version,1);
      });
      await t.test('current revoke, tenant isolation, observer/form references, mandatory-media misuse and owner scope deny',async()=>{
       await assert.rejects(service.read({...actor,tenantId:otherTenant},captured.id));allowed=false;await assert.rejects(send(original));allowed=true;
       referenceAllowed=false;assert.equal((await send(intent('Capture',{data:data(),reason:'No observer'}))).status,'REJECTED');referenceAllowed=true;
       const c=intent('Capture',{data:data(),reason:'Media cannot gate metadata'});c.attachments=[{localAttachmentId:uuidv7(),ownerRef:`ScoutingCapture:${fs.entityId}`,evidenceType:'VOICE',sha256:'c'.repeat(64),mime:'audio/mp4',sizeBytes:12,required:true}];const result=await send(c);assert.notEqual(result.status,'ACCEPTED');
       const noAnomaly=await accept(intent('Capture',{data:{...data(),anomaly:false},reason:'Normal observation'}));assert.equal((await send(intent('CreateWork',{task:{operationTypeId},reason:'No anomaly'},noAnomaly.id,1))).status,'CONFLICT');
       assert.equal(await sr.authorize({tenantId:otherTenant,actorId:subjectId,action:'file.upload',ownerRef:`ScoutingCapture:${fs.entityId}`}),false);assert.equal(await sr.authorize({tenantId,actorId:subjectId,action:'file.upload',ownerRef:`ScoutingCapture:${fs.entityId}`}),true);
      });
      await t.test('outbox retry/inbox replay delivers immutable scouting metadata',async()=>{
       const inbox=new InboxService(pool);let deliveries=0,fail=true;
       const dispatcher=new OutboxDispatcherService(pool,[{name:'wp034-fixture',async handle(_tx,event){if(event.source!=='scouting')return;if(fail){fail=false;throw Error('retry fixture');}deliveries++;}}],inbox);
       // Use the existing dispatcher contract, including real durable delivery/inbox state.
       await dispatcher.dispatchAvailable();await pool.query("UPDATE platform_events.outbox_delivery SET next_attempt_at=clock_timestamp() WHERE source='scouting' AND delivered_at IS NULL");await dispatcher.dispatchAvailable();const n=deliveries;await dispatcher.dispatchAvailable();assert.equal(deliveries,n);assert.ok(deliveries>0);
      });
      await t.test('authenticated HTTP reads/history and canonical contract are wired',async()=>{
       class Fixture{};Module({controllers:[ScoutingController],providers:[{provide:ScoutingService,useValue:Object.fromEntries(['read','history','contexts','list'].map(name=>[name,service[name].bind(service)]))},{provide:SyncService,useValue:Object.fromEntries(['actor','registeredActor','push'].map(name=>[name,sync[name].bind(sync)]))}]})(Fixture);const app=await NestFactory.create(Fixture,{logger:false});await app.listen(0,'127.0.0.1');try{const base=await app.getUrl();assert.equal((await fetch(`${base}/v1/scouting/observations/${captured.id}`)).status,401);const r=await fetch(`${base}/v1/scouting/observations/${captured.id}`,{headers:{authorization:auth}});assert.equal(r.status,200);assert.equal((await r.json()).taskId,(await service.read(actor,captured.id)).taskId);assert.equal((await(await fetch(`${base}/v1/scouting/observations/${captured.id}/history`,{headers:{authorization:auth}})).json()).revisions.length,2);}finally{await app.close();}
      });
      }finally{if(oldCursor===undefined)delete process.env.SYNC_CURSOR_KEY;else process.env.SYNC_CURSOR_KEY=oldCursor;}
    }finally{if(pool)await pool.end();if(started)docker(['rm','--force',container]);await rm(temporaryDirectory,{recursive:true,force:true});if(previousMode===undefined)delete process.env.AGRO_DEPLOYMENT_MODE;else process.env.AGRO_DEPLOYMENT_MODE=previousMode;}
  }
);
