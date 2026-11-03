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
test('Field/FieldSeason real PostGIS deterministic identity/allocation/lineage/atomic-delivery scenario',{timeout:900000},async(t)=>{
  const container = `agro-wp49-028-farm-${process.pid}`;
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
    assert.match(migration.stdout, /migration 14 applied/);


    const tenantId=randomUUID(),otherTenant=randomUUID(),subjectId=randomUUID(),organizationId=randomUUID();
    const actor={tenantId,subjectId},other={tenantId:otherTenant,subjectId};
    await pool.query("INSERT INTO org.tenant(id,code,name,timezone,created_by) VALUES($1,'FARM-A','Fixture A','UTC',$3),($2,'FARM-B','Fixture B','UTC',$3)",[tenantId,otherTenant,subjectId]);
    await pool.query("INSERT INTO org.organization(id,tenant_id,code,name,organization_type,created_by) VALUES($1,$2,'FARM-ORG','Fixture org','FARM',$3)",[organizationId,tenantId,subjectId]);
    const registry=new FarmRegistry(),landRegistry=new LandRegistry(),gisRegistry=new GisRegistry();let allowed=true,landAllowed=true,gisAllowed=true;
    registry.installPolicy(async a=>allowed&&a.subjectId===subjectId);landRegistry.installPolicy(async()=>landAllowed);gisRegistry.installPolicy(async()=>gisAllowed);
    const gis=new GisService(pool,gisRegistry),land=new LandService(pool,landRegistry,gis),service=new FarmService(pool,registry,land,gis);
    const ctx=(key=randomUUID())=>({idempotencyKey:key,correlationId:'wp028-fixed-demo',causationId:'wp028-command'});
    const at='2026-11-03T00:00:00Z',later='2026-11-04T00:00:00Z';
    const source={source:'Fixture documentary source',profile:'fixture',profileVersion:'1',capturedAt:at,sourceHash:'a'.repeat(64)};
    const parcels=[];for(let n=0;n<3;n++)parcels.push(await land.create(actor,{organizationId,snapshot:{source,cadastralNumber:`fixture:${n}`,attributes:{},rights:[]},reason:'Reviewed fixture'},ctx()));
    const shape={type:'Polygon',coordinates:[[[30,50],[30.01,50],[30.01,50.01],[30,50.01],[30,50]]]};
    const proposal=await gis.propose(actor,{expectedVersion:'0',geometry:shape,source:{type:'MANUAL',sourceCrs:'EPSG:4326',capturedAt:at},reason:'Fixture boundary'},ctx());
    const data=(name='Fixture field')=>({name,nominalAreaHa:'12.3400',status:'ACTIVE',allocations:[]});
    const field=(code,d=data(),effectiveAt=at)=>({organizationId,code,data:d,effectiveAt,reason:'Reviewed fixture field'});
    const seasonInput={organizationId,data:{name:'Fixture noncalendar season',year:2027,startDate:'2026-09-01',endDate:'2027-08-31',status:'PLANNED'},effectiveAt:at,reason:'Explicit fixture season'};
    let first,season,fs;
    await t.test('distinct identities, approved geometry and explicit N:M allocation provenance',async()=>{
      await assert.rejects(service.createField(actor,field('unapproved',{...data(),geometryVersionId:proposal.versionId}),ctx()),/APPROVED/);
      await gis.decide(actor,{geometryId:proposal.geometryId,versionId:proposal.versionId,expectedVersion:'1',decision:'APPROVED',effectiveAt:at,reason:'Reviewed fixture approval'},ctx());
      const allocations=parcels.map(p=>({landPlotId:p.landPlotId,validFrom:at,source:'Fixture review',reason:'Explicit parcel allocation',areaHa:'1.0000'}));
      const input=field('F-1',{...data(),geometryVersionId:proposal.versionId,allocations});
      const key=ctx('field-create'),r=await Promise.all([service.createField(actor,input,key),service.createField(actor,input,key)]);assert.deepEqual(r[0],r[1]);first=r[0];
      const read=await service.read(actor,first.entityId);assert.equal(read.kind,'FIELD');assert.equal(read.metadata.allocations.length,3);assert.equal(read.geometry_provenance.id,proposal.versionId);
      assert.ok(!parcels.some(p=>p.landPlotId===first.entityId));assert.equal((await land.history(actor,parcels[0].landPlotId)).length,1);
      await service.createField(actor,field('F-shared',{...data(),allocations:[{...allocations[0],areaHa:'0.5000',validTo:later}]}),ctx());
      await assert.rejects(service.createField(actor,field('F-1'),ctx()),/unique/i);
      await assert.rejects(service.createField(actor,field('changed'),key),/IDEMPOTENCY/);
    });
    await t.test('explicit registered noncalendar season, separate FieldSeason and year uniqueness',async()=>{
      season=await service.createSeason(actor,seasonInput,ctx());
      const input={fieldId:first.entityId,seasonId:season.entityId,data:{plannedAreaHa:'10',status:'PLANNED',notes:'Fixture'},effectiveAt:at,reason:'Fixture seasonal context'};
      fs=await service.createFieldSeason(actor,input,ctx('fs'));
      assert.notEqual(fs.entityId,first.entityId);assert.notEqual(fs.entityId,season.entityId);
      const read=await service.read(actor,fs.entityId);assert.equal(read.field_id,first.entityId);assert.equal(read.season_id,season.entityId);assert.equal(read.business_year,2027);
      await assert.rejects(service.createFieldSeason(actor,input,ctx()),/unique/i);
      const sameYear=await service.createSeason(actor,{...seasonInput,data:{...seasonInput.data,name:'Another fixture same year'}},ctx());
      await assert.rejects(service.createFieldSeason(actor,{...input,seasonId:sameYear.entityId},ctx()),/unique/i);
      await service.correctFieldSeason(actor,fs.entityId,{expectedVersion:'1',data:{...input.data,plannedAreaHa:'11'},effectiveAt:later,reason:'Correct fixture area'},ctx());
      assert.equal((await service.read(actor,first.entityId)).row_version,'1');assert.equal((await service.history(actor,fs.entityId)).length,2);
      const invalid={...seasonInput,data:{...seasonInput.data,endDate:'2026-08-01'}};await assert.rejects(service.createSeason(actor,invalid,ctx()),/DATE/);
    });
    await t.test('corrections preserve geometry references and effective history; optimistic concurrency',async()=>{
      const p=await gis.propose(actor,{geometryId:proposal.geometryId,expectedVersion:'2',geometry:shape,source:{type:'MANUAL',sourceCrs:'EPSG:4326',capturedAt:later},reason:'Fixture revised survey'},ctx());
      await gis.decide(actor,{geometryId:p.geometryId,versionId:p.versionId,expectedVersion:'3',decision:'APPROVED',effectiveAt:later,reason:'Reviewed revised survey'},ctx());
      await assert.rejects(service.createField(actor,field('superseded-boundary',{...data(),geometryVersionId:proposal.versionId},later),ctx()),/APPROVED/);
      const c={expectedVersion:'1',data:{...data(),geometryVersionId:p.versionId},effectiveAt:later,reason:'Correct boundary reference'};
      const r=await Promise.allSettled([service.correctField(actor,first.entityId,c,ctx()),service.correctField(actor,first.entityId,c,ctx())]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
      assert.equal((await service.read(actor,first.entityId,at)).geometry_provenance.id,proposal.versionId);assert.equal((await service.read(actor,first.entityId,later)).geometry_provenance.id,p.versionId);
      assert.equal((await service.history(actor,first.entityId)).length,2);assert.equal((await service.read(actor,fs.entityId)).row_version,'2');assert.equal((await service.read(actor,fs.entityId)).field_geometry_provenance.id,proposal.versionId);
      await assert.rejects(service.correctField(actor,first.entityId,c,ctx()),/version conflict/i);
      await assert.rejects(pool.query('UPDATE farm.revision SET reason=$1 WHERE tenant_id=$2',['silent',tenantId]),/IMMUTABLE/);
    });
    await t.test('tenant/org/site/current/default/revoked/owner permissions and Local authority',async()=>{
      await assert.rejects(service.read(other,first.entityId),/NOT_FOUND/);
      await assert.rejects(service.createField(other,field('wrong-org'),ctx()),/foreign key/i);
      await assert.rejects(service.createField(other,field('foreign-parcel',{...data(),allocations:[{landPlotId:parcels[0].landPlotId,validFrom:at,source:'Fixture',reason:'Foreign fixture'}]}),ctx()),/LAND_NOT_FOUND/);
      const mutableActor={...actor},mutableInput=field('immutable-input');const pending=service.createField(mutableActor,mutableInput,ctx());mutableActor.tenantId=otherTenant;mutableInput.code='tampered';mutableInput.data.name='tampered';
      const bound=await pending;assert.equal((await service.read(actor,bound.entityId)).code,'immutable-input');assert.equal((await service.read(actor,bound.entityId)).metadata.name,'Fixture field');await assert.rejects(service.read(other,bound.entityId),/NOT_FOUND/);
      await assert.rejects(service.createField(actor,field('wrong-site',{...data(),siteId:randomUUID()}),ctx()),/foreign key/i);
      const denied=new FarmService(pool,new FarmRegistry(),land,gis);await assert.rejects(denied.read(actor,first.entityId),/FORBIDDEN/);
      const input=field('revoke');await service.createField(actor,input,ctx('revoke'));allowed=false;await assert.rejects(service.createField(actor,input,ctx('revoke')),/FORBIDDEN/);allowed=true;
      landAllowed=false;await assert.rejects(service.createField(actor,field('parcel-denied',{...data(),allocations:[{landPlotId:parcels[0].landPlotId,validFrom:at,source:'Fixture',reason:'Fixture'}]}),ctx()),/LAND_FORBIDDEN/);landAllowed=true;
      gisAllowed=false;await assert.rejects(service.createField(actor,field('geometry-denied',{...data(),geometryVersionId:proposal.versionId}),ctx()),/GIS_FORBIDDEN/);gisAllowed=true;
      await assert.rejects(service.createField(other,{...field('foreign-geometry',{...data(),geometryVersionId:proposal.versionId}),organizationId:randomUUID()},ctx()),/GIS_NOT_FOUND/);
      const tx=await pool.connect();try{await assert.rejects(land.referenceInTransaction(tx,actor,parcels[0].landPlotId),/transaction block/i);}finally{tx.release();}
      process.env.AGRO_DEPLOYMENT_MODE='CLOUD_REPLICA';await assert.rejects(service.createField(actor,field('cloud'),ctx()),/LOCAL_PRIMARY/);process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
    });
    await t.test('atomic split then merge forms historical DAG; no transfer of seasonal facts',async()=>{
      const split=await service.split(actor,{sources:[{fieldId:first.entityId,expectedVersion:'2'}],targets:[field('split-a',data(),'2026-11-05T00:00:00Z'),field('split-b',data(),'2026-11-05T00:00:00Z')],effectiveAt:'2026-11-05T00:00:00Z',reason:'Fixture split'},ctx('split'));
      assert.equal(split.targets.length,2);assert.equal((await service.read(actor,first.entityId)).metadata.status,'ARCHIVED');assert.equal((await service.read(actor,fs.entityId)).row_version,'2');assert.equal((await service.read(actor,fs.entityId)).field_geometry_provenance.id,proposal.versionId);
      const merge=await service.merge(actor,{sources:split.targets.map(x=>({fieldId:x.entityId,expectedVersion:'1'})),targets:[field('merged',data(),'2026-11-06T00:00:00Z')],effectiveAt:'2026-11-06T00:00:00Z',reason:'Fixture merge'},ctx('merge'));
      const edges=await service.lineage(actor,first.entityId);assert.equal(edges.length,4);assert.ok(edges.every(e=>e.reason&&e.actor_id===subjectId));assert.equal((await service.read(actor,merge.targets[0].entityId)).metadata.allocations.length,0);
      await assert.rejects(service.split(actor,{sources:[{fieldId:first.entityId,expectedVersion:'3'}],targets:[field('again-a'),field('again-b')],effectiveAt:later,reason:'Invalid repeat'},ctx()),/ARCHIVED/);
      const edge=(await pool.query('SELECT * FROM farm.lineage LIMIT 1')).rows[0];
      await assert.rejects(pool.query('INSERT INTO farm.lineage(tenant_id,from_field_id,to_field_id,operation,effective_at,actor_id,reason,correlation_id,causation_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[tenantId,merge.targets[0].entityId,first.entityId,'MERGE','2026-11-07T00:00:00Z',subjectId,'Cycle fixture','c','c','c']),/CYCLE/);
      await assert.rejects(pool.query('DELETE FROM farm.lineage WHERE tenant_id=$1',[tenantId]),/IMMUTABLE/);
      assert.ok(edge);
    });
    await t.test('revision/audit/outbox/lineage failures roll back all entity, receipt and history effects',async()=>{
      await pool.query("CREATE FUNCTION farm.fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$");
      const counts=async()=>(await pool.query(`SELECT (SELECT count(*) FROM farm.entity) AS heads,(SELECT count(*) FROM farm.revision) AS revisions,(SELECT count(*) FROM farm.allocation) AS allocations,(SELECT count(*) FROM farm.lineage) AS edges,(SELECT count(*) FROM farm.audit) AS audits,(SELECT count(*) FROM farm.outbox_event) AS events,(SELECT count(*) FROM farm.command_idempotency) AS receipts`)).rows[0];
      for(const table of ['revision','audit','outbox_event','lineage']){
        const sourceField=await service.createField(actor,field('rollback-source-'+table),ctx());const before=await counts();
        await pool.query(`CREATE TRIGGER fixture_failure BEFORE INSERT ON farm.${table} FOR EACH ROW EXECUTE FUNCTION farm.fixture_fail()`);
        const input={sources:[{fieldId:sourceField.entityId,expectedVersion:'1'}],targets:[field('rollback-a-'+table,data(),later),field('rollback-b-'+table,data(),later)],effectiveAt:later,reason:'Rollback fixture'};const key=ctx('rollback-'+table);
        await assert.rejects(service.split(actor,input,key),/fixture failure/);assert.deepEqual(await counts(),before);assert.equal((await service.read(actor,sourceField.entityId)).metadata.status,'ACTIVE');
        await pool.query(`DROP TRIGGER fixture_failure ON farm.${table}`);await service.split(actor,input,key);
      }
    });
    await t.test('real dispatcher/inbox retry/replay and one outbox event per revision',async()=>{
      const events=(await pool.query('SELECT * FROM farm.outbox_event WHERE tenant_id=$1',[tenantId])).rows;
      assert.equal(events.length,Number((await pool.query('SELECT count(*) AS n FROM farm.revision WHERE tenant_id=$1',[tenantId])).rows[0].n));
      for(const e of events){assert.equal(e.event_version,'1.0.0');assert.ok(['Field','AgriculturalSeason','FieldSeason'].includes(e.payload.entityType));assert.deepEqual(Object.keys(e.payload).sort(),['eventId','entityId','entityType','tenantId','actorId','correlationId','causationId','occurredAt','revision'].sort());}
      const catalog=await loadAndValidateContracts();assert.ok(catalog.events.events.some(e=>e.name==='farm.entity.changed'));
      await pool.query('CREATE TABLE farm.fixture_delivery(id uuid PRIMARY KEY)');let fail=true;
      const inbox=new InboxService(pool),dispatcher=new OutboxDispatcherService(pool,[{name:'wp028-fixture',async handle(tx,event){if(event.source!=='farm')return;if(fail)throw Error('fixture delivery failure');await tx.query('INSERT INTO farm.fixture_delivery(id) VALUES($1)',[event.id]);}}],inbox);
      await dispatcher.dispatchAvailable(1000);assert.equal((await pool.query('SELECT count(*)::int AS n FROM farm.fixture_delivery')).rows[0].n,0);fail=false;
      await pool.query("UPDATE platform_events.outbox_delivery SET next_attempt_at=clock_timestamp() WHERE source='farm'");await dispatcher.dispatchAvailable(1000);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM farm.fixture_delivery')).rows[0].n,events.length);
      await pool.query("UPDATE platform_events.outbox_delivery SET delivered_at=NULL,next_attempt_at=clock_timestamp() WHERE source='farm'");await dispatcher.dispatchAvailable(1000);assert.equal((await pool.query('SELECT count(*)::int AS n FROM farm.fixture_delivery')).rows[0].n,events.length);
    });
  }finally{
    if(pool)await pool.end();if(started)docker(['stop',container]);await rm(temporaryDirectory,{recursive:true,force:true});
    if(previousMode===undefined)delete process.env.AGRO_DEPLOYMENT_MODE;else process.env.AGRO_DEPLOYMENT_MODE=previousMode;
  }
});
