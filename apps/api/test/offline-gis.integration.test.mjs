import {OfflineGisRegistry} from '../dist/modules/offline-gis/offline-gis.registry.js';
import {OfflineGisService} from '../dist/modules/offline-gis/offline-gis.service.js';
import {OfflineGisSync} from '../dist/modules/offline-gis/offline-gis.sync.js';
import {OfflineGisEvents} from '../dist/modules/offline-gis/offline-gis.events.js';
import {OfflineGisController} from '../dist/modules/offline-gis/offline-gis.controller.js';
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
import { randomUUID,generateKeyPairSync } from 'node:crypto';
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
test('Offline GIS actual owners, incremental feed, native-independent delivery and real Task execution',{timeout:900000},async(t)=>{
  const container = `agro-wp49-029-gis-${process.pid}`;
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
    assert.match(migration.stdout, /migration 16 applied/);




    const tenantId=randomUUID(),userId=randomUUID(),deviceId=randomUUID(),organizationId=randomUUID(),siteId=randomUUID(),employeeId=randomUUID(),operationTypeId=randomUUID();
    const actor={tenantId,userId,deviceId,sessionId:randomUUID()},owner={tenantId,subjectId:userId};
    await pool.query("INSERT INTO org.tenant(id,code,name,timezone,created_by) VALUES($1,'MAP','Map fixture','UTC',$2)",[tenantId,userId]);
    await pool.query("INSERT INTO org.organization(id,tenant_id,code,name,organization_type,created_by) VALUES($1,$2,'MAP-ORG','Map fixture','FARM',$3)",[organizationId,tenantId,userId]);
    const farmRegistry=new FarmRegistry(),landRegistry=new LandRegistry(),gisRegistry=new GisRegistry();
    let gisAllowed=true,pauseGisAt=0,enteredGis,releaseGis,gisGate=Promise.resolve();farmRegistry.installPolicy(async()=>true);landRegistry.installPolicy(async()=>true);gisRegistry.installPolicy(async(a,action)=>{if(pauseGisAt>0&&action==='gis.read'&&--pauseGisAt===0){enteredGis();await gisGate;}return gisAllowed;});
    const gis=new GisService(pool,gisRegistry),farm=new FarmService(pool,farmRegistry,new LandService(pool,landRegistry,gis),gis);
    const context=()=>({idempotencyKey:randomUUID(),correlationId:'wp029-fixed-scenario',causationId:'manual-fixture'});
    const geometry={type:'Polygon',coordinates:[[[30,50],[30.1,50],[30.1,50.1],[30,50.1],[30,50]]]};
    const pin=await gis.propose(owner,{expectedVersion:'0',geometry,source:{type:'MANUAL',sourceCrs:'EPSG:4326'},reason:'Test owned geometry'},context());
    const approved=await gis.decide(owner,{geometryId:pin.geometryId,versionId:pin.versionId,expectedVersion:pin.headVersion,decision:'APPROVED',effectiveAt:'2026-11-04T00:00:00Z',reason:'Test approved'},context());
    const fieldData={name:'Pinned field',nominalAreaHa:'10',status:'ACTIVE',geometryVersionId:pin.versionId,allocations:[]};
    const field=await farm.createField(owner,{organizationId,code:'MAP-FIELD',data:fieldData,effectiveAt:'2026-11-04T01:00:00Z',reason:'Fixture'},context());
    let allowed=true,visibleOrganization=organizationId,licensed=true,pauseRead=false,enteredRead,releaseRead;let readGate=Promise.resolve();let geometryReadAt=0,enteredGeometryRead,releaseGeometryRead;let geometryReadGate=Promise.resolve();
    const source={id:'test-public',label:'Test licensed only',styleUrl:'https://fixture.invalid/style.json',styleVersion:'style1',sourceVersion:'source1',attribution:'Test fixture',termsRef:'test-license',offlineAllowed:true,publicBasemap:true,minZoom:0,maxZoom:12};
    const registry=new OfflineGisRegistry();registry.install({scope:async(a,action)=>{if(geometryReadAt>0&&action==='offline-gis.package.read'&&--geometryReadAt===0){enteredGeometryRead();await geometryReadGate;}if(pauseRead&&action==='offline-gis.package.read'){pauseRead=false;enteredRead();await readGate;}return allowed?{organizationIds:[visibleOrganization],renderProfile:{version:'test-v1',toleranceDegrees:0.00001},offlineTtlSeconds:3600}:undefined;},sources:async()=>licensed?[source]:[]});
    const syncRegistry=new SyncRegistry();const auth='Bearer map-fixture';
    const identity={async authenticate(value){if(value!==auth)throw new UnauthorizedException();return {...actor};}};
    const sync=new SyncService(pool,syncRegistry,identity),service=new OfflineGisService(pool,registry,farm,gis,sync),consumer=new OfflineGisEvents(service);
    new OfflineGisSync(syncRegistry,service).onModuleInit();
    const taskRegistry=new TasksRegistry();taskRegistry.install({authorize:async(a,action,row)=>a.tenantId===tenantId&&(!row||row.organization_id===organizationId),resolveEmployee:async(a,id)=>id===employeeId?[userId]:[],operationType:async(a,id)=>id===operationTypeId,quantityRequired:async()=>true,offlineTtlSeconds:3600});
    const tasks=new TasksService(pool,taskRegistry,farm);new TasksSync(syncRegistry,tasks).onModuleInit();
    const oldCursor=process.env.SYNC_CURSOR_KEY,oldPrivate=process.env.SYNC_GRANT_PRIVATE_KEY;process.env.SYNC_CURSOR_KEY='offline_map_fixture_key_at_least_32_bytes';process.env.SYNC_GRANT_PRIVATE_KEY=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'});
    await sync.register(auth,{deviceId,installationId:randomUUID(),schemaVersion:1});
    const chosen={targets:[{id:field.entityId,kind:'FIELD'}],bounds:[30,50,30.2,50.2],minZoom:0,maxZoom:2,sourceId:source.id};
    let seq=0,version=0,selected,app,cursor;
    const uuid7=()=>randomUUID().slice(0,14)+'7'+randomUUID().slice(15);
    function intent(action,payload={},aggregateType='OfflineGisPackage',aggregateId=deviceId,baseVersion=version){const id=uuid7();return {localCommandId:id,idempotencyKey:id,deviceSeq:++seq,aggregate:{type:aggregateType,id:aggregateId},baseVersion,type:`${aggregateType==='Task'?'Task':'OfflineGis'}.${action}`,commandVersion:1,observedAt:'2026-11-04T03:00:00Z',offlineAuthId:'test-signed-grant-ref',payload,provenance:{source:'manual',correlationId:'wp029-fixed-scenario'},attachments:[]};}
    const send=async command=>(await sync.push(auth,{deviceId,scopeVersion:1,schemaVersion:1,commands:[command]})).results[0];
    try {
      await t.test('registered current scope, actual geometry pin and original response-loss replay',async()=>{
        const candidates=await service.candidates(actor);assert.equal(candidates.items[0].id,field.entityId);
        const boot=await sync.bootstrap(auth,{deviceId,schemaVersion:1});cursor=boot.initialCursor;assert.ok(boot.grants.some(g=>g.commands.includes('OfflineGis.Select')&&g.owners.includes(`OfflineGisPackage:${deviceId}`)));
        selected=intent('Select',chosen);const result=await send(selected);assert.equal(result.status,'ACCEPTED');version=result.aggregateVersion;assert.deepEqual(await send(selected),result);
        assert.equal((await pool.query('SELECT count(*)::int n FROM offline_gis.audit')).rows[0].n,1);
        const projection=(await pool.query('SELECT projection FROM offline_gis.field_projection')).rows[0].projection;assert.equal(projection.geometryVersionId,pin.versionId);assert.equal(projection.name,'Pinned field');assert.ok(projection.geometry.coordinates.length);
        const page=await sync.pull(auth,{deviceId,scopeVersion:1,cursor});assert.equal(page.changes.filter(c=>c.entityType==='OfflineGisField').length,1);cursor=page.nextCursor;
        await assert.rejects(send({...selected,payload:{...chosen,maxZoom:3}}),/IDEMPOTENCY_PAYLOAD_MISMATCH/);
      });
      await t.test('real owner correction -> actual outbox/inbox retry -> incremental cache convergence',async()=>{
        await farm.correctField(owner,field.entityId,{expectedVersion:field.version,data:{...fieldData,name:'Corrected field'},effectiveAt:'2026-11-04T02:00:00Z',reason:'Immutable correction'},context());
        let fail=true;const dispatcher=new OutboxDispatcherService(pool,[{name:consumer.name,async handle(tx,event){if(fail)throw Error('test-delivery-fault');return consumer.handle(tx,event);}}],new InboxService(pool));
        await dispatcher.dispatchAvailable(1000);assert.equal((await service.read(actor,deviceId)).version,version);
        fail=false;await pool.query('UPDATE platform_events.outbox_delivery SET next_attempt_at=clock_timestamp()');await dispatcher.dispatchAvailable(1000);
        const manifest=await service.read(actor,deviceId);assert.ok(manifest.version>version);version=manifest.version;
        const page=await sync.pull(auth,{deviceId,scopeVersion:1,cursor});assert.equal(page.changes.filter(c=>c.entityType==='OfflineGisField').at(-1).projection.name,'Corrected field');cursor=page.nextCursor;
        const count=(await pool.query('SELECT count(*)::int n FROM offline_gis.audit')).rows[0].n;
        await pool.query('UPDATE platform_events.outbox_delivery SET delivered_at=NULL,next_attempt_at=clock_timestamp()');await dispatcher.dispatchAvailable(1000);assert.equal((await pool.query('SELECT count(*)::int n FROM offline_gis.audit')).rows[0].n,count);
        const stale=await send(intent('Refresh',{},'OfflineGisPackage',deviceId,1));assert.equal(stale.status,'CONFLICT');assert.deepEqual(Object.keys(stale.canonical).sort(),['id','version']);
      });
      await t.test('new approved geometry invalidates the source while the original field pin remains immutable',async()=>{
        const next=await gis.propose(owner,{geometryId:pin.geometryId,expectedVersion:approved.headVersion,geometry:{type:'Polygon',coordinates:[[[30,50],[30.15,50],[30.15,50.15],[30,50.15],[30,50]]]},source:{type:'MANUAL',sourceCrs:'EPSG:4326'},reason:'Source version fixture'},context());
        await gis.decide(owner,{geometryId:next.geometryId,versionId:next.versionId,expectedVersion:next.headVersion,decision:'APPROVED',effectiveAt:'2026-11-04T02:00:00Z',reason:'New approved source'},context());
        await new OutboxDispatcherService(pool,[consumer],new InboxService(pool)).dispatchAvailable(1000);
        const projection=(await pool.query('SELECT projection FROM offline_gis.field_projection WHERE tenant_id=$1',[tenantId])).rows[0].projection;
        assert.equal(projection.geometryVersionId,pin.versionId);assert.equal(projection.sourceChanged,true);assert.equal((await service.read(actor,deviceId)).sourceChanged,true);version=(await service.read(actor,deviceId)).version;
      });
      await t.test('concurrent selection cannot be overwritten by an older event read',async()=>{
        await farm.correctField(owner,field.entityId,{expectedVersion:'2',data:{...fieldData,name:'Concurrent correction'},effectiveAt:'2026-11-04T03:00:00Z',reason:'Race fixture'},context());
        const entered=new Promise(resolve=>enteredRead=resolve);readGate=new Promise(resolve=>releaseRead=resolve);pauseRead=true;
        const dispatcher=new OutboxDispatcherService(pool,[consumer],new InboxService(pool));const delivery=dispatcher.dispatchAvailable(1000);
        await entered;
        const changed={...chosen,bounds:[30,50,30.15,50.15]};
        try{const accepted=await send(intent('Select',changed));assert.equal(accepted.status,'ACCEPTED');version=accepted.aggregateVersion;}finally{releaseRead();}
        await delivery;assert.deepEqual((await service.read(actor,deviceId)).selection.bounds,changed.bounds);
        await pool.query('UPDATE platform_events.outbox_delivery SET next_attempt_at=clock_timestamp()');await dispatcher.dispatchAvailable(1000);
        assert.deepEqual((await service.read(actor,deviceId)).selection.bounds,changed.bounds);
        assert.equal((await service.read(actor,deviceId)).version,version);
      });
      await t.test('initial subscription cannot miss an owner change committed during its first snapshot',async()=>{
        const second={...actor,deviceId:randomUUID(),sessionId:randomUUID()};
        const otherSync=new SyncService(pool,syncRegistry,{async authenticate(){return second;}});
        await otherSync.register('first-subscription-fixture',{deviceId:second.deviceId,installationId:randomUUID(),schemaVersion:1});
        const entered=new Promise(resolve=>enteredGis=resolve);gisGate=new Promise(resolve=>releaseGis=resolve);pauseGisAt=2;
        const command=intent('Select',chosen,'OfflineGisPackage',second.deviceId,0);command.deviceSeq=1;
        const selecting=otherSync.push('first-subscription-fixture',{deviceId:second.deviceId,scopeVersion:1,schemaVersion:1,commands:[command]});
        await entered;
        let delivery;
        try{
          await farm.correctField(owner,field.entityId,{expectedVersion:'3',data:{...fieldData,name:'After initial subscription copy'},effectiveAt:'2026-11-04T04:00:00Z',reason:'Initial subscription race'},context());
          let enteredEvent;const consuming=new Promise(resolve=>enteredEvent=resolve);
          const dispatcher=new OutboxDispatcherService(pool,[{name:consumer.name,async handle(tx,event){enteredEvent();return consumer.handle(tx,event);}}],new InboxService(pool));
          delivery=dispatcher.dispatchAvailable(1000);await consuming;
          let blocked=false;
          for(let i=0;i<100&&!blocked;i++){blocked=(await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%offline_gis.tenant_gate%'")).rows[0].n>0;if(!blocked)await new Promise(resolve=>setTimeout(resolve,10));}
          assert.equal(blocked,true,'source delivery must wait for the in-flight first selection');
        }finally{releaseGis();}
        assert.equal((await selecting).results[0].status,'ACCEPTED');await delivery;
        const projected=(await pool.query('SELECT projection FROM offline_gis.field_projection WHERE tenant_id=$1 AND package_id=$2',[tenantId,second.deviceId])).rows[0].projection;
        assert.equal(projected.name,'After initial subscription copy');
        version=(await service.read(actor,deviceId)).version;
      });
      await t.test('current organization/source/tenant scope is rechecked on replay and pull',async()=>{
        visibleOrganization=randomUUID();await assert.rejects(send(selected),/PERMISSION_CHANGED_OFFLINE/);const page=await sync.pull(auth,{deviceId,scopeVersion:1,cursor:(await sync.bootstrap(auth,{deviceId,schemaVersion:1})).initialCursor});assert.ok(page.changes.filter(c=>c.entityType.startsWith('OfflineGis')).every(c=>c.op==='PURGE'));
        visibleOrganization=organizationId;gisAllowed=false;await assert.rejects(send(selected),/PERMISSION_CHANGED_OFFLINE/);assert.equal(await service.canRead(actor,'OfflineGisPackage',deviceId),false);gisAllowed=true;licensed=false;await assert.rejects(service.read(actor,deviceId));licensed=true;
        await assert.rejects(service.read({...actor,tenantId:randomUUID()},deviceId));await assert.rejects(service.read({...actor,deviceId:randomUUID()},deviceId));
      });
      await t.test('cached geometry removal preserves current GIS permission before/after owner delivery and retained replay',async()=>{
        const stale=(await pool.query('SELECT id,projection FROM offline_gis.field_projection WHERE tenant_id=$1 AND package_id=$2',[tenantId,deviceId])).rows[0];
        assert.ok(stale.projection.geometryVersionId);
        const withoutGeometry={...fieldData,name:'Geometry withdrawn'};delete withoutGeometry.geometryVersionId;
        await farm.correctField(owner,field.entityId,{expectedVersion:'4',data:withoutGeometry,effectiveAt:'2026-11-04T05:00:00Z',reason:'Remove geometry before delayed delivery'},context());
        gisAllowed=false;
        try{
          assert.equal(await service.canRead(actor,'OfflineGisField',stale.id),false,'old cached geometry must require current GIS permission even after the owner removed its reference');
          assert.equal(await service.canRead(actor,'OfflineGisPackage',deviceId),false);
          await assert.rejects(service.read(actor,deviceId),/OFFLINE_GIS_OWNER_FORBIDDEN/);
          const page=await sync.pull(auth,{deviceId,scopeVersion:1,cursor:(await sync.bootstrap(auth,{deviceId,schemaVersion:1})).initialCursor});
          assert.ok(page.changes.some(c=>c.entityType==='OfflineGisField'&&c.entityId===stale.id&&c.op==='PURGE'));
          assert.ok(page.changes.filter(c=>c.entityType.startsWith('OfflineGis')).every(c=>c.op==='PURGE'));
          const captured=new Promise(resolve=>enteredGeometryRead=resolve);geometryReadGate=new Promise(resolve=>releaseGeometryRead=resolve);geometryReadAt=2;
          const racingRead=service.canRead(actor,'OfflineGisField',stale.id);await captured;
          try{await new OutboxDispatcherService(pool,[consumer],new InboxService(pool)).dispatchAvailable(1000);}finally{releaseGeometryRead();}
          assert.equal(await racingRead,false,'captured geometric identity must remain denied if retirement happens during async source policy validation');
          const fresh=(await pool.query('SELECT id,projection FROM offline_gis.field_projection WHERE tenant_id=$1 AND package_id=$2',[tenantId,deviceId])).rows[0];
          assert.notEqual(fresh.id,stale.id,'retire the identity whose retained feed contains protected geometry');
          assert.equal(fresh.projection.geometryVersionId,undefined);assert.equal(fresh.projection.geometry,undefined);
          assert.equal(await service.canRead(actor,'OfflineGisField',stale.id),false);
          assert.equal(await service.canRead(actor,'OfflineGisField',fresh.id),true,'authorized non-GIS metadata becomes readable under a fresh identity');
          const replay=await sync.pull(auth,{deviceId,scopeVersion:1,cursor:(await sync.bootstrap(auth,{deviceId,schemaVersion:1})).initialCursor});
          const fields=replay.changes.filter(c=>c.entityType==='OfflineGisField');
          assert.ok(fields.some(c=>c.entityId===stale.id&&c.op==='PURGE'));
          assert.ok(fields.some(c=>c.entityId===fresh.id&&c.op==='UPSERT'));
          for(const change of fields){
            if(change.op==='PURGE')assert.deepEqual(change.projection,{});
            else for(const key of ['geometryVersionId','geometry','bounds','center'])assert.equal(key in change.projection,false,'full retained replay must never return old geometry after GIS denial');
          }
          version=(await service.read(actor,deviceId)).version;
        }finally{gisAllowed=true;}
      });
      await t.test('actual Task owner execution shares protocol and exactly-one immutable result',async()=>{
        const taskId=uuid7();let v=0,completed;
        for(const [action,payload] of [['Create',{operationTypeId,targetType:'FIELD',targetId:field.entityId,uom:'ha'}],['Plan',{}],['Assign',{employeeIds:[employeeId]}],['Accept',{}],['Start',{}],['Complete',{actualQty:'1',uom:'ha'}]]){const c=intent(action,payload,'Task',taskId,v);const result=await send(c);assert.equal(result.status,'ACCEPTED',JSON.stringify(result));v=result.aggregateVersion;if(action==='Complete')completed=c;}
        assert.equal((await send(completed)).status,'ACCEPTED');assert.equal((await pool.query('SELECT count(*)::int n FROM tasks.operation_fact WHERE task_id=$1',[taskId])).rows[0].n,1);
        assert.equal((await send(intent('Start',{},'Task',taskId,1))).status,'CONFLICT');
      });
      await t.test('real HTTP registration/route check and immutable audit; rollback preserves package/feed',async()=>{
        class HttpFixture{};Module({controllers:[OfflineGisController],providers:[{provide:OfflineGisService,useValue:{registry,read:(...a)=>service.read(...a),candidates:(...a)=>service.candidates(...a)}},{provide:SyncService,useValue:{registeredActor:(...a)=>sync.registeredActor(...a),push:(...a)=>sync.push(...a)}}]})(HttpFixture);app=await NestFactory.create(HttpFixture,{logger:false});await app.listen(0,'127.0.0.1');const base=await app.getUrl();
        assert.equal((await fetch(base+'/v1/offline-gis/sources')).status,401);assert.equal((await fetch(base+'/v1/offline-gis/fields?after=invalid',{headers:{authorization:auth}})).status,400);assert.equal((await fetch(base+'/v1/offline-gis/packages/'+deviceId,{headers:{authorization:auth}})).status,200);
        const bad=await fetch(base+'/v1/offline-gis/packages/'+deviceId+'/commands/select',{method:'POST',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify({scopeVersion:1,command:{type:'Task.Start'}})});assert.equal(bad.status,400);
        const refreshCommand=intent('Refresh',{},'OfflineGisPackage',deviceId,(await service.read(actor,deviceId)).version);
        const accepted=await fetch(base+'/v1/offline-gis/packages/'+deviceId+'/commands/refresh',{method:'POST',headers:{authorization:auth,'content-type':'application/json'},body:JSON.stringify({scopeVersion:1,command:refreshCommand})});
        assert.equal(accepted.status,200);assert.equal((await accepted.json()).results[0].status,'ACCEPTED');
        await assert.rejects(pool.query("UPDATE offline_gis.audit SET action='overwrite'"),/IMMUTABLE/);
        const before=(await service.read(actor,deviceId)).version;await pool.query("CREATE FUNCTION offline_gis.fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'offline-fault';END $$;CREATE TRIGGER fixture_fail BEFORE INSERT ON offline_gis.audit FOR EACH STATEMENT EXECUTE FUNCTION offline_gis.fixture_fail()");
        await assert.rejects(send(intent('Refresh',{},'OfflineGisPackage',deviceId,before)),/offline-fault/);await pool.query('DROP TRIGGER fixture_fail ON offline_gis.audit');assert.equal((await service.read(actor,deviceId)).version,before);
      });
    } finally {if(app)await app.close();if(oldCursor===undefined)delete process.env.SYNC_CURSOR_KEY;else process.env.SYNC_CURSOR_KEY=oldCursor;if(oldPrivate===undefined)delete process.env.SYNC_GRANT_PRIVATE_KEY;else process.env.SYNC_GRANT_PRIVATE_KEY=oldPrivate;}
  }finally{if(pool)await pool.end();if(previousMode===undefined)delete process.env.AGRO_DEPLOYMENT_MODE;else process.env.AGRO_DEPLOYMENT_MODE=previousMode;if(started)docker(['stop',container]);await rm(temporaryDirectory,{recursive:true,force:true});}
});
