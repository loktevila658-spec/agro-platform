import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';

import { createServer } from 'node:http';
import { IntegrationsRegistry } from '../dist/modules/integrations/integrations.registry.js';
import { IntegrationsService } from '../dist/modules/integrations/integrations.service.js';
import { ConnectorError } from '../../../packages/connectors/src/index.cjs';

const { Pool } = pg;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const image = process.env.POSTGIS_TEST_IMAGE ?? 'agroplatform/wp49-003-postgis:test';

function docker(args) {
  return spawnSync('docker', args, { cwd: repositoryRoot, encoding: 'utf8', timeout:180000 });
}

function assertCommand(result, action) {
  assert.equal(result.status, 0, `${action} failed\n${result.stdout}\n${result.stderr}`);
}

test('connector PostgreSQL deterministic retry/DLQ/staging/owner-boundary failure injection', {timeout:180000}, async(t)=>{
  const container = `agro-wp49-021-connectors-${process.pid}`;
  const password = 'wp49_021_ephemeral_test_only';
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'agro-connectors-integration-'));
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
    pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 1000, statement_timeout: 15000 });
    const phase=(name)=>console.log(`connector integration: ${name}`);
    phase('PostgreSQL started');

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
    assert.match(migration.stdout, /migration 8 applied/);
    phase('migration v8 applied');


    process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
    const registry=new IntegrationsRegistry();
    const actor={tenantId:randomUUID(),subjectId:randomUUID()};
    let permitted=true,failOwner=false,mode='ok',submits=0,reconciles=0;
    const external=new Map();
    const remote=createServer(async(req,res)=>{
      const key=req.headers['idempotency-key'];
      if(req.method==='GET'){res.setHeader('content-type','application/json');res.end(JSON.stringify(external.get(key)??{status:'NOT_FOUND'}));return;}
      submits++;
      if(mode==='rate'){res.writeHead(429,{'retry-after':'2'});res.end();return;}
      if(mode==='network'){res.writeHead(503);res.end();return;}
      if(mode==='slow'){await new Promise(r=>setTimeout(r,150));res.writeHead(503);res.end();return;}
      if(mode==='auth'){res.writeHead(401);res.end();return;}
      const result={status:mode==='sent'?'SENT':'ACCEPTED',externalId:`remote-${key}`,metadata:{redacted:true}};
      external.set(key,result);
      res.setHeader('content-type','application/json');res.end(JSON.stringify(result));
    });
    await new Promise(r=>remote.listen(0,'127.0.0.1',r));
    const url=`http://127.0.0.1:${remote.address().port}`;
    t.after(()=>new Promise(r=>remote.close(r)));
    registry.installPolicy(async(a)=>permitted&&a.subjectId===actor.subjectId);
    registry.registerAdapter({
      code:'fixture',
      async validate(mapped){if(!Number.isInteger(mapped.value))throw new ConnectorError('VALIDATION');},
      async submit(mapped,ctx){
        const response=await fetch(url,{method:'POST',headers:{'idempotency-key':ctx.idempotencyKey},body:JSON.stringify(mapped),signal:ctx.signal});
        if(response.status===429)throw new ConnectorError('RATE_LIMIT',Number(response.headers.get('retry-after'))*1000);
        if(response.status===503)throw new ConnectorError('TEMPORARY');
        if(response.status===401)throw new ConnectorError('AUTH_ERROR');
        const result=await response.json();
        if(mode==='lost'){mode='ok';throw new ConnectorError('TIMEOUT');}
        return result;
      },
      async reconcile(ctx){reconciles++;if(mode==='unknown')return {status:'UNKNOWN'};return (await fetch(url,{headers:{'idempotency-key':ctx.idempotencyKey},signal:ctx.signal})).json();}
    });
    await pool.query(`CREATE SCHEMA connector_fixture;
      CREATE TABLE connector_fixture.fact(id text PRIMARY KEY,value integer,version integer NOT NULL);
      CREATE TABLE connector_fixture.audit(job_id uuid PRIMARY KEY);
      CREATE TABLE connector_fixture.outbox(job_id uuid PRIMARY KEY);`);
    registry.registerCommand({operation:'FixtureCommand',
      async validate(tx,a,e,mapped){
        if(!permitted||a.tenantId!==e.tenantId)throw Error('OWNER_DENIED');
        const row=(await tx.query('SELECT version FROM connector_fixture.fact WHERE id=$1 FOR UPDATE',[e.localId])).rows[0];
        if((row?.version??0)!==mapped.baseVersion)throw Error('STALE_VERSION');
      },
      async execute(tx,a,e,mapped){
        await tx.query(`INSERT INTO connector_fixture.fact(id,value,version) VALUES($1,$2,1) ON CONFLICT(id) DO UPDATE SET value=$2,version=connector_fixture.fact.version+1`,[e.localId,mapped.value]);
        await tx.query('INSERT INTO connector_fixture.audit VALUES($1)',[e.id]);
        await tx.query('INSERT INTO connector_fixture.outbox VALUES($1)',[e.id]);
        if(failOwner)throw new ConnectorError('TEMPORARY');
        return {canonicalId:e.localId};
      }
    });
    let service=new IntegrationsService(pool,registry);
    const profile={id:'fixture-profile',adapter:'fixture',version:1,schemaVersion:'fixture-v1',mapping:[{from:['value'],to:'value',required:true},{from:['baseVersion'],to:'baseVersion',required:true}],retry:{maxAttempts:3,baseDelayMs:10,maxDelayMs:100,jitter:0,timeoutMs:2000}};
    await service.configure(actor,profile);
    const envelope=(direction='INBOUND',overrides={})=>{
      const id=randomUUID();
      return {id,tenantId:actor.tenantId,profileId:profile.id,profileVersion:1,direction,idempotencyKey:id,operation:'FixtureCommand',entityType:'Fixture',localId:id,externalId:`incoming-${id}`,schemaVersion:'fixture-v1',observedAt:'2026-10-28T00:00:00Z',correlationId:'deterministic-connector-demo',payload:{value:4,baseVersion:0},provenance:{source:'fixture-only'},...overrides};
    };
    const inspect=e=>service.inspect(actor,e.id,profile.id);
    const due=()=>pool.query("UPDATE integrations.job SET next_attempt_at=clock_timestamp() WHERE state IN ('RETRYING','SENT','SENDING')");
    await t.test('concurrent duplicate stage/delivery commits one canonical effect, audit, outbox and external revision',async()=>{
      const e=envelope();await Promise.all(Array.from({length:10},()=>service.stage(actor,e)));
      await Promise.all(Array.from({length:10},()=>service.dispatchAvailable()));
      assert.equal((await inspect(e)).state,'ACCEPTED');
      for(const table of ['audit','outbox'])assert.equal((await pool.query(`SELECT count(*)::int n FROM connector_fixture.${table} WHERE job_id=$1`,[e.id])).rows[0].n,1);
      assert.equal((await pool.query('SELECT version FROM connector_fixture.fact WHERE id=$1',[e.localId])).rows[0].version,1);
      assert.equal((await pool.query('SELECT count(*)::int n FROM integrations.link_revision WHERE job_id=$1',[e.id])).rows[0].n,1);
      await assert.rejects(service.stage(actor,{...e,payload:{value:9,baseVersion:0}}),/IDEMPOTENCY_CONFLICT/);
    });
    await t.test('owner effect/audit/outbox roll back on failure; restart retry preserves original staged intent',async()=>{
      const e=envelope();failOwner=true;await service.stage(actor,e);await service.dispatchAvailable();
      assert.equal((await inspect(e)).state,'RETRYING');
      for(const table of ['audit','outbox'])assert.equal((await pool.query(`SELECT count(*)::int n FROM connector_fixture.${table} WHERE job_id=$1`,[e.id])).rows[0].n,0);
      assert.equal((await pool.query('SELECT count(*)::int n FROM connector_fixture.fact WHERE id=$1',[e.localId])).rows[0].n,0);
      failOwner=false;service=new IntegrationsService(pool,registry);await due();await service.dispatchAvailable();
      assert.equal((await inspect(e)).state,'ACCEPTED');assert.equal((await inspect(e)).attempts,2);
    });
    await t.test('429 Retry-After, 503 exhaustion, reasoned DLQ replay retain stable outbound key',async()=>{
      const e=envelope('OUTBOUND');mode='rate';await service.stage(actor,e);await service.dispatchAvailable();
      let row=await inspect(e);assert.equal(row.state,'RETRYING');assert.ok(row.next_attempt_at.getTime()>Date.now()+1000);
      const before=submits;await service.dispatchAvailable();assert.equal(submits,before);
      mode='network';await due();await service.dispatchAvailable();await due();await service.dispatchAvailable();
      assert.equal((await inspect(e)).state,'DEAD_LETTER');
      await assert.rejects(service.replay(actor,e.id,profile.id,''),/REASON/);
      mode='ok';await service.replay(actor,e.id,profile.id,'fixture provider restored');await service.dispatchAvailable();
      assert.equal((await inspect(e)).state,'ACCEPTED');assert.equal((await inspect(e)).attempts,4);
    });
    await t.test('lost response then restarted worker reconciles; no duplicate external submit',async()=>{
      const e=envelope('OUTBOUND');mode='lost';const before=submits;await service.stage(actor,e);await service.dispatchAvailable();
      assert.equal((await inspect(e)).state,'RETRYING');assert.equal(submits,before+1);
      service=new IntegrationsService(pool,registry);await due();await service.dispatchAvailable();
      assert.equal((await inspect(e)).state,'ACCEPTED');assert.equal(submits,before+1);assert.ok(reconciles>0);
    });
    await t.test('durable SENDING crash marker forces reconciliation and UNKNOWN never resends',async()=>{
      const e=envelope('OUTBOUND');await service.stage(actor,e);
      await pool.query("UPDATE integrations.job SET state='SENDING',unknown_outcome=true WHERE id=$1",[e.id]);
      mode='unknown';const before=submits;await service.dispatchAvailable();assert.equal(submits,before);assert.equal((await inspect(e)).state,'RETRYING');
      mode='ok';await due();await service.dispatchAvailable();assert.equal((await inspect(e)).state,'ACCEPTED');assert.equal(submits,before+1);
    });
    await t.test('bounded real HTTP timeout preserves unknown outcome; SENT polls before terminal acceptance',async()=>{
      const fast={...profile,id:'fast-profile',retry:{...profile.retry,timeoutMs:50}};await service.configure(actor,fast);
      const e=envelope('OUTBOUND',{profileId:fast.id});mode='slow';await service.stage(actor,e);await service.dispatchAvailable();
      assert.equal((await service.inspect(actor,e.id,fast.id)).state,'RETRYING');mode='ok';await due();await service.dispatchAvailable();
      assert.equal((await service.inspect(actor,e.id,fast.id)).state,'ACCEPTED');
      const pending=envelope('OUTBOUND');mode='sent';await service.stage(actor,pending);await service.dispatchAvailable();assert.equal((await inspect(pending)).state,'SENT');
      const before=submits;external.set(pending.idempotencyKey,{status:'ACCEPTED',externalId:`remote-${pending.idempotencyKey}`,metadata:{redacted:true}});
      mode='ok';await due();await service.dispatchAvailable();assert.equal((await inspect(pending)).state,'ACCEPTED');assert.equal(submits,before);
    });
    await t.test('profile upgrade does not rewrite an already staged mapping version',async()=>{
      const e=envelope();await service.stage(actor,e);
      await service.configure(actor,{...profile,version:2,mapping:[{from:['newValue'],to:'value',required:true},{from:['baseVersion'],to:'baseVersion',required:true}]});
      await service.dispatchAvailable();assert.equal((await inspect(e)).state,'ACCEPTED');
      assert.equal((await pool.query('SELECT value FROM connector_fixture.fact WHERE id=$1',[e.localId])).rows[0].value,4);
    });
    await t.test('unknown schema retained in DLQ; bad mapping/auth actionable without blind retry',async()=>{
      const e=envelope('INBOUND',{schemaVersion:'unknown-required'});await service.stage(actor,e);await service.dispatchAvailable();assert.equal((await inspect(e)).state,'DEAD_LETTER');
      const bad=envelope('INBOUND',{payload:{baseVersion:0}});await service.stage(actor,bad);await service.dispatchAvailable();assert.equal((await inspect(bad)).state,'ACTION_REQUIRED');
      mode='auth';const auth=envelope('OUTBOUND');await service.stage(actor,auth);await service.dispatchAvailable();assert.equal((await inspect(auth)).state,'ACTION_REQUIRED');mode='ok';
      const before=submits;await service.dispatchAvailable();assert.equal(submits,before);
    });
    await t.test('external-ID collisions and out-of-order owner versions never overwrite canonical facts',async()=>{
      const e=envelope();await service.stage(actor,e);await service.dispatchAvailable();
      const collision=envelope('INBOUND',{externalId:e.externalId});await service.stage(actor,collision);await service.dispatchAvailable();assert.equal((await inspect(collision)).state,'ACTION_REQUIRED');
      assert.equal((await pool.query('SELECT count(*)::int n FROM connector_fixture.fact WHERE id=$1',[collision.localId])).rows[0].n,0);
      const stale=envelope('INBOUND',{externalId:e.externalId,localId:e.localId,payload:{value:99,baseVersion:0}});await service.stage(actor,stale);await service.dispatchAvailable();assert.equal((await inspect(stale)).state,'ACTION_REQUIRED');
      assert.equal((await pool.query('SELECT value FROM connector_fixture.fact WHERE id=$1',[e.localId])).rows[0].value,4);
      const next=envelope('INBOUND',{externalId:e.externalId,localId:e.localId,payload:{value:5,baseVersion:1}});await service.stage(actor,next);await service.dispatchAvailable();assert.equal((await inspect(next)).state,'ACCEPTED');
      assert.equal((await pool.query('SELECT max(revision) n FROM integrations.link_revision WHERE external_id=$1',[e.externalId])).rows[0].n,2);
    });
    await t.test('revoked current permission, tenant isolation and immutable profile/envelope/provenance',async()=>{
      const e=envelope();await service.stage(actor,e);permitted=false;await service.dispatchAvailable();permitted=true;
      assert.equal((await inspect(e)).state,'ACTION_REQUIRED');
      const other={...actor,tenantId:randomUUID()};await assert.rejects(service.stage(other,e),/INVALID_ENVELOPE/);assert.equal(await service.inspect(other,e.id,profile.id),undefined);
      await assert.rejects(service.configure(actor,{...profile,mapping:[{from:['evil'],to:'value'}]}),/IMMUTABLE/);
      await assert.rejects(pool.query("UPDATE integrations.job SET envelope='{}' WHERE id=$1",[e.id]),/immutable/);
      for(const table of ['profile','attempt','external_link','link_revision','audit_entry','outbox'])await assert.rejects(pool.query(`DELETE FROM integrations.${table}`),/immutable/);
      await service.replay(actor,e.id,profile.id,'permission restored');await service.dispatchAvailable();assert.equal((await inspect(e)).state,'ACCEPTED');
    });
    phase('all deterministic connector failure-injection assertions passed');
  } finally {
    if(pool)await pool.end();
    if(started)docker(['rm','--force',container]);
  }
});
