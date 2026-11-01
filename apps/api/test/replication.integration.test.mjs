import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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

import { ReplicationService } from '../dist/modules/replication/replication.service.js';
import { ReplicationReceiver } from '../dist/modules/replication/replication.receiver.js';
import { ReplicationConsumer } from '../dist/modules/replication/replication.consumer.js';
import { ReplicationRegistry } from '../dist/modules/replication/replication.registry.js';
import { IntegrationsRegistry } from '../dist/modules/integrations/integrations.registry.js';
import { signBody, verifyBody, digest } from '../dist/modules/replication/replication.validation.js';
const key='x'.repeat(64);
const actor=tenantId=>({tenantId,subjectId:'replication-service'});
const config=tenantId=>({...actor(tenantId),siteId:'site-local',installationId:'edge-installation',key,timeoutMs:100,pollMs:100,maxAttempts:3});
const change=(tenantId,eventId='event-1',revision='1',overrides={})=>({version:1,tenantId,eventId,aggregateType:'fixture',aggregateId:'record-1',revision,operation:'UPSERT',supersedes:null,payload:{value:revision},provenance:{owner:'fixture',sourceEventId:eventId,actorId:'local-user',correlationId:'wp024-demo',causationId:'local-command',occurredAt:'2026-11-01T00:00:00Z',evidence:{sourceHash:'a'.repeat(64),localAudit:'retained'}},objectRefs:[{id:'delayed-photo',sha256:'b'.repeat(64)}],...overrides});
const message=(c,sequence)=>({version:1,tenantId:c.tenantId,siteId:'site-local',installationId:'edge-installation',sequence,hash:digest(c),change:c});
test('Local to Holding: durable delivery, failures, replay and authority isolation', {timeout:180000}, async (t) => {
  const container = `agro-wp49-024-replication-${process.pid}`;
  const password = 'wp49_024_ephemeral_test_only';
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'agro-replication-integration-'));
  const psqlWrapper = join(temporaryDirectory, 'psql');
  let pool, cloud, rebuilt, restartedPool;
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
    assert.match(migration.stdout, /migration 10 applied/);

    assertCommand(docker(['exec',container,'createdb','-U','postgres','agro_cloud']),'Create independent Holding database');
    const cloudUrl=`postgresql://postgres:${password}@127.0.0.1:${port}/agro_cloud`;
    const cloudMigration=spawnSync(process.execPath,['database/migrate.mjs'],{cwd:repositoryRoot,encoding:'utf8',env:{...process.env,DATABASE_URL:socketUrl.replace('/agro_test?','/agro_cloud?'),PSQL_BIN:psqlWrapper}});
    assertCommand(cloudMigration,'Holding schema migration');
    // Holding receiver credentials have no operational/domain write capability.
    const admin=new Pool({connectionString:cloudUrl});
    await admin.query(`CREATE ROLE holding_receiver LOGIN PASSWORD 'ephemeral_cloud_only';
      GRANT USAGE ON SCHEMA replication TO holding_receiver;
      GRANT SELECT,INSERT,UPDATE ON replication.cloud_stream,replication.cloud_read_model TO holding_receiver;
      GRANT SELECT,INSERT ON replication.cloud_history TO holding_receiver;`);
    cloud=new Pool({connectionString:`postgresql://holding_receiver:ephemeral_cloud_only@127.0.0.1:${port}/agro_cloud`});
    const localRegistry=new ReplicationRegistry(), cloudRegistry=new ReplicationRegistry();
    const policy=new IntegrationsRegistry();policy.installPolicy(async(a)=>a.subjectId==='replication-service');
    let service=new ReplicationService(pool,localRegistry,policy);
    const receiver=new ReplicationReceiver(cloud,cloudRegistry);
    const register=(tenantId,send=m=>receiver.receive(m),overrides={})=>{cloudRegistry.register(config(tenantId));localRegistry.register({...config(tenantId),...overrides},{protocol:'https:',send});};
    const stage=async(c,rollback=false)=>{const tx=await pool.connect();try{await tx.query('BEGIN');const seq=await service.append(tx,c);await tx.query(rollback?'ROLLBACK':'COMMIT');return seq;}catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}};
    const due=async()=>{await pool.query("UPDATE replication.local_outbox SET next_attempt_at=clock_timestamp() WHERE state<>'ACKED'");await pool.query("UPDATE replication.local_clock SET next_send_at=clock_timestamp()");};
    const drain=async(steps=1)=>{let n=0;for(let i=0;i<steps;i++){await due();n+=await service.dispatchAvailable();}return n;};
    const local=async(tenant)=> (await pool.query('SELECT * FROM replication.local_clock WHERE tenant_id=$1',[tenant])).rows[0];
    const outbox=async(tenant)=> (await pool.query('SELECT * FROM replication.local_outbox WHERE tenant_id=$1 ORDER BY replication.local_outbox.sequence',[tenant])).rows;
    const history=async(tenant)=> (await cloud.query('SELECT * FROM replication.cloud_history WHERE tenant_id=$1 ORDER BY replication.cloud_history.sequence',[tenant])).rows;

    await t.test('transaction rollback, autocommit rejection and missing destination preserve Local facts',async()=>{
      const tx=await pool.connect();try{await assert.rejects(service.append(tx,change('autocommit')),/transaction/);}finally{tx.release();}
      await stage(change('rollback'),true);assert.equal(await local('rollback'),undefined);
      await stage(change('unconfigured'));assert.equal(await drain(),0);
      assert.equal((await service.status(actor('unconfigured'))).last_error,'DESTINATION_UNCONFIGURED');
      assert.equal((await local('unconfigured')).ack_sequence,'0');
      register('unconfigured');assert.equal(await drain(),1);
      assert.equal((await local('unconfigured')).ack_sequence,'1');
    });
    await t.test('commit-ordered cursor cannot skip an uncommitted or rolled-back allocation',async()=>{
      register('commit-order');
      const a=await pool.connect(),b=await pool.connect();
      try{
        await a.query('BEGIN');await b.query('BEGIN');
        assert.equal(await service.append(a,change('commit-order','rolled-back')),'1');
        const later=service.append(b,change('commit-order','committed'));
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM replication.local_outbox WHERE tenant_id='commit-order'")).rows[0].n,0);
        assert.equal(await service.dispatchAvailable(),0);
        await a.query('ROLLBACK');assert.equal(await later,'1');await b.query('COMMIT');
        assert.equal(await drain(),1);assert.equal((await history('commit-order'))[0].event_id,'committed');
      }finally{await a.query('ROLLBACK');await b.query('ROLLBACK');a.release();b.release();}
    });
    await t.test('successful send, idempotent staging/delivery and numeric sequence >9',async()=>{
      register('success');const c=change('success');assert.equal(await stage(c),'1');assert.equal(await stage(c),'1');
      await assert.rejects(stage({...c,payload:{value:'changed'}}),/DUPLICATE_CONFLICT/);
      for(let i=2;i<=12;i++)await stage(change('success',`event-${i}`,'1',{aggregateId:`record-${i}`}));
      assert.equal(await drain(12),12);
      const rows=await history('success');assert.equal(rows.length,12);assert.deepEqual(rows.map(r=>r.sequence),Array.from({length:12},(_,i)=>String(i+1)));
      const signed=signBody('message',message(c,'1'),key);
      const acks=await Promise.all(Array.from({length:10},()=>receiver.receive(signed)));
      assert.ok(acks.every(a=>verifyBody('ack',a,key).sequence==='1'));assert.equal((await history('success')).length,12);
      assert.equal((await local('success')).ack_sequence,'12');assert.equal(await drain(),0);
      const status=await service.status(actor('success'));assert.equal(status.backlog_count,0);assert.equal(status.backlog_bytes,'0');assert.ok(status.last_ack_at);
    });
    await t.test('lost ACK and SENDING interruption resume across new worker without duplicate effects',async()=>{
      let lost=true;
      register('resume',async m=>{const ack=await receiver.receive(m);if(lost){lost=false;throw Error('lost ACK with sensitive body');}return ack;});
      await stage(change('resume'));assert.equal(await drain(),0);assert.equal((await history('resume')).length,1);
      assert.equal((await local('resume')).ack_sequence,'0');assert.equal((await outbox('resume'))[0].last_error,'UNAVAILABLE');
      await pool.query("UPDATE replication.local_outbox SET state='SENDING' WHERE tenant_id='resume'");
      restartedPool=new Pool({connectionString:databaseUrl});
      service=new ReplicationService(restartedPool,localRegistry,policy);
      assert.equal(await drain(),1);assert.equal((await local('resume')).ack_sequence,'1');assert.equal((await history('resume')).length,1);
    });
    await t.test('concurrent senders share durable lock and rate bound',async()=>{
      register('concurrent',m=>receiver.receive(m),{pollMs:10000});await stage(change('concurrent'));
      const results=await Promise.all(Array.from({length:10},()=>service.dispatchAvailable()));assert.equal(results.reduce((a,b)=>a+b,0),1);
      assert.equal((await history('concurrent')).length,1);
      await stage(change('concurrent','second','1',{aggregateId:'record-2'}));
      // Durable stream rate limit also covers an event appended after the prior ACK.
      assert.equal(await service.dispatchAvailable(),0);
      await due();assert.equal(await service.dispatchAvailable(),1);
    });
    await t.test('cloud out-of-order/duplicate conflict/auth/schema rejects never advance cloud cursor',async()=>{
      register('order');const first=change('order'), second=change('order','event-2','2',{operation:'CORRECTION',supersedes:'event-1'});
      await assert.rejects(receiver.receive(signBody('message',message(second,'2'),key)),/SEQUENCE_GAP/);
      assert.equal((await history('order')).length,0);
      await assert.rejects(receiver.receive(signBody('message',message(first,'1'),'y'.repeat(64))),/AUTHENTICATION_FAILED/);
      await assert.rejects(receiver.receive(signBody('message',{...message(first,'1'),siteId:'other-site'},key)),/AUTHENTICATION_FAILED/);
      await assert.rejects(receiver.receive(signBody('message',{...message(first,'1'),version:2},key)),/INVALID_MESSAGE/);
      await receiver.receive(signBody('message',message(first,'1'),key));
      await assert.rejects(receiver.receive(signBody('message',message({...first,payload:{tampered:true}},'1'),key)),/DUPLICATE_CONFLICT/);
      await assert.rejects(receiver.receive(signBody('message',message(first,'2'),key)),/DUPLICATE_CONFLICT/);
      await receiver.receive(signBody('message',message(second,'2'),key));assert.equal((await history('order')).length,2);
    });
    await t.test('corrections/tombstones preserve original provenance and delayed object metadata',async()=>{
      register('corrections');const first=change('corrections');
      const second=change('corrections','event-2','2',{operation:'CORRECTION',supersedes:'event-1',payload:{value:'corrected'}});
      const third=change('corrections','event-3','3',{operation:'TOMBSTONE',supersedes:'event-2',payload:{}});
      for(const c of [first,second,third])await stage(c);
      assert.equal(await drain(3),3);
      const rows=await history('corrections');assert.deepEqual(rows.map(r=>r.change),[first,second,third]);
      const model=(await cloud.query("SELECT * FROM replication.cloud_read_model WHERE tenant_id='corrections'")).rows[0];assert.equal(model.tombstone,true);assert.equal(model.event_id,'event-3');
      await assert.rejects(admin.query("UPDATE replication.cloud_history SET hash='changed' WHERE tenant_id='corrections'"),/immutable/);
      await assert.rejects(pool.query("UPDATE replication.local_outbox SET change='{}' WHERE tenant_id='corrections'"),/immutable/);
      await assert.rejects(pool.query("DELETE FROM replication.journal WHERE tenant_id='corrections'"),/immutable/);
      await service.rebuild(actor('corrections'),'controlled-history-replay');assert.equal((await local('corrections')).ack_sequence,'0');
      assert.equal(await drain(3),3);assert.equal((await history('corrections')).length,3);assert.equal((await local('corrections')).ack_sequence,'3');
    });
    await t.test('fresh holding rebuild from retained history',async()=>{
      let target=receiver;
      register('rebootstrap',m=>target.receive(m));
      const first=change('rebootstrap');
      const second=change('rebootstrap','event-2','2',{operation:'CORRECTION',supersedes:'event-1'});
      const third=change('rebootstrap','event-3','3',{operation:'TOMBSTONE',supersedes:'event-2',payload:{}});
      for(const c of [first,second,third])await stage(c);
      assert.equal(await drain(3),3);
      assertCommand(docker(['exec',container,'createdb','-U','postgres','agro_rebuilt']),'Create fresh replica DB');
      const result=spawnSync(process.execPath,['database/migrate.mjs'],{cwd:repositoryRoot,encoding:'utf8',env:{...process.env,DATABASE_URL:socketUrl.replace('/agro_test?','/agro_rebuilt?'),PSQL_BIN:psqlWrapper}});
      assertCommand(result,'Fresh replica migrations');
      rebuilt=new Pool({connectionString:cloudUrl.replace('/agro_cloud','/agro_rebuilt')});
      target=new ReplicationReceiver(rebuilt,cloudRegistry);
      assert.equal((await rebuilt.query('SELECT count(*)::int AS n FROM replication.cloud_history')).rows[0].n,0);
      await service.rebuild(actor('rebootstrap'),'retained-bootstrap');
      assert.equal(await drain(3),3);
      const rows=(await rebuilt.query('SELECT change FROM replication.cloud_history ORDER BY sequence')).rows;
      assert.deepEqual(rows.map(r=>r.change),[first,second,third]);
      assert.equal((await rebuilt.query('SELECT tombstone FROM replication.cloud_read_model')).rows[0].tombstone,true);
      assert.equal((await local('rebootstrap')).ack_sequence,'3');
    });
    await t.test('real cloud transaction failure rolls back inbox/read model/cursor and retries safely',async()=>{
      register('cloudfail');await stage(change('cloudfail'));
      await admin.query(`CREATE FUNCTION replication.fail_cloud() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id='cloudfail' THEN RAISE EXCEPTION 'injected cloud unavailable'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER test_cloud_failure BEFORE INSERT ON replication.cloud_read_model FOR EACH ROW EXECUTE FUNCTION replication.fail_cloud();`);
      assert.equal(await drain(),0);assert.equal((await history('cloudfail')).length,0);assert.equal((await local('cloudfail')).ack_sequence,'0');
      assert.equal((await service.status(actor('cloudfail'))).backlog_count,1);
      await admin.query('DROP TRIGGER test_cloud_failure ON replication.cloud_read_model');assert.equal(await drain(),1);assert.equal((await history('cloudfail')).length,1);
    });
    await t.test('real Local ACK failure cannot skip or lose cloud-committed event',async()=>{
      register('ackfail');await stage(change('ackfail'));
      await pool.query(`CREATE FUNCTION replication.fail_ack() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id='ackfail' AND NEW.ack_sequence>OLD.ack_sequence THEN RAISE EXCEPTION 'injected local storage failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER test_ack_failure BEFORE UPDATE ON replication.local_clock FOR EACH ROW EXECUTE FUNCTION replication.fail_ack();`);
      assert.equal(await drain(),0);assert.equal((await history('ackfail')).length,1);assert.equal((await local('ackfail')).ack_sequence,'0');
      await pool.query('DROP TRIGGER test_ack_failure ON replication.local_clock');assert.equal(await drain(),1);assert.equal((await history('ackfail')).length,1);assert.equal((await local('ackfail')).ack_sequence,'1');
    });
    await t.test('forged ACK, poison revision, bounded retry/DLQ and explicit authorized replay',async()=>{
      let forge=true;
      register('badack',async m=>{const ack=await receiver.receive(m);return forge?signBody('ack',{...ack.body,sequence:'999'},key):ack;});
      await stage(change('badack'));assert.equal(await drain(),0);assert.equal((await local('badack')).ack_sequence,'0');assert.equal((await outbox('badack'))[0].state,'DEAD_LETTER');
      forge=false;await assert.rejects(service.replay({tenantId:'badack',subjectId:'denied'},'reason'),/FORBIDDEN/);
      await service.replay(actor('badack'),'ack-investigated');assert.equal(await drain(),1);
      register('poison');await stage(change('poison'));await stage(change('poison','event-2','1',{operation:'CORRECTION',supersedes:'event-1'}));
      await drain(2);assert.equal((await local('poison')).ack_sequence,'1');assert.equal((await outbox('poison'))[1].state,'DEAD_LETTER');assert.equal((await history('poison')).length,1);
      register('exhausted',async()=>{throw Error('outage');},{maxAttempts:2});await stage(change('exhausted'));await drain();
      const waiting=(await outbox('exhausted'))[0];assert.equal(waiting.state,'RETRY_WAIT');
      const sent=(await pool.query("SELECT recorded_at FROM replication.journal WHERE tenant_id='exhausted' AND action='SENDING'")).rows[0].recorded_at;
      assert.ok(waiting.next_attempt_at.getTime()-sent.getTime()>=999,'persisted exponential retry delay');
      await drain();
      assert.equal((await outbox('exhausted'))[0].cycle_attempts,2);assert.equal((await outbox('exhausted'))[0].state,'DEAD_LETTER');
      assert.equal((await service.status(actor('exhausted'))).dead_letters,1);
    });
    await t.test('timeout abort/later completion cannot create Local ACK or business writes',async()=>{
      let aborted=false,lateResult;
      register('timeout',async(m,signal)=>new Promise(resolve=>{signal.addEventListener('abort',()=>{aborted=true;lateResult=receiver.receive(m).then(resolve);});}),{timeoutMs:10});
      await stage(change('timeout'));await drain();await lateResult;assert.equal((await history('timeout')).length,1);assert.equal(aborted,true);assert.equal((await local('timeout')).ack_sequence,'0');
      assert.equal((await outbox('timeout'))[0].last_error,'TIMEOUT');
      await assert.rejects(cloud.query("INSERT INTO org.tenant(id,code,name,timezone,created_by) VALUES($1,'cloud-write','bad','UTC',$2)",[randomUUID(),randomUUID()]),/permission denied/);
      assert.equal((await cloud.query('SELECT current_database() AS name')).rows[0].name,'agro_cloud');
    });
    await t.test('WP016 real transactional capture exports only catalog org metadata; excludes identity',async()=>{
      const consumer=new ReplicationConsumer(service), tenant=randomUUID(), entity=randomUUID(), event=randomUUID(), actorId=randomUUID();
      register(tenant);
      await pool.query('INSERT INTO org.tenant(id,code,name,timezone,created_by) VALUES($1,$2,$3,$4,$5)',[tenant,'replica-capture','Local authoritative','UTC',actorId]);
      const timestamp='2026-11-01T00:00:00.000Z';
      const metadata={eventId:event,entityId:entity,entityType:'organization_unit',tenantId:tenant,actorId,correlationId:'wp024',causationId:'command',occurredAt:timestamp};
      await pool.query(`INSERT INTO org.outbox_event(id,tenant_id,event_name,event_version,producer,entity_type,entity_id,correlation_id,causation_id,occurred_at,payload) VALUES($1,$2,'org.unit.created','1.0.0','org','organization_unit',$3,'wp024','command',$4,$5)`,[event,tenant,entity,timestamp,metadata]);
      const dispatcher=new OutboxDispatcherService(pool,[consumer],new InboxService(pool));await dispatcher.dispatchAvailable();
      assert.equal((await outbox(tenant)).length,1);await drain();assert.equal((await history(tenant))[0].change.payload.entityId,entity);
      await consumer.handle({}, {source:'identity',producer:'identity',eventName:'security.session_created',eventVersion:'1.0.0',payload:{secret:'must-never-export'}});
      assert.equal((await pool.query('SELECT name FROM org.tenant WHERE id=$1',[tenant])).rows[0].name,'Local authoritative');
    });
    await admin.end();
    t.diagnostic(JSON.stringify({scenario:'WP49-024',clock:'2026-11-01T00:00:00Z',numericEvents:12,lostAckResumed:true,cloudRollback:true,localAckRollback:true,correctionHistory:true,tombstone:true,cloudAuthoritativeWriteRejected:true}));
  } finally {
    if(restartedPool)await restartedPool.end();
    if(rebuilt)await rebuilt.end();
    if(cloud)await cloud.end();
    if(pool)await pool.end();
    if(started)docker(['rm','--force',container]);
    if(previousMode===undefined)delete process.env.AGRO_DEPLOYMENT_MODE;else process.env.AGRO_DEPLOYMENT_MODE=previousMode;
  }
});
