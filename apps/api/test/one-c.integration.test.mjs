import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';

import { OneCService } from '../dist/modules/integrations/1c/one-c.service.js';
import { MockOneCAdapter } from '../dist/modules/integrations/1c/one-c.mock.js';
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

test('1C mock-backed PostgreSQL exchange and durable reconciliation deterministic demo', {timeout:180000}, async(t)=>{
  const container = `agro-wp49-022-one-c-${process.pid}`;
  const password = 'wp49_022_ephemeral_test_only';
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
    assert.match(migration.stdout, /migration 9 applied/);
    phase('migration v9 applied');


    process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
    let registry=new IntegrationsRegistry();
    const actor={tenantId:randomUUID(),subjectId:randomUUID()};
    let permitted=true,ownerPermitted=true,failOwner=false,mode='ok',submits=0,reconciles=0;
    registry.installPolicy(async(a)=>permitted&&a.subjectId===actor.subjectId&&a.tenantId===actor.tenantId);
    const faults={
      async beforeSubmit(){submits++;if(mode==='down')throw new ConnectorError('TEMPORARY');if(mode==='rejected')throw new ConnectorError('VALIDATION');},
      async afterSubmit(){if(mode==='lost'){mode='ok';throw new ConnectorError('TIMEOUT');}},
      async beforeReconcile(){reconciles++;if(mode==='unknown')throw new ConnectorError('TIMEOUT');},
    };
    registry.registerAdapter(new MockOneCAdapter(pool,faults));
    let framework=new IntegrationsService(pool,registry);
    let service=new OneCService(pool,registry,framework);
    await pool.query(`CREATE SCHEMA one_c_fixture;
      CREATE TABLE one_c_fixture.projection(tenant_id uuid,id text,accounting_code text,version integer NOT NULL,PRIMARY KEY(tenant_id,id));
      CREATE TABLE one_c_fixture.audit(job_id uuid PRIMARY KEY);
      CREATE TABLE one_c_fixture.outbox(job_id uuid PRIMARY KEY);
      CREATE TABLE one_c_fixture.operational_fact(id uuid PRIMARY KEY,status text NOT NULL);`);
    service.registerOwner({operation:'FixtureAccountingProjection',
      async validate(tx,a,e,m){
        if(!ownerPermitted||a.tenantId!==e.tenantId)throw Error('OWNER_DENIED');
        const row=(await tx.query('SELECT version FROM one_c_fixture.projection WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[a.tenantId,e.localId])).rows[0];
        if((row?.version??0)!==m.sourceVersion-1)throw Error('STALE_VERSION');
      },
      async execute(tx,a,e,m){
        await tx.query(`INSERT INTO one_c_fixture.projection VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,id) DO UPDATE SET accounting_code=$3,version=$4`,[a.tenantId,e.localId,m.accountingCode,m.sourceVersion]);
        for(const table of ['audit','outbox'])await tx.query(`INSERT INTO one_c_fixture.${table} VALUES($1)`,[e.id]);
        if(failOwner)throw new ConnectorError('TEMPORARY');return {projectionId:e.localId};
      }
    });
    const retry={maxAttempts:3,baseDelayMs:10,maxDelayMs:50,jitter:0,timeoutMs:1000};
    const pIn={id:'one-c-accounting',adapter:'ONE_C_MOCK',version:1,schemaVersion:'one-c-mock/1',mapping:[{from:['code'],to:'accountingCode',required:true},{from:['version'],to:'sourceVersion',required:true}],retry};
    const attr=(type,aspect='ACCOUNTING',authority='ONE_C',direction='IN')=>({type,aspect,authority,direction,required:true});
    const bIn={profileId:pIn.id,profileVersion:1,direction:'INBOUND',operation:'FixtureAccountingProjection',entityType:'Material',fields:{accountingCode:attr('string'),sourceVersion:attr('number')}};
    const pOut={...pIn,id:'one-c-consumption',mapping:[{from:['quantity'],to:'quantity',required:true},{from:['state'],to:'closedFact',required:true,dictionary:{CLOSED:true}}]};
    const bOut={...bIn,profileId:pOut.id,direction:'OUTBOUND',operation:'FixtureClosedConsumption',entityType:'MaterialConsumption',fields:{quantity:attr('number','OPERATIONAL','PLATFORM','OUT'),closedFact:attr('boolean','OPERATIONAL','PLATFORM','OUT')}};
    await service.configure(actor,pIn,bIn);await service.configure(actor,pOut,bOut);
    const envelope=(direction='INBOUND',overrides={})=>{
      const id=randomUUID(),out=direction==='OUTBOUND';
      return {id,tenantId:actor.tenantId,profileId:out?pOut.id:pIn.id,profileVersion:1,direction,idempotencyKey:id,operation:out?bOut.operation:bIn.operation,entityType:out?bOut.entityType:bIn.entityType,localId:id,externalId:out?'':`1c-guid-${id}`,schemaVersion:'one-c-mock/1',observedAt:'2026-11-01T09:00:00Z',correlationId:'wp022-deterministic-demo',payload:out?{quantity:12,state:'CLOSED'}:{code:'AC-001',version:1},provenance:{source:'ONE_C_MOCK',sourceRow:'fixture-1'},...overrides};
    };
    const inspect=e=>framework.inspect(actor,e.id,e.profileId);
    const due=()=>pool.query("UPDATE integrations.job SET next_attempt_at=clock_timestamp() WHERE state IN ('RETRYING','SENDING','SENT')");
    const restart=()=>{
      const guardedOwner=registry.command(bIn.operation);registry=new IntegrationsRegistry();
      registry.installPolicy(async(a)=>permitted&&a.subjectId===actor.subjectId&&a.tenantId===actor.tenantId);
      registry.registerAdapter(new MockOneCAdapter(pool,faults));registry.registerCommand(guardedOwner);
      framework=new IntegrationsService(pool,registry);service=new OneCService(pool,registry,framework);
    };
    await t.test('import duplicates preserve mapped projection, single owner audit/outbox, external IDs and provenance',async()=>{
      const e=envelope();await Promise.all(Array.from({length:8},()=>service.stage(actor,e)));
      await Promise.all(Array.from({length:8},()=>framework.dispatchAvailable()));
      assert.equal((await inspect(e)).state,'ACCEPTED');
      const projection=(await pool.query('SELECT * FROM one_c_fixture.projection WHERE id=$1',[e.localId])).rows[0];
      assert.equal(projection.accounting_code,'AC-001');assert.equal(projection.version,1);
      for(const table of ['audit','outbox'])assert.equal((await pool.query(`SELECT count(*)::int n FROM one_c_fixture.${table} WHERE job_id=$1`,[e.id])).rows[0].n,1);
      const link=(await pool.query('SELECT * FROM integrations.external_link WHERE external_id=$1',[e.externalId])).rows[0];assert.equal(link.local_id,e.localId);
      const provenance=(await pool.query('SELECT provenance FROM integrations.link_revision WHERE job_id=$1',[e.id])).rows[0].provenance;
      assert.equal(provenance.sourceRow,'fixture-1');assert.equal(provenance.observedAt,e.observedAt);assert.equal(provenance.profileVersion,1);
      await assert.rejects(service.stage(actor,{...e,payload:{code:'changed',version:1}}),/IDEMPOTENCY_CONFLICT/);
    });
    await t.test('partial/type-invalid/unmapped input stages first and never reaches canonical writes',async()=>{
      for(const payload of [{version:1},{code:17,version:1},{code:'AC',version:'unknown'}]) {
        const e=envelope('INBOUND',{payload});await service.stage(actor,e);await framework.dispatchAvailable();
        assert.equal((await inspect(e)).state,'ACTION_REQUIRED');
        assert.equal((await pool.query('SELECT count(*)::int n FROM one_c_fixture.projection WHERE id=$1',[e.localId])).rows[0].n,0);
        assert.equal((await pool.query("SELECT count(*)::int n FROM integrations.audit_entry WHERE job_id=$1 AND action='STAGED'",[e.id])).rows[0].n,1);
      }
    });
    await t.test('unknown schema is staged into DLQ and owner denial rejects despite connector permission',async()=>{
      const schema=envelope('INBOUND',{schemaVersion:'unknown-mock-version'});await service.stage(actor,schema);await framework.dispatchAvailable();
      assert.equal((await inspect(schema)).state,'DEAD_LETTER');assert.equal((await inspect(schema)).last_error,'SCHEMA_CHANGED');
      const denied=envelope();ownerPermitted=false;await service.stage(actor,denied);await framework.dispatchAvailable();ownerPermitted=true;
      assert.equal((await inspect(denied)).state,'ACTION_REQUIRED');
      assert.equal((await pool.query('SELECT count(*)::int n FROM one_c_fixture.projection WHERE id=$1',[denied.localId])).rows[0].n,0);
    });
    await t.test('owner rollback then restarted retry is atomic; stale version and GUID collision cannot overwrite',async()=>{
      const e=envelope();failOwner=true;await service.stage(actor,e);await framework.dispatchAvailable();assert.equal((await inspect(e)).state,'RETRYING');
      for(const table of ['audit','outbox'])assert.equal((await pool.query(`SELECT count(*)::int n FROM one_c_fixture.${table} WHERE job_id=$1`,[e.id])).rows[0].n,0);
      assert.equal((await pool.query('SELECT count(*)::int n FROM one_c_fixture.projection WHERE id=$1',[e.localId])).rows[0].n,0);
      failOwner=false;restart();await due();await framework.dispatchAvailable();assert.equal((await inspect(e)).state,'ACCEPTED');
      const stale=envelope('INBOUND',{localId:e.localId,externalId:e.externalId,payload:{code:'WRONG',version:1}});await service.stage(actor,stale);await framework.dispatchAvailable();assert.equal((await inspect(stale)).state,'ACTION_REQUIRED');
      const collision=envelope('INBOUND',{externalId:e.externalId});await service.stage(actor,collision);await framework.dispatchAvailable();assert.equal((await inspect(collision)).state,'ACTION_REQUIRED');
      assert.equal((await pool.query('SELECT accounting_code FROM one_c_fixture.projection WHERE id=$1',[e.localId])).rows[0].accounting_code,'AC-001');
      assert.equal((await pool.query('SELECT count(*)::int n FROM one_c_fixture.projection WHERE id=$1',[collision.localId])).rows[0].n,0);
    });
    await t.test('export is mapped and mock-idempotent with stable external GUID after concurrent duplicates',async()=>{
      const e=envelope('OUTBOUND');const before=submits;await Promise.all(Array.from({length:8},()=>service.stage(actor,e)));await Promise.all(Array.from({length:8},()=>framework.dispatchAvailable()));
      assert.equal((await inspect(e)).state,'ACCEPTED');assert.equal(submits,before+1);
      const row=(await pool.query('SELECT * FROM integrations.one_c_mock_receipt WHERE idempotency_key=$1',[e.idempotencyKey])).rows[0];
      assert.equal(row.result.metadata.mock,true);assert.equal(row.result.metadata.postingStatus,'MOCK_ACCEPTED');
      assert.equal((await inspect(e)).result.externalId,row.result.externalId);
      const adapter=new MockOneCAdapter(pool),ctx={tenantId:actor.tenantId,profileId:pOut.id,jobId:e.id,idempotencyKey:e.idempotencyKey,correlationId:e.correlationId,signal:new AbortController().signal};
      assert.deepEqual(await adapter.submit({quantity:12,closedFact:true},ctx),row.result);
      await assert.rejects(adapter.submit({quantity:99,closedFact:true},ctx),/IDEMPOTENCY_CONFLICT/);
      const invalid=envelope('OUTBOUND',{payload:{quantity:1,state:'OPEN'}});await service.stage(actor,invalid);await framework.dispatchAvailable();assert.equal((await inspect(invalid)).state,'ACTION_REQUIRED');
    });
    await t.test('lost mock response survives full adapter/service recreation and reconciles without resend',async()=>{
      const e=envelope('OUTBOUND');mode='lost';const before=submits;await service.stage(actor,e);await framework.dispatchAvailable();assert.equal((await inspect(e)).state,'RETRYING');
      restart();const fresh=new MockOneCAdapter(pool);const ctx={tenantId:actor.tenantId,profileId:pOut.id,jobId:e.id,idempotencyKey:e.idempotencyKey,correlationId:e.correlationId,signal:new AbortController().signal};
      assert.equal((await fresh.reconcile(ctx)).status,'ACCEPTED');
      await due();await framework.dispatchAvailable();assert.equal((await inspect(e)).state,'ACCEPTED');assert.equal(submits,before+1);assert.ok(reconciles>0);
    });
    await t.test('1C down leaves local operational writes working; retry exhaustion/DLQ and reasoned replay',async()=>{
      const e=envelope('OUTBOUND');mode='down';await service.stage(actor,e);await framework.dispatchAvailable();assert.equal((await inspect(e)).state,'RETRYING');
      // Separate local operational transaction succeeds while integration remains unavailable.
      await pool.query("INSERT INTO one_c_fixture.operational_fact VALUES($1,'CLOSED')",[e.id]);
      for(let i=0;i<2;i++){await due();await framework.dispatchAvailable();}
      assert.equal((await inspect(e)).state,'DEAD_LETTER');
      assert.equal((await pool.query('SELECT status FROM one_c_fixture.operational_fact WHERE id=$1',[e.id])).rows[0].status,'CLOSED');
      mode='ok';await framework.replay(actor,e.id,e.profileId,'mock provider restored');await framework.dispatchAvailable();assert.equal((await inspect(e)).state,'ACCEPTED');assert.equal((await inspect(e)).attempts,4);
    });
    await t.test('unknown crash outcome never resends; external rejection never deletes local fact',async()=>{
      const e=envelope('OUTBOUND');await service.stage(actor,e);await pool.query("UPDATE integrations.job SET state='SENDING',unknown_outcome=true WHERE id=$1",[e.id]);
      mode='unknown';const before=submits;await framework.dispatchAvailable();assert.equal(submits,before);assert.equal((await inspect(e)).state,'RETRYING');
      mode='ok';await due();await framework.dispatchAvailable();assert.equal((await inspect(e)).state,'ACCEPTED');assert.equal(submits,before+1);
      const rejected=envelope('OUTBOUND');await pool.query("INSERT INTO one_c_fixture.operational_fact VALUES($1,'CLOSED')",[rejected.id]);mode='rejected';await service.stage(actor,rejected);await framework.dispatchAvailable();
      assert.equal((await inspect(rejected)).state,'ACTION_REQUIRED');assert.equal((await pool.query('SELECT status FROM one_c_fixture.operational_fact WHERE id=$1',[rejected.id])).rows[0].status,'CLOSED');mode='ok';
    });
    await t.test('reconciliation stores GUID/total/version differences, duplicate observations and restart retain evidence',async()=>{
      const local={externalId:'guid-original',total:'12.000',modifiedVersion:'v1'};
      const external={externalId:'guid-changed',total:'13.000',modifiedVersion:'v2'};
      const observation={key:'catalog-mismatch-1',local,external,observedAt:'2026-11-01T09:00:00Z',correlationId:'wp022-reconcile'};
      const before=(await pool.query('SELECT count(*)::int n FROM one_c_fixture.projection')).rows[0].n;
      const rows=await Promise.all(Array.from({length:8},()=>service.reconcile(actor,pIn.id,1,observation)));
      assert.ok(rows.every(r=>r.id===rows[0].id));assert.deepEqual(rows[0].differences,['GUID_MISMATCH','TOTAL_MISMATCH','VERSION_MISMATCH']);assert.equal(rows[0].state,'OPEN');
      assert.equal((await pool.query('SELECT count(*)::int n FROM integrations.one_c_reconciliation_outbox WHERE reconciliation_id=$1',[rows[0].id])).rows[0].n,1);
      assert.equal((await pool.query("SELECT count(*)::int n FROM integrations.audit_entry WHERE action='ONE_C_RECONCILIATION' AND detail->>'reconciliationId'=$1",[rows[0].id])).rows[0].n,1);
      await assert.rejects(service.reconcile(actor,pIn.id,1,{...observation,external:local}),/IDEMPOTENCY_CONFLICT/);
      restart();assert.deepEqual((await service.observations(actor,pIn.id))[0].observation,observation);
      assert.equal((await pool.query('SELECT count(*)::int n FROM one_c_fixture.projection')).rows[0].n,before);
      for(const [key,a,b,expected] of [['match',local,local,[]],['missing-external',local,null,['MISSING_EXTERNAL']],['missing-local',null,external,['MISSING_LOCAL']]]) {
        const row=await service.reconcile(actor,pIn.id,1,{...observation,key,local:a,external:b});assert.deepEqual(row.differences,expected);assert.equal(row.state,expected.length?'OPEN':'MATCHED');
      }
    });
    await t.test('immutable bindings, profile upgrades, tenant/policy/cloud negatives and retained history',async()=>{
      const e=envelope();await service.stage(actor,e);
      await service.configure(actor,{...pIn,version:2},{...bIn,profileVersion:2});await framework.dispatchAvailable();assert.equal((await inspect(e)).state,'ACCEPTED');
      await assert.rejects(service.configure(actor,pIn,{...bIn,fields:{...bIn.fields,accountingCode:{...bIn.fields.accountingCode,required:false}}}),/IMMUTABLE/);
      await assert.rejects(service.configure(actor,{...pIn,id:'bad-sot'},{...bIn,profileId:'bad-sot',fields:{accountingCode:attr('string','OPERATIONAL')}}),/SOT/);
      await assert.rejects(service.stage(actor,envelope('OUTBOUND',{operation:'UnboundCommand'})),/BINDING/);
      const queued=envelope();await service.stage(actor,queued);permitted=false;await framework.dispatchAvailable();
      await assert.rejects(service.observations(actor,pIn.id),/FORBIDDEN/);await assert.rejects(service.stage(actor,envelope()),/FORBIDDEN/);permitted=true;assert.equal((await inspect(queued)).state,'ACTION_REQUIRED');
      const other={...actor,tenantId:randomUUID()};await assert.rejects(service.observations(other,pIn.id),/FORBIDDEN/);await assert.rejects(service.stage(other,envelope()),/FORBIDDEN/);
      // Authorized second tenant still sees no first-tenant observations or binding.
      const isolated=new IntegrationsRegistry();isolated.installPolicy(async()=>true);
      const isolatedService=new OneCService(pool,isolated,framework);assert.deepEqual(await isolatedService.observations(other,pIn.id),[]);
      await assert.rejects(isolatedService.stage(other,{...envelope(),tenantId:other.tenantId}),/BINDING/);
      process.env.AGRO_DEPLOYMENT_MODE='CLOUD';await assert.rejects(service.reconcile(actor,pIn.id,1,{key:'x'}),/LOCAL_PRIMARY/);await assert.rejects(service.stage(actor,envelope()),/LOCAL_PRIMARY/);process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
      for(const table of ['one_c_binding','one_c_mock_receipt','one_c_reconciliation','one_c_reconciliation_outbox'])await assert.rejects(pool.query(`DELETE FROM integrations.${table}`),/immutable/);
    });
    phase('all 1C exchange/reconciliation failure-injection assertions passed');
  } finally {
    if(pool)await pool.end();
    if(started)docker(['rm','--force',container]);
  }
});
