import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID, generateKeyPairSync, verify } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';

import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {Module}=require('@nestjs/common');
const {NestFactory}=require('@nestjs/core');
const {SyncController}=require('../dist/modules/sync/sync.controller.js');
const {SyncFiles}=require('../dist/modules/sync/sync.files.js');
import { SyncService } from '../dist/modules/sync/sync.service.js';
import { SyncRegistry } from '../dist/modules/sync/sync.registry.js';
import { SyncConflict } from '../dist/modules/sync/sync.types.js';
import { encodeCursor } from '../dist/modules/sync/sync.crypto.js';

const { Pool } = pg;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const image = process.env.POSTGIS_TEST_IMAGE ?? 'agroplatform/wp49-003-postgis:test';

function docker(args) {
  return spawnSync('docker', args, { cwd: repositoryRoot, encoding: 'utf8' });
}

function assertCommand(result, action) {
  assert.equal(result.status, 0, `${action} failed\n${result.stdout}\n${result.stderr}`);
}

test('sync PostgreSQL atomicity, reconnect, conflicts and durable scoped cursor', {timeout:180000}, async(t)=>{
  const container = `agro-wp49-020-sync-${process.pid}`;
  const password = 'wp49_020_ephemeral_test_only';
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'agro-sync-integration-'));
  const psqlWrapper = join(temporaryDirectory, 'psql');
  let pool;
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
    assert.match(migration.stdout, /migration 7 applied/);


    process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
    process.env.SYNC_CURSOR_KEY='test-only-sync-cursor-key-32-bytes!';
    const actor={tenantId:randomUUID(),userId:randomUUID(),deviceId:randomUUID(),sessionId:randomUUID()};
    let revoked=false,permission=true,fail=false;
    const identity={async authenticate(token) { if(revoked||token!=='Bearer fixture') throw Error('AUTH_DENIED'); return actor; }};
    const registry=new SyncRegistry();
    registry.registerProjectionPolicy('Fixture',async()=>permission);
    await pool.query('CREATE SCHEMA sync_test; CREATE TABLE sync_test.aggregate(id text PRIMARY KEY,version integer NOT NULL,value text); CREATE TABLE sync_test.audit(command_id uuid PRIMARY KEY); CREATE TABLE sync_test.outbox(command_id uuid PRIMARY KEY);');
    await pool.query("INSERT INTO sync_test.aggregate VALUES('one',7,'original')");
    registry.register({commandType:'RecordFixture',version:1,requiresVersion:true,
      async authorize(){return permission;},
      async currentState(tx,_actor,c){return (await tx.query('SELECT version,value FROM sync_test.aggregate WHERE id=$1',[c.aggregate.id])).rows[0];},
      async assertVersion(tx,_actor,c){const row=(await tx.query('SELECT version FROM sync_test.aggregate WHERE id=$1 FOR UPDATE',[c.aggregate.id])).rows[0];return row?.version===c.baseVersion;},
      async execute(tx,a,c){
        await tx.query('UPDATE sync_test.aggregate SET version=version+1,value=$2 WHERE id=$1',[c.aggregate.id,c.payload.value]);
        await tx.query('INSERT INTO sync_test.audit VALUES($1)',[c.localCommandId]);
        await tx.query('INSERT INTO sync_test.outbox VALUES($1)',[c.localCommandId]);
        if(fail)throw Error('LOST_CONNECTION');
        if(c.payload.conflict)throw new SyncConflict('STATE_CONFLICT',{state:'closed'});
        return {canonical:{value:c.payload.value},aggregateVersion:c.baseVersion+1,changes:[{entityType:'Fixture',entityId:c.aggregate.id,entityVersion:c.baseVersion+1,op:'UPSERT',projection:{value:c.payload.value},visibleUserIds:[a.userId]}]};
      },
    });
    let sync=new SyncService(pool,registry,identity);
    const auth='Bearer fixture',installationId=randomUUID();
    await sync.register(auth,{deviceId:actor.deviceId,installationId,schemaVersion:1});
    await assert.rejects(sync.register(auth,{deviceId:actor.deviceId,installationId:randomUUID(),schemaVersion:1}),/binding/);
    const signing=generateKeyPairSync('ed25519');
    process.env.SYNC_GRANT_PRIVATE_KEY=signing.privateKey.export({type:'pkcs8',format:'pem'});
    registry.get('RecordFixture').offlinePolicy=async()=>({owners:['Fixture:one'],risk:'O1',ttlSeconds:7*86400});
    const bootstrap=await sync.bootstrap(auth,{deviceId:actor.deviceId,schemaVersion:1});
    assert.equal(bootstrap.authorityMode,'LOCAL_PRIMARY');
    const [signedBody,signedSignature]=bootstrap.grants[0].signedEnvelope.split('.');assert.equal(verify(null,Buffer.from(signedBody),signing.publicKey,Buffer.from(signedSignature,'base64url')),true);
    assert.equal(JSON.parse(Buffer.from(signedBody,'base64url')).deviceId,actor.deviceId);
    const uuid7=()=>randomUUID().slice(0,14)+'7'+randomUUID().slice(15);
    let sequence=0;
    const command=(version=7)=>{const id=uuid7();return {localCommandId:id,idempotencyKey:id,deviceSeq:++sequence,aggregate:{type:'Fixture',id:'one'},baseVersion:version,type:'RecordFixture',commandVersion:1,observedAt:'2026-10-01T00:30:00Z',offlineAuthId:'provisioned',payload:{value:'offline intent'},provenance:{gps:[1,2],observedBy:'fixture'},attachments:[]};};
    const push=(commands)=>sync.push(auth,{deviceId:actor.deviceId,scopeVersion:1,schemaVersion:1,commands});
    const first=command();
    const receipts=await Promise.all(Array.from({length:10},()=>push([first])));
    for(const r of receipts)assert.deepEqual(r.results[0],receipts[0].results[0]);
    assert.equal((await pool.query('SELECT count(*)::int n FROM sync_test.outbox')).rows[0].n,1);
    assert.equal((await pool.query('SELECT count(*)::int n FROM sync_test.audit')).rows[0].n,1);
    sync=new SyncService(pool,registry,identity); // restart, durable receipt
    assert.deepEqual((await push([first])).results,receipts[0].results);
    await assert.rejects(push([{...first,payload:{value:'tamper'}}]),/IDEMPOTENCY_PAYLOAD_MISMATCH/);
    permission=false;
    await assert.rejects(push([first]),/PERMISSION_CHANGED_OFFLINE/);
    const denied=command(8);const deniedReceipt=(await push([denied])).results[0];assert.equal(deniedReceipt.status,'REJECTED');assert.deepEqual((await push([denied])).results[0],deniedReceipt);permission=true;
    const stale=command(7);const conflict=(await push([stale])).results[0];
    assert.equal(conflict.status,'CONFLICT');assert.equal(conflict.canonical.version,8);assert.deepEqual(conflict.localIntent.provenance,stale.provenance);
    assert.equal((await pool.query('SELECT count(*)::int n FROM sync.conflict_record')).rows[0].n,1);
    const businessConflict=command(8);businessConflict.payload.conflict=true;
    assert.equal((await push([businessConflict])).results[0].code,'STATE_CONFLICT');
    assert.equal((await pool.query("SELECT version FROM sync_test.aggregate WHERE id='one'")).rows[0].version,8);
    const good=command(8), later=command(9);
    const originalExecute=registry.get('RecordFixture').execute;
    registry.get('RecordFixture').execute=async(...args)=>{if(args[2].localCommandId===later.localCommandId)fail=true;return originalExecute(...args);};
    await assert.rejects(push([good,later]),/LOST_CONNECTION/); // first committed, second rolled back
    assert.equal((await pool.query('SELECT count(*)::int n FROM sync_test.outbox')).rows[0].n,2);
    fail=false;registry.get('RecordFixture').execute=originalExecute;
    const replay=await push([good,later]);assert.ok(replay.results.every(r=>r.status==='ACCEPTED'));
    assert.equal((await pool.query('SELECT count(*)::int n FROM sync_test.outbox')).rows[0].n,3);
    const page=await sync.pull(auth,{deviceId:actor.deviceId,scopeVersion:1,cursor:bootstrap.initialCursor,limit:1});
    assert.equal(page.changes.length,1);assert.equal(page.hasMore,true);
    assert.deepEqual((await sync.pull(auth,{deviceId:actor.deviceId,scopeVersion:1,cursor:bootstrap.initialCursor,limit:1})).changes,page.changes);
    permission=false;const purged=await sync.pull(auth,{deviceId:actor.deviceId,scopeVersion:1,cursor:bootstrap.initialCursor,limit:1});assert.equal(purged.changes[0].op,'PURGE');assert.deepEqual(purged.changes[0].projection,{});permission=true;
    await sync.ack(auth,{deviceId:actor.deviceId,scopeVersion:1,cursor:page.nextCursor});
    const reset=await sync.pull(auth,{deviceId:actor.deviceId,scopeVersion:1,cursor:page.nextCursor+'broken'});assert.equal(reset.resetRequired,true);
    const expired=encodeCursor({tenantId:actor.tenantId,userId:actor.userId,deviceId:actor.deviceId,scopeVersion:1,schemaVersion:1,seq:'0',issuedAt:Date.now()-91*86400000},process.env.SYNC_CURSOR_KEY);
    assert.equal((await sync.pull(auth,{deviceId:actor.deviceId,scopeVersion:1,cursor:expired})).code,'CURSOR_EXPIRED');
    const tenant=actor.tenantId;actor.tenantId=randomUUID();
    await sync.register(auth,{deviceId:actor.deviceId,installationId:randomUUID(),schemaVersion:1});
    assert.equal((await sync.pull(auth,{deviceId:actor.deviceId,scopeVersion:1,cursor:page.nextCursor})).resetRequired,true);
    actor.tenantId=tenant;
    revoked=true;await assert.rejects(push([first]),/AUTH_DENIED/);revoked=false;
    process.env.AGRO_DEPLOYMENT_MODE='CLOUD_PRIMARY';await assert.rejects(push([first]),/AUTHORITY_MODE_MISMATCH/);process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
    // 100 lightweight commands benchmark executes two DOC12-bounded batches.
    registry.register({commandType:'AppendFixture',version:1,requiresVersion:false,async authorize(){return true;},async execute(tx,a,c){await tx.query('INSERT INTO sync_test.outbox VALUES($1)',[c.localCommandId]);return {canonical:{},changes:[{entityType:'Fixture',entityId:c.localCommandId,op:'UPSERT',projection:{},visibleUserIds:[a.userId]}]};}});
    const samples=[];
    for(let run=0;run<5;run++){const at=performance.now();for(let batch=0;batch<2;batch++)await push(Array.from({length:50},()=>({...command(),type:'AppendFixture'})));samples.push(performance.now()-at);}
    samples.sort((a,b)=>a-b);assert.ok(samples.at(-1)<2000,`100-command P95 ${samples.at(-1)} ms`);
    // Two 500-row pages implement DOC20 1000-record benchmark within DOC12 limits.
    const writer=await pool.connect();await writer.query('BEGIN');
    await sync.appendChanges(writer,actor.tenantId,Array.from({length:1000},(_,i)=>({entityType:'Fixture',entityId:`projection-${i}`,op:'UPSERT',projection:{value:i},visibleUserIds:[actor.userId]})));
    await writer.query('COMMIT');writer.release();
    const pullStarted=performance.now();let pullCursor=bootstrap.initialCursor;let pulled=0;
    while(pulled<1000){const p=await sync.pull(auth,{deviceId:actor.deviceId,scopeVersion:1,cursor:pullCursor,limit:500});pulled+=p.changes.length;pullCursor=p.nextCursor;}
    assert.ok(performance.now()-pullStarted<2000);t.diagnostic(`1000 change records <=2 MiB/page delivered in ${(performance.now()-pullStarted).toFixed(1)}ms`);
    // Delayed media keeps stable local reference even after command receipt.
    const localId=uuid7(),remoteId=uuid7();const intent={localAttachmentId:localId,ownerRef:'Fixture:one',evidenceType:'photo',sha256:'a'.repeat(64),mime:'image/jpeg',sizeBytes:4,required:false};
    const media=new SyncFiles(sync,{async initUpload(){return {attachmentId:remoteId,state:'QUARANTINED',sizeBytes:4,chunkSizeBytes:5242880,resumable:false};},async uploadPart(){return {partNumber:1,sha256:intent.sha256,sizeBytes:4};},async completeUpload(){},async getAvailableReference(){return {attachmentId:remoteId,state:'AVAILABLE',sizeBytes:4,sha256:intent.sha256,mime:'image/jpeg',ownerRef:intent.ownerRef,evidenceType:intent.evidenceType};}});
    const delayed={...command(),type:'AppendFixture',attachments:[intent]};await push([delayed]);
    assert.equal((await pool.query('SELECT remote_id FROM sync.attachment_reference WHERE tenant_id=$1 AND local_id=$2',[actor.tenantId,localId])).rows[0].remote_id,null);
    await media.init(auth,intent);await media.part(auth,localId,remoteId,1,intent.sha256,Buffer.from([255,216,255,0]));await media.complete(auth,localId,remoteId);
    assert.equal((await pool.query('SELECT remote_id FROM sync.attachment_reference WHERE tenant_id=$1 AND local_id=$2',[actor.tenantId,localId])).rows[0].remote_id,remoteId);
    await assert.rejects(media.init(auth,{...intent,ownerRef:'Fixture:other'}),/ATTACHMENT_OWNER_MISMATCH/);
    // Competing writer cannot publish a later seq before earlier transaction commits.
    const c1=await pool.connect(),c2=await pool.connect();await c1.query('BEGIN');await c2.query('BEGIN');
    const before=(await pool.query('SELECT seq::text FROM sync.tenant_clock WHERE tenant_id=$1',[actor.tenantId])).rows[0].seq;
    const change={entityType:'Fixture',entityId:'ordered',op:'UPSERT',projection:{},visibleUserIds:[actor.userId]};
    await sync.appendChanges(c1,actor.tenantId,[change]);let secondDone=false;
    const second=sync.appendChanges(c2,actor.tenantId,[change]).then(()=>{secondDone=true;});
    await new Promise(r=>setTimeout(r,30));assert.equal(secondDone,false);
    assert.equal((await pool.query('SELECT seq::text FROM sync.tenant_clock WHERE tenant_id=$1',[actor.tenantId])).rows[0].seq,before);
    await c1.query('COMMIT');await second;await c2.query('COMMIT');c1.release();c2.release();
    // HTTP module binding runs real service/PostgreSQL through canonical route.
    class HttpFixture {}
    Module({controllers:[SyncController],providers:[{provide:SyncService,useValue:{push:(...a)=>sync.push(...a),pull:(...a)=>sync.pull(...a),register:(...a)=>sync.register(...a),bootstrap:(...a)=>sync.bootstrap(...a),ack:(...a)=>sync.ack(...a),health:(...a)=>sync.health(...a)}}]})(HttpFixture);
    const app=await NestFactory.create(HttpFixture,{logger:false});await app.listen(0,'127.0.0.1');
    try {
      const url=await app.getUrl();const wire={deviceId:actor.deviceId,scopeVersion:1,schemaVersion:1,commands:[{...command(),type:'AppendFixture'}]};
      const response=await fetch(`${url}/v1/sync/push`,{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify(wire)});
      assert.equal(response.status,200);assert.equal((await response.json()).results[0].status,'ACCEPTED');
    }finally{await app.close();}
    t.diagnostic(`100 lightweight commands P95=${samples.at(-1).toFixed(1)}ms; exact-once concurrent/restart/partial/permission/conflict/cursor/tenant/authority tests passed on real PostgreSQL`);
  } finally {
    if(pool)await pool.end();if(started)docker(['rm','--force',container]);
  }
});
