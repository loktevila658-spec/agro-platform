import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';

import { InboxService } from '../dist/modules/events/inbox.service.js';
import { OutboxDispatcherService } from '../dist/modules/events/outbox-dispatcher.service.js';

const { Pool } = pg;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const image = process.env.POSTGIS_TEST_IMAGE ?? 'agroplatform/wp49-003-postgis:test';

function docker(args) {
  return spawnSync('docker', args, { cwd: repositoryRoot, encoding: 'utf8' });
}

function assertCommand(result, action) {
  assert.equal(result.status, 0, `${action} failed\n${result.stdout}\n${result.stderr}`);
}

import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {Client}=require('minio');
const {MinioObjectStorage}=require('../../../packages/storage/src/index.cjs');
import { ClamAvScanner } from '../dist/modules/files/clamav-scanner.js';
import { GisRegistry } from '../dist/modules/gis/gis.registry.js';
import { GisService } from '../dist/modules/gis/gis.service.js';
import { GisImportsService } from '../dist/modules/gis/gis-imports.service.js';
import { GisParser } from '../dist/modules/gis/gis.parser.js';
import { uuidv7 } from '../dist/modules/gis/gis.validation.js';
import { loadAndValidateContracts } from '../../../packages/contracts/scripts/lib/contracts.mjs';
test('GIS foundation real PostGIS/storage/import/version/security deterministic scenario',{timeout:900000},async(t)=>{
  const container = `agro-wp49-026-gis-${process.pid}`;
  const password = 'wp49_026_ephemeral_test_only';
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'agro-gis-integration-'));
  const psqlWrapper = join(temporaryDirectory, 'psql');
  let pool;
  const previousMode=process.env.AGRO_DEPLOYMENT_MODE;
  process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
  let started = false;
  const auxiliary=[];
  const previousScanner=process.env.FILES_CLAMD_ENDPOINT;

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
    assert.match(migration.stdout, /migration 12 applied/);


    const tenantId=randomUUID(),otherTenant=randomUUID(),subjectId=randomUUID();
    const actor={tenantId,subjectId},other={tenantId:otherTenant,subjectId};
    await pool.query("INSERT INTO org.tenant(id,code,name,timezone,created_by) VALUES($1,'GIS-A','Fixture A','UTC',$3),($2,'GIS-B','Fixture B','UTC',$3)",[tenantId,otherTenant,subjectId]);
    const registry=new GisRegistry();let allowed=true,approve=true;
    registry.installPolicy(async(a,action)=>allowed&&a.subjectId===subjectId&&[tenantId,otherTenant].includes(a.tenantId)&&(action!=='gis.approve'||approve));
    const service=new GisService(pool,registry),ctx=(key=randomUUID())=>({idempotencyKey:key,correlationId:'wp026-fixed-demo',causationId:'wp026-command'});
    const shape=(dx=0)=>({type:'Polygon',coordinates:[[[30+dx,50],[30.01+dx,50],[30.01+dx,50.01],[30+dx,50.01],[30+dx,50]]]});
    const proposal=(g=shape())=>({expectedVersion:'0',geometry:g,source:{type:'MANUAL',sourceCrs:'EPSG:4326',capturedAt:'2026-11-02T00:00:00Z'},reason:'Fixture geometry'});
    let first,approved;
    await t.test('proposals, approvals, geography, replay and tenant isolation',async()=>{
      const key=ctx('propose');const results=await Promise.all([service.propose(actor,proposal(),key),service.propose(actor,proposal(),key)]);assert.deepEqual(results[0],results[1]);first=results[0];
      assert.equal(first.headVersion,'1');assert.match(first.geometryId,/-7/);
      assert.equal((await service.query(actor,[29,49,32,52],'2026-11-02T00:00:00Z')).features.length,0);
      await assert.rejects(service.propose(actor,proposal(shape(1)),key),/IDEMPOTENCY/);
      approved=await service.decide(actor,{geometryId:first.geometryId,versionId:first.versionId,expectedVersion:'1',decision:'APPROVED',effectiveAt:'2026-11-02T00:00:00Z',reason:'Fixture publication'},ctx('approve'));
      assert.equal(approved.headVersion,'2');
      const read=await service.query(actor,[29,49,32,52],'2026-11-02T00:00:00Z');assert.equal(read.features.length,1);assert.equal(read.features[0].id,first.versionId);
      const area=read.features[0].properties.areaHa;assert.ok(area>79&&area<81,`Geography expected ~79.7ha, got ${area}`);
      assert.equal((await service.query(other,[29,49,32,52],'2026-11-02T00:00:00Z')).features.length,0);
      assert.deepEqual(await service.history(other,first.geometryId),[]);
      await assert.rejects(service.decide(other,{geometryId:first.geometryId,versionId:first.versionId,expectedVersion:'2',decision:'REJECTED',reason:'Wrong tenant'},ctx()),/NOT_FOUND/);
    });
    await t.test('immutable corrections, concurrent version guards and effective history',async()=>{
      const change={...proposal(shape(1)),geometryId:first.geometryId,expectedVersion:'2',reason:'Correction retains old geometry'};
      const race=await Promise.allSettled([service.propose(actor,change,ctx()),service.propose(actor,{...change,geometry:shape(2)},ctx())]);
      assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.match(race.find(r=>r.status==='rejected').reason.message,/version|VERSION/);
      const second=race.find(r=>r.status==='fulfilled').value;
      await assert.rejects(service.decide(actor,{geometryId:first.geometryId,versionId:second.versionId,expectedVersion:'2',decision:'APPROVED',effectiveAt:'2026-11-03T00:00:00Z',reason:'Stale'},ctx()),/version|VERSION/);
      await service.decide(actor,{geometryId:first.geometryId,versionId:second.versionId,expectedVersion:'3',decision:'APPROVED',effectiveAt:'2026-11-03T00:00:00Z',reason:'Corrected boundary'},ctx());
      const old=await service.query(actor,[29,49,34,52],'2026-11-02T00:00:00Z'),current=await service.query(actor,[29,49,34,52],'2026-11-03T00:00:00Z');
      assert.equal(old.features[0].id,first.versionId);assert.equal(current.features[0].id,second.versionId);
      assert.equal((await service.history(actor,first.geometryId)).length,2);
      for(const sql of ['UPDATE gis.geometry_version SET reason=reason','DELETE FROM gis.geometry_decision','TRUNCATE gis.audit','DELETE FROM gis.geometry_head'])await assert.rejects(pool.query(sql),/IMMUTABLE/);
      await assert.rejects(service.propose(actor,{...proposal(),reason:''},ctx()),/REASON/);
      const invalid={type:'Polygon',coordinates:[[[30,50],[31,51],[30,51],[31,50],[30,50]]]};
      await assert.rejects(service.propose(actor,proposal(invalid),ctx()),/INVALID_GEOMETRY/);
      const cut={type:'MultiPolygon',coordinates:[[[[179,0],[180,0],[180,1],[179,1],[179,0]]],[[[-180,0],[-179,0],[-179,1],[-180,1],[-180,0]]]]};
      const dateline=await service.propose(actor,proposal(cut),ctx());
      await service.decide(actor,{geometryId:dateline.geometryId,versionId:dateline.versionId,expectedVersion:'1',decision:'APPROVED',effectiveAt:'2026-11-02T00:00:00Z',reason:'RFC7946 cut geometry'},ctx());
      assert.equal((await service.query(actor,[178,-1,-178,2],'2026-11-02T00:00:00Z')).features[0].id,dateline.versionId);
      const rejected=await service.propose(actor,proposal(shape(3)),ctx());
      approve=false;await assert.rejects(service.decide(actor,{geometryId:rejected.geometryId,versionId:rejected.versionId,expectedVersion:'1',decision:'APPROVED',effectiveAt:'2026-11-02T00:00:00Z',reason:'Forbidden'},ctx()),/FORBIDDEN/);approve=true;
      await service.decide(actor,{geometryId:rejected.geometryId,versionId:rejected.versionId,expectedVersion:'1',decision:'REJECTED',reason:'Fixture rejection'},ctx());
      assert.equal((await service.history(actor,rejected.geometryId))[0].status,'REJECTED');
    });
    await t.test('atomic audit/outbox rollback, revoked replay and cloud rejection',async()=>{
      await pool.query("CREATE FUNCTION gis.fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$");
      for(const table of ['audit','outbox_event']){
        const count=(await pool.query('SELECT count(*)::int AS n FROM gis.geometry_version')).rows[0].n;
        await pool.query(`CREATE TRIGGER fixture_fail BEFORE INSERT ON gis.${table} FOR EACH ROW EXECUTE FUNCTION gis.fixture_fail()`);
        await assert.rejects(service.propose(actor,proposal(),ctx('rollback-'+table)),/fixture failure/);
        await pool.query(`DROP TRIGGER fixture_fail ON gis.${table}`);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM gis.geometry_version')).rows[0].n,count);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM gis.command_idempotency WHERE idempotency_key=$1',['rollback-'+table])).rows[0].n,0);
      }
      const denied=new GisService(pool,new GisRegistry());await assert.rejects(denied.history(actor,first.geometryId),/FORBIDDEN/);
      allowed=false;await assert.rejects(service.propose(actor,proposal(),ctx('propose')),/FORBIDDEN/);allowed=true;
      process.env.AGRO_DEPLOYMENT_MODE='CLOUD';await assert.rejects(service.propose(actor,proposal(),ctx()),/LOCAL_PRIMARY/);process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
      const tx=await pool.connect();try{await assert.rejects(service.proposeInTransaction(tx,actor,proposal(),ctx()),/transaction|SAVEPOINT/);}finally{tx.release();}
    });
    await t.test('real MinIO and ClamAV source staging, dry run, explicit commit modes and owner atomicity',async()=>{
      const minio=`gis-minio-${process.pid}`,clam=`gis-clam-${process.pid}`,user='gis-fixture',secret='gis_fixture_ephemeral_password';
      const minioImage=process.env.MINIO_TEST_IMAGE??'netiedge/minio@sha256:e6c282005f6c8496256f8fd07e9a8b82073344c217ea87436d9af888db67eb0e';
      const clamImage=process.env.CLAMAV_TEST_IMAGE??'clamav/clamav:1.4.6-debian13-slim';
      for(const [name,args] of [[minio,['--publish','127.0.0.1::9000','--env',`MINIO_ROOT_USER=${user}`,'--env',`MINIO_ROOT_PASSWORD=${secret}`,minioImage,'server','/data','--address',':9000']],[clam,['--publish','127.0.0.1::3310',clamImage]]]){
        assertCommand(docker(['run','--detach','--rm','--name',name,...args]),'Auxiliary start');auxiliary.push(name);
      }
      const portFor=(name,port)=>{const r=docker(['inspect','--format',`{{(index (index .NetworkSettings.Ports "${port}/tcp") 0).HostPort}}`,name]);assertCommand(r,'Port lookup');return Number(r.stdout.trim());};
      const s3=portFor(minio,9000),clamPort=portFor(clam,3310);process.env.FILES_CLAMD_ENDPOINT=`tcp://127.0.0.1:${clamPort}`;
      const storage=new MinioObjectStorage(new Client({endPoint:'127.0.0.1',port:s3,useSSL:false,accessKey:user,secretKey:secret}),'gis-fixture');
      let ready=false;for(let i=0;i<360;i++){try{await storage.ensureBucket();if(docker(['exec',clam,'sh','-c','printf "PING\\n" | nc -w 2 127.0.0.1 3310 | grep -q PONG']).status===0){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.equal(ready,true);
      const imports=new GisImportsService(service,new GisParser(),storage,new ClamAvScanner());
      const bytes=Buffer.from(JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',properties:{name:'Fixture source'},geometry:shape()},{type:'Feature',properties:{name:'Invalid'},geometry:{type:'Point',coordinates:[30,50]}}]}));
      const input={bytes,filename:'fixture.geojson',options:{format:'GeoJSON',mapping:{label:'name'}}};
      const count=(await pool.query('SELECT count(*)::int AS n FROM gis.geometry_version')).rows[0].n;
      const staged=await imports.stage(actor,input,ctx('stage'));assert.equal(staged.count,2);assert.equal(staged.invalid,1);
      assert.deepEqual(await imports.stage(actor,input,ctx('stage')),staged);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM gis.geometry_version')).rows[0].n,count,'dry-run adds no canonical geometry');
      const preview=await imports.preview(actor,staged.batchId);assert.equal(preview.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(preview.features[0].mapped_properties.label,'Fixture source');assert.ok(preview.features[1].issues.length);
      await assert.rejects(imports.preview(other,staged.batchId),/NOT_FOUND/);
      await assert.rejects(imports.commit(actor,{batchId:staged.batchId,mode:'ALL_OR_NOTHING',reason:'All features required'},ctx()),/HAS_ERRORS/);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM gis.geometry_version')).rows[0].n,count);
      await pool.query('CREATE TRIGGER fixture_fail BEFORE INSERT ON gis.outbox_event FOR EACH ROW EXECUTE FUNCTION gis.fixture_fail()');
      await assert.rejects(imports.commit(actor,{batchId:staged.batchId,mode:'VALID_ONLY',reason:'Fixture import'},ctx('commit-rollback')),/fixture failure/);
      await pool.query('DROP TRIGGER fixture_fail ON gis.outbox_event');
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM gis.geometry_version')).rows[0].n,count);
      const command={batchId:staged.batchId,mode:'VALID_ONLY',reason:'Fixture import'};
      const result=await imports.commit(actor,command,ctx('commit'));assert.equal(result.committed.length,1);assert.equal(result.skipped,1);
      assert.deepEqual(await imports.commit(actor,command,ctx('commit')),result);
      await assert.rejects(imports.commit(actor,command,ctx()),/ALREADY_COMMITTED/);
      const history=await service.history(actor,result.committed[0].geometryId);assert.equal(history[0].source.fileSha256,preview.sha256);assert.equal(history[0].source.importBatchId,staged.batchId);assert.equal(history[0].status,'PROPOSED','import remains a proposal');
      const key=(await pool.query('SELECT object_key FROM gis.import_batch WHERE id=$1',[staged.batchId])).rows[0].object_key;
      const chunks=[];for await(const b of await storage.getObject(key))chunks.push(b);assert.deepEqual(Buffer.concat(chunks),bytes);
      const preciseShape={type:'Polygon',coordinates:[[[1e-20,0],[0.01,0],[0.01,0.01],[1e-20,0.01],[1e-20,0]]]};
      const validBytes=Buffer.from(JSON.stringify({type:'FeatureCollection',features:[0,1].map(dx=>({type:'Feature',properties:{name:'Fixture valid '+dx},geometry:dx===0?preciseShape:shape(dx)}))}));
      const all=await imports.stage(actor,{...input,bytes:validBytes},ctx());
      const prior=(await pool.query('SELECT count(*)::int AS n FROM gis.geometry_version')).rows[0].n;
      await pool.query(`CREATE FUNCTION gis.fixture_batch_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='IMPORT_COMMITTED' THEN RAISE EXCEPTION 'fixture batch final audit failure'; END IF;RETURN NEW;END $$; CREATE TRIGGER fixture_batch_fail BEFORE INSERT ON gis.audit FOR EACH ROW EXECUTE FUNCTION gis.fixture_batch_fail()`);
      await assert.rejects(imports.commit(actor,{batchId:all.batchId,mode:'ALL_OR_NOTHING',reason:'Fixture all'},ctx()),/batch final audit failure/);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM gis.geometry_version')).rows[0].n,prior,'both valid owner effects roll back with final batch audit');
      await pool.query('DROP TRIGGER fixture_batch_fail ON gis.audit');
      const accepted=await imports.commit(actor,{batchId:all.batchId,mode:'ALL_OR_NOTHING',reason:'Fixture all'},ctx());assert.equal(accepted.committed.length,2);assert.equal(accepted.skipped,0);
      const exactX=(await pool.query('SELECT ST_X(ST_PointN(ST_ExteriorRing(ST_GeometryN(geometry,1)),1)) AS x FROM gis.geometry_version WHERE id=$1',[accepted.committed[0].versionId])).rows[0].x;assert.equal(exactX,1e-20,'owner commit must not re-import a rounded render representation');
      assert.ok((await imports.preview(actor,all.batchId)).features[0].duplicate_candidates.length>0);
      const infected=Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
      await assert.rejects(imports.stage(actor,{...input,bytes:infected},ctx()),/MALWARE/);
      allowed=false;await assert.rejects(imports.preview(actor,staged.batchId),/FORBIDDEN/);allowed=true;
    });
    await t.test('catalogued real dispatcher/inbox retry and replay are atomic',async()=>{
      const {events}=await loadAndValidateContracts();const definition=events.events.find(e=>e.name==='gis.geometry.changed');assert.equal(definition.producer,'gis');
      const rows=(await pool.query('SELECT * FROM gis.outbox_event')).rows;
      for(const row of rows)assert.deepEqual(Object.keys(row.payload).sort(),definition.schema.required.slice().sort());
      await pool.query('CREATE TABLE gis.fixture_consumer(event_id uuid PRIMARY KEY)');let fail=true;
      const handler={name:'gis-fixture',async handle(tx,e){if(e.source!=='gis')return;await tx.query('INSERT INTO gis.fixture_consumer VALUES($1)',[e.id]);if(fail)throw Error('Fixture retry');}};
      const dispatcher=new OutboxDispatcherService(pool,[handler],new InboxService(pool));await dispatcher.dispatchAvailable();assert.equal((await pool.query('SELECT count(*)::int AS n FROM gis.fixture_consumer')).rows[0].n,0);
      fail=false;await pool.query("UPDATE platform_events.outbox_delivery SET next_attempt_at=clock_timestamp() WHERE source='gis'");await dispatcher.dispatchAvailable();
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM gis.fixture_consumer')).rows[0].n,rows.length);
      await pool.query("UPDATE platform_events.outbox_delivery SET delivered_at=NULL,next_attempt_at=clock_timestamp() WHERE source='gis'");await dispatcher.dispatchAvailable();
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM gis.fixture_consumer')).rows[0].n,rows.length);
    });
    await t.test('10k indexed spatial fixture and bounded query latency',async()=>{
      // Synthetic test-only spatial grid; never used as production reference data.
      await pool.query(`INSERT INTO gis.geometry_head SELECT $1,('00000000-0000-7000-8000-'||lpad(i::text,12,'0'))::uuid,1 FROM generate_series(1,10000)i`,[tenantId]);
      await pool.query(`INSERT INTO gis.geometry_version(tenant_id,geometry_id,id,revision,geometry,area_ha,measurement_method,source,reason) SELECT $1,id,id,1,ST_Multi(ST_MakeEnvelope((i%100)*0.1,(i/100)*0.1,(i%100)*0.1+0.01,(i/100)*0.1+0.01,4326)),1,'fixture', '{}'::jsonb,'fixture performance' FROM (SELECT ('00000000-0000-7000-8000-'||lpad(i::text,12,'0'))::uuid AS id,i FROM generate_series(1,10000)i) f`,[tenantId]);
      await pool.query("INSERT INTO gis.geometry_decision SELECT tenant_id,geometry_id,id,'APPROVED','2026-11-02T00:00:00Z','fixture' FROM gis.geometry_version WHERE measurement_method='fixture'");
      await pool.query('ANALYZE gis.geometry_version');
      const plan=(await pool.query('EXPLAIN (FORMAT JSON) SELECT id FROM gis.geometry_version WHERE tenant_id=$1 AND geometry && ST_MakeEnvelope(1,1,1.02,1.02,4326)',[tenantId])).rows[0];
      assert.match(JSON.stringify(plan),/geometry_version_gist/);
      const timings=[];for(let i=0;i<20;i++){const start=performance.now();const result=await service.query(actor,[1,1,1.02,1.02],'2026-11-02T00:00:00Z');assert.ok(result.features.length>0);timings.push(performance.now()-start);}
      timings.sort((a,b)=>a-b);const p95=timings[18];assert.ok(p95<=1500,`GIS166 P95=${p95}`);console.log(JSON.stringify({scenario:'WP49-026-GIS',clock:'2026-11-02T00:00:00Z',features:10000,p95Ms:p95,immutableHistory:true,atomicImports:true,tenantIsolation:true,postgisGeography:true}));
    });
  }finally{
    if(previousMode===undefined)delete process.env.AGRO_DEPLOYMENT_MODE;else process.env.AGRO_DEPLOYMENT_MODE=previousMode;
    if(previousScanner===undefined)delete process.env.FILES_CLAMD_ENDPOINT;else process.env.FILES_CLAMD_ENDPOINT=previousScanner;
    await pool?.end();for(const name of auxiliary)assertCommand(docker(['stop',name]),'Auxiliary cleanup');if(started)assertCommand(docker(['stop',container]),'Fixture cleanup');await rm(temporaryDirectory,{recursive:true,force:true});
  }
});
