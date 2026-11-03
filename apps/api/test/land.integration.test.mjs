import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { LandService } from '../dist/modules/land/land.service.js';
import { LandRegistry } from '../dist/modules/land/land.registry.js';
import { GisService } from '../dist/modules/gis/gis.service.js';
import { GisRegistry } from '../dist/modules/gis/gis.registry.js';
import { GisImportsService } from '../dist/modules/gis/gis-imports.service.js';
import { GisParser } from '../dist/modules/gis/gis.parser.js';
import { InboxService } from '../dist/modules/events/inbox.service.js';
import { OutboxDispatcherService } from '../dist/modules/events/outbox-dispatcher.service.js';
import { loadAndValidateContracts } from '../../../packages/contracts/scripts/lib/contracts.mjs';
const {Pool}=pg;
const repositoryRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const image=process.env.POSTGIS_TEST_IMAGE??'agroplatform/wp49-003-postgis:test';
function docker(args){return spawnSync('docker',args,{cwd:repositoryRoot,encoding:'utf8'});}
function assertCommand(result,action){assert.equal(result.status,0,`${action} failed\n${result.stdout}\n${result.stderr}`);}
test('LandPlot real PostGIS deterministic cadastral/geometry/rights/correction/atomic-delivery scenario',{timeout:900000},async(t)=>{
  const container = `agro-wp49-027-land-${process.pid}`;
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
    assert.match(migration.stdout, /migration 13 applied/);


    const tenantId=randomUUID(),otherTenant=randomUUID(),subjectId=randomUUID(),organizationId=randomUUID();
    const actor={tenantId,subjectId},other={tenantId:otherTenant,subjectId};
    await pool.query("INSERT INTO org.tenant(id,code,name,timezone,created_by) VALUES($1,'LAND-A','Fixture A','UTC',$3),($2,'LAND-B','Fixture B','UTC',$3)",[tenantId,otherTenant,subjectId]);
    await pool.query("INSERT INTO org.organization(id,tenant_id,code,name,organization_type,created_by) VALUES($1,$2,'LAND-ORG','Fixture org','FARM',$3)",[organizationId,tenantId,subjectId]);
    const registry=new LandRegistry(),gisRegistry=new GisRegistry();let allowed=true,gisAllowed=true;
    registry.installPolicy(async a=>allowed&&a.subjectId===subjectId&&[tenantId,otherTenant].includes(a.tenantId));
    gisRegistry.installPolicy(async a=>gisAllowed&&a.subjectId===subjectId&&[tenantId,otherTenant].includes(a.tenantId));
    const gis=new GisService(pool,gisRegistry),service=new LandService(pool,registry,gis);
    const ctx=(key=randomUUID())=>({idempotencyKey:key,correlationId:'wp027-fixed-demo',causationId:'wp027-command'});
    const source={source:'Fixture documentary source',profile:'fixture-profile',profileVersion:'1',capturedAt:'2026-11-03T00:00:00Z',sourceHash:'a'.repeat(64)};
    const snapshot=()=>({source:{...source},cadastralNumber:'fixture:001',declaredAreaHa:'12.3400',attributes:{originalLabel:'retained'},rights:[]});
    const shape={type:'Polygon',coordinates:[[[30,50],[30.01,50],[30.01,50.01],[30,50.01],[30,50]]]};
    const proposal=await gis.propose(actor,{expectedVersion:'0',geometry:shape,source:{type:'MANUAL',sourceCrs:'EPSG:4326',capturedAt:source.capturedAt},reason:'Fixture surveyed boundary'},ctx());
    let first,second;
    await t.test('create/replay current tenant/org/snapshot and explicit geometry link',async()=>{
      const input={organizationId,snapshot:{...snapshot(),geometryVersionId:proposal.versionId},reason:'Reviewed documentary source'};
      const results=await Promise.all([service.create(actor,input,ctx('create')),service.create(actor,input,ctx('create'))]);assert.deepEqual(results[0],results[1]);first=results[0];assert.equal(first.version,'1');
      const read=await service.read(actor,first.landPlotId);assert.equal(read.land_plot_id,first.landPlotId);assert.equal(read.organization_id,organizationId);assert.equal(read.status,'ACTIVE');assert.deepEqual(read.metadata,input.snapshot);assert.equal(read.geometry_provenance.id,proposal.versionId);assert.equal(read.geometry_provenance.source.sourceCrs,'EPSG:4326');
      assert.deepEqual(read.metadata.rights,[],'cadastre does not infer legal title');
      await assert.rejects(service.create(actor,{...input,reason:'Different intent'},ctx('create')),/IDEMPOTENCY/);
      await assert.rejects(service.create(actor,input,ctx()),/REFERENCE_CONFLICT/);
      await assert.rejects(service.read(other,first.landPlotId),/NOT_FOUND/);
      await assert.rejects(service.create(other,{organizationId,snapshot:{...snapshot(),cadastralNumber:'other-org'},reason:'Wrong organization tenant'},ctx()),/foreign key/i);
      await assert.rejects(service.create(actor,{...input,organizationId:randomUUID(),snapshot:{...snapshot(),cadastralNumber:'missing-org'}},ctx()),/foreign key/i);
    });
    await t.test('immutable corrections retain geometry, rights and captured provenance',async()=>{
      const revised=await gis.propose(actor,{geometryId:proposal.geometryId,expectedVersion:'1',geometry:{...shape,coordinates:shape.coordinates.map(r=>r.map(([x,y])=>[x+0.01,y]))},source:{type:'MANUAL',sourceCrs:'EPSG:4326',capturedAt:source.capturedAt},reason:'Fixture correction'},ctx());
      const rights=[{rightType:'LEASE',validFrom:'2026-01-01',validTo:'2026-12-31',source:{...source,source:'Fixture reviewed lease',sourceHash:'b'.repeat(64)}}];
      const correction={expectedVersion:'1',reason:'Correct surveyed reference and record documentary lease',snapshot:{...snapshot(),geometryVersionId:revised.versionId,rights}};
      second=await service.correct(actor,first.landPlotId,correction,ctx('correct'));assert.equal(second.version,'2');
      assert.deepEqual(await service.correct(actor,first.landPlotId,correction,ctx('correct')),second);
      const history=await service.history(actor,first.landPlotId);assert.equal(history.length,2);assert.equal(history[0].geometry_version_id,proposal.versionId);assert.equal(history[1].geometry_version_id,revised.versionId);assert.equal(history[1].previous_snapshot_id,first.snapshotId);assert.deepEqual(history[0].metadata.rights,[]);assert.deepEqual(history[1].metadata.rights,rights);
      assert.equal((await gis.history(actor,proposal.geometryId)).length,2);assert.equal((await gis.query(actor,[29,49,32,52],source.capturedAt)).features.length,0,'reference linkage does not approve or publish operational geometry');
      await assert.rejects(service.correct(actor,first.landPlotId,correction,ctx()),/version conflict/i);
      await assert.rejects(pool.query('UPDATE land.snapshot SET reason=$1 WHERE tenant_id=$2',['silent overwrite',tenantId]),/IMMUTABLE/);
      await assert.rejects(pool.query('DELETE FROM land.cadastral_reference WHERE tenant_id=$1',[tenantId]),/IMMUTABLE/);
      await assert.rejects(pool.query('TRUNCATE land.land_plot,land.snapshot,land.cadastral_reference,land.audit,land.outbox_event'),/IMMUTABLE/);
      const audit=(await pool.query('SELECT * FROM land.audit WHERE tenant_id=$1 ORDER BY recorded_at',[tenantId])).rows;assert.equal(audit.length,2);assert.equal(audit[1].before_value.geometryVersionId,proposal.versionId);assert.deepEqual(audit[1].after_value.metadata.rights,rights);
    });
    await t.test('concurrent stale commands yield exactly one correction',async()=>{
      const command={expectedVersion:'2',reason:'Concurrent documentary correction',snapshot:snapshot()};
      const settled=await Promise.allSettled([service.correct(actor,first.landPlotId,command,ctx()),service.correct(actor,first.landPlotId,command,ctx())]);assert.equal(settled.filter(r=>r.status==='fulfilled').length,1);assert.equal(settled.filter(r=>r.status==='rejected').length,1);assert.equal((await service.history(actor,first.landPlotId)).length,3);
    });
    await t.test('default/current/revoked permissions, cross-tenant versions, and Local authority',async()=>{
      const denied=new LandService(pool,new LandRegistry(),gis);await assert.rejects(denied.read(actor,first.landPlotId),/FORBIDDEN/);
      const input={snapshot:{...snapshot(),cadastralNumber:'fixture:denial'},reason:'Fixture denial'};
      await service.create(actor,input,ctx('revoke'));allowed=false;
      await assert.rejects(service.create(actor,input,ctx('revoke')),/FORBIDDEN/);await assert.rejects(service.history(actor,first.landPlotId),/FORBIDDEN/);allowed=true;
      gisAllowed=false;await assert.rejects(service.create(actor,{...input,snapshot:{...input.snapshot,geometryVersionId:proposal.versionId}},ctx()),/GIS_FORBIDDEN/);gisAllowed=true;
      await assert.rejects(service.create(other,{snapshot:{...snapshot(),geometryVersionId:proposal.versionId},reason:'Wrong tenant'},ctx()),/GIS_NOT_FOUND/);
      await assert.rejects(service.create(actor,{...input,snapshot:{...input.snapshot,geometryVersionId:'019a0000-0000-7000-8000-000000000000'}},ctx()),/GIS_NOT_FOUND/);
      const tx=await pool.connect();try{await assert.rejects(gis.versionInTransaction(tx,actor,proposal.versionId),/transaction block/i);}finally{tx.release();}
      process.env.AGRO_DEPLOYMENT_MODE='CLOUD_REPLICA';await assert.rejects(service.create(actor,input,ctx()),/LOCAL_PRIMARY/);process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
    });
    await t.test('GIS import candidate links preserve original hash/feature provenance through owner query',async()=>{
      // Memory adapters isolate this owner-link test. Existing GIS suite separately tests real MinIO/ClamAV.
      const objects=new Map();const storage={async putObject(key,stream){const b=[];for await(const c of stream)b.push(c);objects.set(key,Buffer.concat(b));},async removeObject(key){objects.delete(key);}};
      const imports=new GisImportsService(gis,new GisParser(),storage,{async scan(stream){for await(const _ of stream){}return 'CLEAN';}});
      const bytes=Buffer.from(JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',id:'land-fixture',properties:{label:'original'},geometry:shape}]}));
      const staged=await imports.stage(actor,{bytes,filename:'parcel.geojson',options:{format:'GeoJSON'}},ctx());assert.equal(staged.invalid,0);
      const commit=await imports.commit(actor,{batchId:staged.batchId,mode:'ALL_OR_NOTHING',reason:'Fixture source import'},ctx());const imported=commit.committed[0];
      const created=await service.create(actor,{snapshot:{...snapshot(),cadastralNumber:'fixture:import',geometryVersionId:imported.versionId,source:{...source,sourceHash:createHash('sha256').update(bytes).digest('hex')}},reason:'Reviewed imported parcel'},ctx());
      const read=await service.read(actor,created.landPlotId);assert.equal(read.geometry_provenance.source.importBatchId,staged.batchId);assert.equal(read.geometry_provenance.source.fileSha256,read.metadata.source.sourceHash);assert.equal(read.geometry_provenance.source.type,'IMPORT');assert.deepEqual([...objects.values()][0],bytes);
    });
    await t.test('snapshot/audit/outbox failures roll back head, claims, receipt and all effects',async()=>{
      await pool.query("CREATE FUNCTION land.fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$");
      for(const table of ['snapshot','audit','outbox_event']){
        const counts=async()=>(await pool.query(`SELECT (SELECT count(*) FROM land.land_plot) AS heads,(SELECT count(*) FROM land.snapshot) AS snapshots,(SELECT count(*) FROM land.cadastral_reference) AS refs,(SELECT count(*) FROM land.audit) AS audits,(SELECT count(*) FROM land.outbox_event) AS events,(SELECT count(*) FROM land.command_idempotency) AS receipts`)).rows[0];const before=await counts();
        await pool.query(`CREATE TRIGGER fixture_failure BEFORE INSERT ON land.${table} FOR EACH ROW EXECUTE FUNCTION land.fixture_fail()`);
        const input={snapshot:{...snapshot(),cadastralNumber:`fixture:${table}`},reason:'Rollback fixture'};const key=ctx(`rollback-${table}`);
        await assert.rejects(service.create(actor,input,key),/fixture failure/);assert.deepEqual(await counts(),before);
        await pool.query(`DROP TRIGGER fixture_failure ON land.${table}`);await service.create(actor,input,key);
      }
    });
    await t.test('catalog event delivery uses real dispatcher/inbox retry and one-effect replay',async()=>{
      const catalog=await loadAndValidateContracts();assert.ok(catalog.events.events.some(e=>e.name==='land.plot.changed'));
      const events=(await pool.query('SELECT * FROM land.outbox_event WHERE tenant_id=$1',[tenantId])).rows;
      assert.equal(events.length,Number((await pool.query('SELECT count(*) AS n FROM land.snapshot WHERE tenant_id=$1',[tenantId])).rows[0].n));
      for(const event of events){assert.equal(event.payload.entityType,'LandPlot');assert.deepEqual(Object.keys(event.payload).sort(),['eventId','entityId','entityType','tenantId','actorId','correlationId','causationId','occurredAt','revision'].sort());}
      await pool.query('CREATE TABLE land.fixture_delivery(id uuid PRIMARY KEY)');let fail=true;
      const inbox=new InboxService(pool),dispatcher=new OutboxDispatcherService(pool,[{name:'wp027-fixture',async handle(tx,event){if(event.source!=='land')return;if(fail)throw Error('fixture delivery failure');await tx.query('INSERT INTO land.fixture_delivery(id) VALUES($1)',[event.id]);}}],inbox);
      await dispatcher.dispatchAvailable(1000);assert.equal((await pool.query('SELECT count(*)::int AS n FROM land.fixture_delivery')).rows[0].n,0);fail=false;
      await pool.query("UPDATE platform_events.outbox_delivery SET next_attempt_at=clock_timestamp() WHERE source='land'");await dispatcher.dispatchAvailable(1000);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM land.fixture_delivery')).rows[0].n,events.length);
      await pool.query("UPDATE platform_events.outbox_delivery SET delivered_at=NULL,next_attempt_at=clock_timestamp() WHERE source='land'");await dispatcher.dispatchAvailable(1000);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM land.fixture_delivery')).rows[0].n,events.length);
    });
  }finally{
    if(pool)await pool.end();if(started)docker(['stop',container]);await rm(temporaryDirectory,{recursive:true,force:true});
    if(previousMode===undefined)delete process.env.AGRO_DEPLOYMENT_MODE;else process.env.AGRO_DEPLOYMENT_MODE=previousMode;
  }
});
