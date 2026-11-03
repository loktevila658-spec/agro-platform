import { TasksService } from '../dist/modules/tasks/tasks.service.js';
import { TasksRegistry } from '../dist/modules/tasks/tasks.registry.js';
import { TasksSync } from '../dist/modules/tasks/tasks.sync.js';
import { TasksController } from '../dist/modules/tasks/tasks.controller.js';
import { SyncRegistry } from '../dist/modules/sync/sync.registry.js';
import { SyncService } from '../dist/modules/sync/sync.service.js';
import { Module, UnauthorizedException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { FarmService } from '../dist/modules/farm/farm.service.js';
import { FarmRegistry } from '../dist/modules/farm/farm.registry.js';
import { LandService } from '../dist/modules/land/land.service.js';
import { LandRegistry } from '../dist/modules/land/land.registry.js';
import { GisService } from '../dist/modules/gis/gis.service.js';
import { GisRegistry } from '../dist/modules/gis/gis.registry.js';
import { InboxService } from '../dist/modules/events/inbox.service.js';
import { OutboxDispatcherService } from '../dist/modules/events/outbox-dispatcher.service.js';
import { loadAndValidateContracts } from '../../../packages/contracts/scripts/lib/contracts.mjs';
const {Pool}=pg;
const repositoryRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const image=process.env.POSTGIS_TEST_IMAGE??'agroplatform/wp49-003-postgis:test';
function docker(args){return spawnSync('docker',args,{cwd:repositoryRoot,encoding:'utf8'});}
function assertCommand(result,action){assert.equal(result.status,0,`${action} failed\n${result.stdout}\n${result.stderr}`);}
test('Task owner real PostGIS lifecycle, actual sync and immutable execution',{timeout:900000},async(t)=>{
  const container = `agro-wp49-031-tasks-${process.pid}`;
  const password = 'wp49_027_ephemeral_test_only';
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'agro-land-integration-'));
  const psqlWrapper = join(temporaryDirectory, 'psql');
  let pool;
  const previousMode=process.env.AGRO_DEPLOYMENT_MODE;
  process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
  let started = false;

  try {
    await writeFile(psqlWrapper, `#!/bin/sh\nexec docker exec -i ${container} psql "$@"\n`, 'utf8');
    await chmod(psqlWrapper, 0o700);
    const imageCheck = docker(['image', 'inspect', image]);
    if (imageCheck.status !== 0 && !process.env.POSTGIS_TEST_IMAGE) {
      assertCommand(docker(['build', '--tag', image, '--file', 'database/test/Dockerfile.postgis', '.']), 'PostGIS image build');
    } else {
      assertCommand(imageCheck, 'PostGIS image lookup');
    }
    assertCommand(docker([
      'run', '--detach', '--rm', '--publish', '127.0.0.1::5432', '--volume', `${repositoryRoot}:${repositoryRoot}:ro`,
      '--name', container, '--env', `POSTGRES_PASSWORD=${password}`, '--env', 'POSTGRES_DB=agro_test', image,
    ]), 'PostgreSQL test container start');
    started = true;
    const portResult = docker(['inspect', '--format', '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}', container]);
    assertCommand(portResult, 'PostgreSQL port lookup');
    const port = portResult.stdout.trim();
    const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/agro_test`;
    const socketUrl = 'postgresql:///agro_test?host=%2Fvar%2Frun%2Fpostgresql&user=postgres';
    pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 1000 });

    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        const probe = await pool.query("SELECT current_database() AS name, pg_is_in_recovery() AS replica");
        if (probe.rows[0].name === 'agro_test' && !probe.rows[0].replica) { ready = true; break; }
      } catch {}
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    assert.equal(ready, true, 'PostgreSQL did not become ready');

    const migration = spawnSync(process.execPath, ['database/migrate.mjs'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: socketUrl, PSQL_BIN: psqlWrapper },
    });
    assertCommand(migration, 'Database migrations');
    assert.match(migration.stdout, /migration 15 applied/);



    const tenantId=randomUUID(),otherTenant=randomUUID(),subjectId=randomUUID(),organizationId=randomUUID(),deviceId=randomUUID(),employeeId=randomUUID(),operationTypeId=randomUUID();
    const actor={tenantId,userId:subjectId,deviceId,sessionId:randomUUID()},farmActor={tenantId,subjectId};
    await pool.query("INSERT INTO org.tenant(id,code,name,timezone,created_by) VALUES($1,'TASK-A','Task fixture','UTC',$3),($2,'TASK-B','Other fixture','UTC',$3)",[tenantId,otherTenant,subjectId]);
    await pool.query("INSERT INTO org.organization(id,tenant_id,code,name,organization_type,created_by) VALUES($1,$2,'TASK-ORG','Task org','FARM',$3)",[organizationId,tenantId,subjectId]);
    const farmRegistry=new FarmRegistry(),landRegistry=new LandRegistry(),gisRegistry=new GisRegistry();farmRegistry.installPolicy(async()=>true);landRegistry.installPolicy(async()=>true);gisRegistry.installPolicy(async()=>true);
    const farm=new FarmService(pool,farmRegistry,new LandService(pool,landRegistry,new GisService(pool,gisRegistry)),new GisService(pool,gisRegistry));
    const field=await farm.createField(farmActor,{organizationId,code:'TASK-FIELD',data:{name:'Manual field',nominalAreaHa:'10',status:'ACTIVE',allocations:[]},effectiveAt:'2026-11-04T00:00:00Z',reason:'Fixture'}, {idempotencyKey:randomUUID(),correlationId:'task-fixture',causationId:'task-fixture'});
    let allowed=true,operationAllowed=true,quantityRequired=true;
    const registry=new TasksRegistry();registry.install({authorize:async(a,action,row)=>allowed&&a.tenantId===tenantId&&a.userId===subjectId&&(!row||row.organization_id===organizationId),quantityRequired:async()=>quantityRequired,resolveEmployee:async(a,id)=>id===employeeId?[subjectId]:[],operationType:async(a,id)=>operationAllowed&&id===operationTypeId,offlineTtlSeconds:3600});
    const service=new TasksService(pool,registry,farm),syncRegistry=new SyncRegistry();new TasksSync(syncRegistry,service).onModuleInit();
    const oldKey=process.env.SYNC_CURSOR_KEY;process.env.SYNC_CURSOR_KEY='task_fixture_cursor_key_32_bytes_minimum';
    const identity={async authenticate(auth){if(auth!=='Bearer task-fixture')throw new UnauthorizedException();return {...actor};}};
    const sync=new SyncService(pool,syncRegistry,identity),auth='Bearer task-fixture';
    await sync.register(auth,{deviceId,installationId:randomUUID(),schemaVersion:1});
    const id=uuid7(),at='2026-11-04T01:00:00Z';let seq=0,version=0,acceptedReplay;
    function uuid7(){return randomUUID().slice(0,14)+'7'+randomUUID().slice(15);}
    function intent(action,payload={},taskId=id,baseVersion=version){const commandId=uuid7();return {localCommandId:commandId,idempotencyKey:commandId,deviceSeq:++seq,aggregate:{type:'Task',id:taskId},baseVersion,type:'Task.'+action,commandVersion:1,observedAt:at,offlineAuthId:'online-session',payload,provenance:{source:'manual',correlationId:'task-fixture'},attachments:[]};}
    async function send(c){return (await sync.push(auth,{deviceId,scopeVersion:1,schemaVersion:1,commands:[c]})).results[0];}
    async function execute(action,payload={}){const result=await send(intent(action,payload));assert.equal(result.status,'ACCEPTED',JSON.stringify(result));version=result.aggregateVersion;return result;}
    let app;
    try{
    await t.test('real canonical lifecycle and immutable completion, one fact on lost-response replay',async()=>{
      await execute('Create',{operationTypeId,targetType:'FIELD',targetId:field.entityId,plannedQty:'10',uom:'ha',priority:50});
      await execute('Plan');await execute('Assign',{employeeIds:[employeeId]});
      assert.deepEqual((await service.read(actor,id)).assignment.employeeIds,[employeeId]);
      await execute('Accept');await execute('Start');await execute('Pause',{reason:'Weather'});await execute('Resume');
      const pauseAudit=(await pool.query("SELECT provenance FROM tasks.transition WHERE tenant_id=$1 AND task_id=$2 AND action='Pause'",[tenantId,id])).rows[0].provenance;assert.equal(pauseAudit.commandPayload.reason,'Weather');assert.equal(pauseAudit.deviceId,deviceId);assert.equal(pauseAudit.intent.source,'manual');
      const c=intent('Complete',{actualQty:'9.500000',uom:'ha',comment:'Manual execution'}),first=await send(c);assert.equal(first.status,'ACCEPTED');version=first.aggregateVersion;
      assert.deepEqual(await send(c),first);acceptedReplay=c;
      await assert.rejects(send({...c,payload:{...c.payload,actualQty:'8'}}),/IDEMPOTENCY_PAYLOAD_MISMATCH/);
      const actor2={...actor,deviceId:randomUUID()},otherSync=new SyncService(pool,syncRegistry,{async authenticate(){return actor2;}});await otherSync.register('fixture-second',{deviceId:actor2.deviceId,installationId:randomUUID(),schemaVersion:1});
      const second={...c,localCommandId:uuid7(),deviceSeq:1};second.idempotencyKey=second.localCommandId;const conflict=await otherSync.push('fixture-second',{deviceId:actor2.deviceId,scopeVersion:1,schemaVersion:1,commands:[second]});assert.equal(conflict.results[0].status,'CONFLICT');assert.equal(conflict.results[0].code,'VERSION_CONFLICT');
      assert.equal((await pool.query('SELECT count(*)::int n FROM tasks.operation_fact WHERE tenant_id=$1',[tenantId])).rows[0].n,1);
      assert.equal((await pool.query('SELECT actual_qty::text FROM tasks.operation_fact WHERE tenant_id=$1',[tenantId])).rows[0].actual_qty,'9.500000');
      await execute('Verify');await execute('Close');
      await assert.rejects(pool.query('UPDATE tasks.operation_fact SET actual_qty=0 WHERE tenant_id=$1',[tenantId]),/TASK_IMMUTABLE_HISTORY/);
      await assert.rejects(pool.query('DELETE FROM tasks.transition WHERE tenant_id=$1',[tenantId]),/TASK_IMMUTABLE_HISTORY/);
    });
    await t.test('stale intent, invalid transitions and unowned cross-domain effects stay explicit',async()=>{
      const stale=await send(intent('Start',{},id,1));assert.equal(stale.status,'CONFLICT');assert.equal(stale.code,'VERSION_CONFLICT');assert.equal(stale.canonical.status,'CLOSED');
      const invalid=await send(intent('Start'));assert.equal(invalid.status,'CONFLICT');assert.equal(invalid.code,'STATE_CONFLICT');
      const material=await send(intent('Complete',{actualQty:'1',uom:'ha',materialConsumptions:[{quantity:'1'}]}));assert.equal(material.status,'REJECTED');
      assert.equal((await service.read(actor,id)).version,version);
    });
    await t.test('current permission/replay denial, tenant isolation and cloud fail closed',async()=>{
      allowed=false;await assert.rejects(send(acceptedReplay),/PERMISSION_CHANGED_OFFLINE/);const denied=await send(intent('Cancel',{reason:'denied'}));assert.equal(denied.status,'REJECTED');
      await assert.rejects(service.read(actor,id));allowed=true;
      await assert.rejects(service.read({...actor,tenantId:otherTenant},id));
      operationAllowed=false;const bad=await send(intent('Create',{operationTypeId,targetType:'FIELD',targetId:field.entityId,plannedQty:'1',uom:'ha',priority:50},uuid7(),0));assert.equal(bad.status,'REJECTED');operationAllowed=true;
      process.env.AGRO_DEPLOYMENT_MODE='CLOUD_PRIMARY';await assert.rejects(send(intent('Plan')),/AUTHORITY_MODE_MISMATCH/);process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
    });
    await t.test('unresolved resource refs reject and non-quantitative operation follows explicit owner policy',async()=>{
      quantityRequired=false;const auxiliary=uuid7();let v=0;
      async function aux(action,payload={}){const result=await send(intent(action,payload,auxiliary,v));if(result.status==='ACCEPTED')v=result.aggregateVersion;return result;}
      assert.equal((await aux('Create',{operationTypeId,targetType:'FIELD',targetId:field.entityId,priority:50})).status,'ACCEPTED');
      assert.equal((await aux('Plan')).status,'ACCEPTED');
      assert.equal((await aux('Assign',{employeeIds:[randomUUID()]})).status,'REJECTED');
      assert.equal((await aux('Assign',{employeeIds:[employeeId],assetIds:[randomUUID()]})).status,'REJECTED');
      for(const [action,payload] of [['Assign',{employeeIds:[employeeId]}],['Accept',{}],['Start',{}],['Complete',{}]])assert.equal((await aux(action,payload)).status,'ACCEPTED');
      assert.equal((await pool.query('SELECT actual_qty FROM tasks.operation_fact WHERE tenant_id=$1 AND task_id=$2',[tenantId,auxiliary])).rows[0].actual_qty,null);quantityRequired=true;
    });
    await t.test('feed convergence, revoked cache PURGE, actual HTTP owner route',async()=>{
      const bootstrap=await sync.bootstrap(auth,{deviceId,schemaVersion:1});let cursor=bootstrap.initialCursor;const page=await sync.pull(auth,{deviceId,scopeVersion:1,cursor,schemaVersion:1});
      const tasks=page.changes.filter(c=>c.entityType==='Task'&&c.entityId===id);assert.ok(tasks.length>=10);assert.equal(tasks.at(-1).projection.status,'CLOSED');
      allowed=false;const purged=await sync.pull(auth,{deviceId,scopeVersion:1,cursor,schemaVersion:1});assert.ok(purged.changes.every(c=>c.op==='PURGE'));allowed=true;
      class HttpTaskFixture{};Module({controllers:[TasksController],providers:[{provide:TasksService,useValue:{read:(...a)=>service.read(...a),list:(...a)=>service.list(...a)}},{provide:SyncService,useValue:{actor:(...a)=>sync.actor(...a),push:(...a)=>sync.push(...a)}}]})(HttpTaskFixture);
      app=await NestFactory.create(HttpTaskFixture,{logger:false});await app.listen(0,'127.0.0.1');const base=await app.getUrl();
      const response=await fetch(base+'/v1/tasks/'+id,{headers:{authorization:auth}});assert.equal(response.status,200);assert.equal((await response.json()).status,'CLOSED');
      assert.equal((await fetch(base+'/v1/tasks/'+id)).status,401);
      const command=intent('Create',{operationTypeId,targetType:'FIELD',targetId:field.entityId,uom:'ha',priority:50},uuid7(),0);const created=await fetch(base+'/v1/tasks',{method:'POST',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify({scopeVersion:1,command})});assert.equal(created.status,200);assert.equal((await created.json()).results[0].status,'ACCEPTED');
      const malformed=await fetch(base+'/v1/tasks/'+id+'/commands/Start',{method:'POST',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify({scopeVersion:1,command:{type:'Task.Start'}})});assert.equal(malformed.status,400);
    });
    await t.test('atomic rollback and actual outbox/inbox retry/replay',async()=>{
      const before=(await pool.query('SELECT count(*)::int n FROM tasks.work_order')).rows[0].n;
      await pool.query("CREATE FUNCTION tasks.fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'task-fixture-fault'; END $$; CREATE TRIGGER fixture_fail BEFORE INSERT ON tasks.transition FOR EACH STATEMENT EXECUTE FUNCTION tasks.fixture_fail()");
      await assert.rejects(send(intent('Create',{operationTypeId,targetType:'FIELD',targetId:field.entityId,plannedQty:'1',uom:'ha',priority:50},uuid7(),0)),/task-fixture-fault/);
      await pool.query('DROP TRIGGER fixture_fail ON tasks.transition');assert.equal((await pool.query('SELECT count(*)::int n FROM tasks.work_order')).rows[0].n,before);
      const events=(await pool.query('SELECT * FROM tasks.outbox_event WHERE tenant_id=$1',[tenantId])).rows;
      await pool.query('CREATE TABLE tasks.fixture_delivery(id uuid PRIMARY KEY)');let fail=true;
      const dispatcher=new OutboxDispatcherService(pool,[{name:'task-fixture-delivery',async handle(tx,event){if(event.source!=='tasks')return;if(fail)throw Error('temporary delivery');await tx.query('INSERT INTO tasks.fixture_delivery VALUES($1)',[event.id]);}}],new InboxService(pool));
      await dispatcher.dispatchAvailable(1000);assert.equal((await pool.query('SELECT count(*)::int n FROM tasks.fixture_delivery')).rows[0].n,0);fail=false;
      await pool.query("UPDATE platform_events.outbox_delivery SET next_attempt_at=clock_timestamp() WHERE source='tasks'");await dispatcher.dispatchAvailable(1000);
      assert.equal((await pool.query('SELECT count(*)::int n FROM tasks.fixture_delivery')).rows[0].n,events.length);
      await pool.query("UPDATE platform_events.outbox_delivery SET delivered_at=NULL,next_attempt_at=clock_timestamp() WHERE source='tasks'");await dispatcher.dispatchAvailable(1000);assert.equal((await pool.query('SELECT count(*)::int n FROM tasks.fixture_delivery')).rows[0].n,events.length);
    });
    }finally{if(app)await app.close();if(oldKey===undefined)delete process.env.SYNC_CURSOR_KEY;else process.env.SYNC_CURSOR_KEY=oldKey;}

  }finally{
    if(pool)await pool.end();if(started)docker(['stop',container]);await rm(temporaryDirectory,{recursive:true,force:true});
    if(previousMode===undefined)delete process.env.AGRO_DEPLOYMENT_MODE;else process.env.AGRO_DEPLOYMENT_MODE=previousMode;
  }
});
