import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { AgronomyService } from '../dist/modules/agronomy/agronomy.service.js';
import { AgronomyController } from '../dist/modules/agronomy/agronomy.controller.js';
import { AgronomyRegistry } from '../dist/modules/agronomy/agronomy.registry.js';
import { IdentityService } from '../dist/modules/identity/identity.service.js';
import { FarmService } from '../dist/modules/farm/farm.service.js';
import { FarmRegistry } from '../dist/modules/farm/farm.registry.js';
import { MasterDataService } from '../dist/modules/master-data/master-data.service.js';
import { MasterDataRegistry } from '../dist/modules/master-data/master-data.registry.js';
import { InboxService } from '../dist/modules/events/inbox.service.js';
import { OutboxDispatcherService } from '../dist/modules/events/outbox-dispatcher.service.js';
import { loadAndValidateContracts, validateJsonSchema } from '../../../packages/contracts/scripts/lib/contracts.mjs';
import { validateAction } from '../dist/modules/tasks/tasks.validation.js';
const {Pool}=pg;
const repositoryRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const image=process.env.POSTGIS_TEST_IMAGE??'agroplatform/wp49-003-postgis:test';
function docker(args){return spawnSync('docker',args,{cwd:repositoryRoot,encoding:'utf8'});}
function assertCommand(result,action){assert.equal(result.status,0,`${action} failed\n${result.stdout}\n${result.stderr}`);}
test('SeasonPlan and TechMap real PostGIS deterministic versioning, planning and atomic owner scenario',{timeout:900000},async(t)=>{
  const container = `agro-wp49-032-agronomy-${process.pid}`;
  const password = 'wp49_027_ephemeral_test_only';
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'agro-agronomy-integration-'));
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
    assert.match(migration.stdout, /migration 18 applied/);


    const tenantId=randomUUID(),subjectId=randomUUID(),organizationId=randomUUID(),otherTenant=randomUUID(),otherOrg=randomUUID();
    const actor={tenantId,subjectId},other={tenantId:otherTenant,subjectId};
    await pool.query("INSERT INTO org.tenant(id,code,name,timezone,created_by) VALUES($1,'AGRO-A','Fixture A','UTC',$3),($2,'AGRO-B','Fixture B','UTC',$3)",[tenantId,otherTenant,subjectId]);
    await pool.query("INSERT INTO org.organization(id,tenant_id,code,name,organization_type,created_by) VALUES($1,$2,'AGRO-ORG','Fixture org','FARM',$3),($4,$5,'AGRO-OTHER','Fixture other','FARM',$3)",[organizationId,tenantId,subjectId,otherOrg,otherTenant]);
    const masterRegistry=new MasterDataRegistry(),farmRegistry=new FarmRegistry();let ownerAllowed=true;
    masterRegistry.installPolicy(async a=>ownerAllowed&&a.subjectId===subjectId);farmRegistry.installPolicy(async a=>ownerAllowed&&a.subjectId===subjectId);
    masterRegistry.registerSourcePolicy({tenantId,version:1,dataOwnerId:subjectId,stewardId:subjectId,fields:{}});
    const farm=new FarmService(pool,farmRegistry,undefined,undefined),master=new MasterDataService(pool,masterRegistry,undefined);
    const ctx=(key=randomUUID())=>({idempotencyKey:key,correlationId:'wp032-fixed-demo',causationId:'wp032-command'}),at='2026-11-18T00:00:00Z';
    const unit=await master.createUnit(actor,{code:'fixture-unit',name:'Explicit fixture unit',dimension:'COUNT',precision:6},ctx());
    const material=await master.createMaterial(actor,{code:'fixture-resource',name:'Fixture resource',itemType:'RAW',baseUom:unit.code,organizationId},ctx());
    const field=await farm.createField(actor,{organizationId,code:'F-032',data:{name:'Fixture field',nominalAreaHa:'3',status:'ACTIVE',allocations:[]},effectiveAt:at,reason:'Fixture field'},ctx());
    const season=await farm.createSeason(actor,{organizationId,data:{name:'Fixture explicit season',year:2027,startDate:'2026-09-01',endDate:'2027-08-31',status:'PLANNED'},effectiveAt:at,reason:'Fixture season'},ctx());
    const fs=await farm.createFieldSeason(actor,{fieldId:field.entityId,seasonId:season.entityId,data:{plannedAreaHa:'3',status:'PLANNED'},effectiveAt:at,reason:'Fixture seasonal context'},ctx());
    const registry=new AgronomyRegistry(),service=new AgronomyService(pool,registry,farm,master);
    const opId='019a0000-0000-7000-8000-000000000032',operationId='019a0000-0000-7000-8000-000000000033',referenceRevision='11111111-1111-4111-8111-111111111111';
    const operation=()=>({id:opId,operationTypeId:operationId,sequence:1,quantity:'3',unit:unit.code,unscheduled:false,window:{start:'2026-11-18T03:00:00+03:00',end:'2026-11-19T00:00:00Z'},resources:[{kind:'MATERIAL',referenceId:material.id,unit:unit.code,normPerArea:'0.1',effectiveArea:'3',reserveFactor:'0.1',formulaVersion:'DOC34-8-MATERIAL-1'}]});
    const create=(kind,data)=>({kind,organizationId,data,effectiveAt:at,reason:'Explicit fixture plan'});
    const command=(row,data)=>({expectedVersion:row.version,...(data?{data}:{}),effectiveAt:at,reason:'Explicit fixture revision'});
    const pinned=row=>({entityId:row.id,revisionId:row.revisionId});
    let permitted=true,canApprove=true;
    const templateInput=create('TEMPLATE',{name:'Fixture template',operations:[operation()]});
    await assert.rejects(service.create(actor,templateInput,ctx()),/FORBIDDEN/);
    registry.install({authorize:async(a,action,org)=>permitted&&a.tenantId===tenantId&&a.subjectId===subjectId&&org===organizationId&&(canApprove||!['agronomy.tech_map.approve','agronomy.season_plan.publish'].includes(action)),reference:async(_tx,_a,kind,id)=>kind==='OPERATION'&&id===operationId?{id,revisionId:referenceRevision}:undefined,formula:async(_a,r)=>r.formulaVersion==='DOC34-8-MATERIAL-1'&&r.unit===unit.code});
    let template,map,plan;
    await t.test('template versions, exact inherited operation and source-defined resource calculation',async()=>{
      const key=ctx('template-create');const concurrent=await Promise.all([service.create(actor,templateInput,key),service.create(actor,templateInput,key)]);assert.deepEqual(concurrent[0],concurrent[1]);template=concurrent[0];
      assert.equal(template.version,'1');canApprove=false;await assert.rejects(service.command(actor,template.id,'Approve',command(template),ctx()),/FORBIDDEN/);canApprove=true;
      template=await service.command(actor,template.id,'Approve',command(template),ctx());template=await service.command(actor,template.id,'Publish',command(template),ctx());
      const inherited=await service.create(actor,create('TEMPLATE',{name:'Fixture derived',parent:pinned(template),operations:[]}),ctx());assert.deepEqual(inherited.data.operations,template.data.operations);
      await assert.rejects(service.command(actor,inherited.id,'Revise',command(inherited,{name:'Cycle',parent:pinned(inherited),operations:[]}),ctx()),/CYCLE|UNAVAILABLE/);
      map=await service.create(actor,create('TECH_MAP',{name:'Fixture applied',fieldSeasonId:fs.entityId,template:pinned(template),operations:[]}),ctx());
      map=await service.command(actor,map.id,'Approve',command(map),ctx());map=await service.command(actor,map.id,'Publish',command(map),ctx());
      const resources=await service.resources(actor,map.id,map.revisionId);assert.equal(resources.length,1);assert.equal(resources[0].quantity,'0.330000');assert.equal(resources[0].inputs.normPerArea,'0.1');
      assert.equal(map.sourceReferences.fieldSeason.revisionId,fs.revisionId);assert.equal(map.sourceReferences.operations[0].resources[0].reference.revisionId,material.revisionId);
    });
    await t.test('published SeasonPlan pins a map revision and creates only a compatible Task draft',async()=>{
      plan=await service.create(actor,create('SEASON_PLAN',{name:'Fixture SeasonPlan',seasonId:season.entityId,scenario:'BASE',assumptions:['Fixture explicit assumption'],sourceReferences:[{source:'Fixture documentary planning input',version:'1'}],techMaps:[pinned(map)]}),ctx());
      await assert.rejects(service.command(actor,plan.id,'Publish',command(plan),ctx()),/STATE/);
      plan=await service.command(actor,plan.id,'Approve',command(plan),ctx());plan=await service.command(actor,plan.id,'Publish',command(plan),ctx());
      const before=(await pool.query('SELECT count(*) AS n FROM tasks.work_order')).rows[0].n;
      const draft=await service.taskDraft(actor,plan.id,{expectedVersion:plan.version,mapRevisionId:map.revisionId,operationId:opId});validateAction('Create',draft.definition);assert.equal(draft.definition.targetId,fs.entityId);assert.equal(draft.definition.plannedStart,'2026-11-18T00:00:00.000Z');assert.equal(draft.planRevisionId,plan.revisionId);
      assert.equal((await pool.query('SELECT count(*) AS n FROM tasks.work_order')).rows[0].n,before);
      await assert.rejects(service.taskDraft(actor,plan.id,{expectedVersion:'1',mapRevisionId:map.revisionId,operationId:opId}),/VERSION/);
      const oldData=template.data;template=await service.command(actor,template.id,'Revise',command(template,{...oldData,name:'Fixture revised template'}),ctx());
      const history=await service.history(actor,template.id);assert.equal(history.length,4);assert.deepEqual(history[2].data,oldData);assert.equal(history[3].previousRevisionId,history[2].revisionId);
      assert.equal((await service.read(actor,map.id)).data.name,'Fixture applied');assert.equal((await service.taskDraft(actor,plan.id,{expectedVersion:plan.version,mapRevisionId:map.revisionId,operationId:opId})).mapRevisionId,map.revisionId);
      const competing=await Promise.allSettled([service.command(actor,template.id,'Revise',command(template,{...template.data,name:'Fixture A'}),ctx()),service.command(actor,template.id,'Revise',command(template,{...template.data,name:'Fixture B'}),ctx())]);assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);assert.match(competing.find(r=>r.status==='rejected').reason.message,/version conflict/i);
    });
    await t.test('current policy, tenant/org/owner/Local isolation and replay remain authoritative',async()=>{
      await assert.rejects(service.read(other,plan.id),/NOT_AVAILABLE/);await assert.rejects(service.create(actor,{...templateInput,organizationId:otherOrg},ctx()),/FORBIDDEN/);
      const receipt=ctx('revoke-replay');const saved=await service.create(actor,templateInput,receipt);permitted=false;await assert.rejects(service.create(actor,templateInput,receipt),/FORBIDDEN/);permitted=true;assert.deepEqual(await service.create(actor,templateInput,receipt),saved);
      await assert.rejects(service.create(actor,{...templateInput,data:{...templateInput.data,name:'Different'}},receipt),/IDEMPOTENCY/);
      ownerAllowed=false;await assert.rejects(service.create(actor,templateInput,ctx()),/FORBIDDEN/);ownerAllowed=true;
      await assert.rejects(service.create(actor,create('TEMPLATE',{name:'Unknown operation',operations:[{...operation(),operationTypeId:randomUUID()}]}),ctx()),/UNAVAILABLE/);
      const stale=await service.create(actor,create('TECH_MAP',{name:'Fixture stale material',fieldSeasonId:fs.entityId,template:{entityId:template.id,revisionId:(await service.history(actor,template.id))[2].revisionId},operations:[]}),ctx());
      await master.correctMaterial(actor,material.id,{expectedVersion:material.rowVersion,reason:'Fixture owner correction',patch:{name:'Changed reference'}},ctx());
      await assert.rejects(service.command(actor,stale.id,'Approve',command(stale),ctx()),/REFERENCE_VERSION_CHANGED/);
      process.env.AGRO_DEPLOYMENT_MODE='CLOUD_REPLICA';await assert.rejects(service.create(actor,templateInput,ctx()),/LOCAL_PRIMARY/);process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
      // Current owner status matters; historical plans stay immutable.
      await farm.correctFieldSeason(actor,fs.entityId,{expectedVersion:fs.version,data:{plannedAreaHa:'3',status:'CLOSED'},effectiveAt:at,reason:'Fixture close season'},ctx());
      await assert.rejects(service.create(actor,create('TECH_MAP',{name:'Closed context',fieldSeasonId:fs.entityId,template:{entityId:template.id,revisionId:(await service.history(actor,template.id))[2].revisionId},operations:[]}),ctx()),/UNAVAILABLE/);
    });
    await t.test('audit and outbox failures roll back all revision/head/receipt effects; immutable history resists edits',async()=>{
      const counts=async()=> (await pool.query('SELECT (SELECT count(*) FROM agronomy.entity) e,(SELECT count(*) FROM agronomy.revision) r,(SELECT count(*) FROM agronomy.audit) a,(SELECT count(*) FROM agronomy.command_idempotency) c,(SELECT count(*) FROM agronomy.outbox_event) o')).rows[0];
      const simple=create('TEMPLATE',{name:'Fixture no resources',operations:[]});
      await pool.query("CREATE FUNCTION agronomy.fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FIXTURE_ROLLBACK'; END $$");
      for(const table of ['audit','outbox_event']){const before=await counts();await pool.query(`CREATE TRIGGER fixture_fail BEFORE INSERT ON agronomy.${table} FOR EACH STATEMENT EXECUTE FUNCTION agronomy.fixture_fail()`);await assert.rejects(service.create(actor,simple,ctx()),/FIXTURE_ROLLBACK/);await pool.query(`DROP TRIGGER fixture_fail ON agronomy.${table}`);assert.deepEqual(await counts(),before);}
      for(const table of ['revision','audit','planned_operation','resource_demand','outbox_event','command_idempotency'])await assert.rejects(pool.query(`DELETE FROM agronomy.${table}`),/IMMUTABLE/);
      await assert.rejects(pool.query('UPDATE agronomy.revision SET reason=\'overwrite\''),/IMMUTABLE/);
      await assert.rejects(pool.query('TRUNCATE agronomy.entity,agronomy.revision,agronomy.audit,agronomy.planned_operation,agronomy.resource_demand,agronomy.outbox_event,agronomy.command_idempotency'),/IMMUTABLE/);
    });
    await t.test('actual dispatcher/inbox retry, deduplication and event contracts',async()=>{
      const {events}=await loadAndValidateContracts();const definitions=new Map(events.events.map(e=>[e.name,e]));const all=(await pool.query('SELECT event_name,payload FROM agronomy.outbox_event')).rows;
      for(const e of all)assert.deepEqual(validateJsonSchema(definitions.get(e.event_name).schema,e.payload),[]);
      const inbox=new InboxService(pool);let failure=true,handled=0;
      const handler={name:'wp032-fixture',handle:async(tx,event)=>{if(event.source!=='agronomy')return;if(failure)throw Error('FIXTURE_RETRY');await tx.query('SELECT 1');handled++;}};
      const dispatcher=new OutboxDispatcherService(pool,[handler],inbox);await dispatcher.dispatchAvailable();failure=false;
      for(let n=0;n<20;n++){await pool.query("UPDATE platform_events.outbox_delivery SET next_attempt_at=clock_timestamp() WHERE source='agronomy' AND delivered_at IS NULL");await dispatcher.dispatchAvailable();if(Number((await pool.query("SELECT count(*) n FROM platform_events.outbox_delivery WHERE source='agronomy' AND delivered_at IS NULL")).rows[0].n)===0)break;}
      assert.equal(handled,all.length);await dispatcher.dispatchAvailable();assert.equal(handled,all.length);
    });
    await t.test('real HTTP typed contract, authenticated boundary and unchanged task ownership',async()=>{
      class FixtureModule{};
      Module({controllers:[AgronomyController],providers:[{provide:AgronomyService,useValue:Object.fromEntries(['create','read','list','history','resources','command','taskDraft'].map(name=>[name,service[name].bind(service)]))},{provide:IdentityService,useValue:{authenticate:async auth=>{if(auth!=='Bearer fixture-authorized')throw Error('FIXTURE_AUTH_DENIED');return {tenantId,userId:subjectId};}}}]})(FixtureModule);
      const app=await NestFactory.create(FixtureModule,{logger:false});await app.listen(0,'127.0.0.1');
      try{const url=await app.getUrl(),headers={authorization:'Bearer fixture-authorized','content-type':'application/json','idempotency-key':'http-template'};
        const response=await fetch(url+'/v1/agronomy/plans',{method:'POST',headers,body:JSON.stringify(create('TEMPLATE',{name:'HTTP fixture',operations:[]}))});assert.equal(response.status,200);const created=await response.json();
        const read=await fetch(url+'/v1/agronomy/plans/'+created.id,{headers});assert.equal(read.status,200);assert.deepEqual(await read.json(),created);
        const list=await fetch(url+'/v1/agronomy/plans?organizationId='+organizationId,{headers});assert.ok((await list.json()).items.some(r=>r.id===created.id));
        const history=await fetch(url+'/v1/agronomy/plans/'+created.id+'/history',{headers});assert.equal((await history.json()).revisions.length,1);
        const denied=await fetch(url+'/v1/agronomy/plans/'+created.id);assert.ok(denied.status>=400);
        const malformed=await fetch(url+'/v1/agronomy/plans',{method:'POST',headers:{...headers,'idempotency-key':'bad-body'},body:JSON.stringify({kind:'INVENTED'})});assert.equal(malformed.status,400);
      }finally{await app.close();}
    });
  } finally {
    if(pool)await pool.end();
    if(started)docker(['rm','--force',container]);
    await rm(temporaryDirectory,{recursive:true,force:true});
    if(previousMode===undefined)delete process.env.AGRO_DEPLOYMENT_MODE;else process.env.AGRO_DEPLOYMENT_MODE=previousMode;
  }
});
