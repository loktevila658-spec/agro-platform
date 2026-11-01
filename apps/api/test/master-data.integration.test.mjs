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

import { MasterDataRegistry } from '../dist/modules/master-data/master-data.registry.js';
import { MasterDataService } from '../dist/modules/master-data/master-data.service.js';
import { IntegrationsRegistry } from '../dist/modules/integrations/integrations.registry.js';
import { IntegrationsService } from '../dist/modules/integrations/integrations.service.js';
import { OneCService } from '../dist/modules/integrations/1c/one-c.service.js';
import { MockOneCAdapter } from '../dist/modules/integrations/1c/one-c.mock.js';
import { loadAndValidateContracts } from '../../../packages/contracts/scripts/lib/contracts.mjs';
test('master-data: canonical references, field SoT, immutable correction and shared mappings', {timeout:180000}, async (t) => {
  const container = `agro-wp49-025-master-data-${process.pid}`;
  const password = 'wp49_025_ephemeral_test_only';
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'agro-master-data-integration-'));
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
    assert.match(migration.stdout, /migration 11 applied/);


    const tenantId=randomUUID(),otherTenant=randomUUID(),subjectId=randomUUID(),organizationId=randomUUID();
    const actor={tenantId,subjectId},other={tenantId:otherTenant,subjectId};
    await pool.query("INSERT INTO org.tenant(id,code,name,timezone,created_by) VALUES($1,'MD-A','Fixture A','UTC',$3),($2,'MD-B','Fixture B','UTC',$3)",[tenantId,otherTenant,subjectId]);
    await pool.query("INSERT INTO org.organization(id,tenant_id,code,name,organization_type,created_by) VALUES($1,$2,'ORG','Fixture organization','LEGAL_ENTITY',$3)",[organizationId,tenantId,subjectId]);
    const registry=new MasterDataRegistry(),integrationRegistry=new IntegrationsRegistry();
    let allowed=true,externalAllowed=true;
    registry.installPolicy(async(a,action)=>allowed&&a.subjectId===subjectId&&[tenantId,otherTenant].includes(a.tenantId)&&(action!=='master-data.external'||externalAllowed));
    integrationRegistry.installPolicy(async(a)=>allowed&&a.subjectId===subjectId&&[tenantId,otherTenant].includes(a.tenantId));
    const policy=id=>({tenantId:id,version:1,dataOwnerId:subjectId,stewardId:subjectId,fields:{'Material.accountingCode':{master:'EXTERNAL_SYSTEM',source:'ONE_C',profileId:'fixture-codes',profileVersion:1}}});
    registry.registerSourcePolicy(policy(tenantId));registry.registerSourcePolicy(policy(otherTenant));
    const integrations=new IntegrationsService(pool,integrationRegistry),service=new MasterDataService(pool,registry,integrations);
    const context=(key=randomUUID())=>({idempotencyKey:key,correlationId:'wp025-fixed-demo',causationId:'wp025-command'});
    const u={code:'fixture-count',name:'Fixture count',dimension:'COUNT',precision:0};
    const material={code:'fixture-material',name:'Fixture material',itemType:'RAW',baseUom:u.code};
    let unit,created,product;
    await t.test('tenant codes, product reuse, replay, collision and scope constraints',async()=>{
      const key=context('create-unit');const results=await Promise.all([service.createUnit(actor,u,key),service.createUnit(actor,u,key)]);
      assert.deepEqual(results[0],results[1]);unit=results[0];assert.equal(unit.rowVersion,'1');assert.match(unit.id,/-7[0-9a-f]{3}-/);
      await service.createUnit(other,u,context());
      await assert.rejects(service.createUnit(actor,{...u,name:'Different'},key),/IDEMPOTENCY/);
      await assert.rejects(service.createUnit(actor,u,context()),/DUPLICATE/);
      created=await service.createMaterial(actor,material,context('create-material'));
      product=await service.createMaterial(actor,{...material,code:'fixture-product',itemType:'FINISHED'},context());
      assert.equal((await service.read(actor,'Material',product.id)).itemType,'FINISHED');
      await service.createMaterial(actor,{...material,organizationId},context());
      await service.createMaterial(other,material,context());
      await assert.rejects(service.createMaterial(other,{...material,code:'wrong-org',organizationId},context()),/RELATIONSHIP/);
      await assert.rejects(service.createMaterial(actor,{...material,code:'missing-unit',baseUom:'missing'},context()),/UNIT/);
      await assert.rejects(service.read(other,'Material',created.id),/NOT_FOUND/);
      await assert.rejects(service.createMaterial(actor,{...material,accountingCode:'unauthorized'},context()),/INVALID/);
      const race=await Promise.allSettled([service.createMaterial(actor,{...material,code:'race-code'},context()),service.createMaterial(actor,{...material,code:'race-code'},context())]);
      assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.match(race.find(x=>x.status==='rejected').reason.message,/DUPLICATE/);
    });
    await t.test('corrections retain history, reject stale versions and serialize concurrent changes',async()=>{
      await assert.rejects(service.correctMaterial(actor,created.id,{expectedVersion:'1',patch:{name:'bad'}},context()),/REASON/);
      const results=await Promise.allSettled(['one','two'].map(name=>service.correctMaterial(actor,created.id,{expectedVersion:'1',reason:'Fixture correction',patch:{name}},context())));
      assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
      assert.match(results.find(x=>x.status==='rejected').reason.message,/version|VERSION/);
      created=results.find(x=>x.status==='fulfilled').value;
      await assert.rejects(service.correctUnit(actor,unit.id,{expectedVersion:'1',reason:'Must not reinterpret',patch:{precision:3}},context()),/UNIT_IN_USE/);
      const h=await service.history(actor,'Material',created.id);assert.equal(h.length,2);assert.equal(h[0].snapshot.name,material.name);assert.equal(h[1].previous_revision,h[0].id);assert.equal(h[1].reason,'Fixture correction');
      for(const sql of ["UPDATE master_data.revision SET reason='tamper'","DELETE FROM master_data.revision","TRUNCATE master_data.revision","TRUNCATE master_data.material","DELETE FROM master_data.material"])await assert.rejects(pool.query(sql),/immutable|IMMUTABLE|delete|DELETE/);
      const archived=await service.correctMaterial(actor,product.id,{expectedVersion:'1',reason:'Fixture deactivation',patch:{active:false}},context());assert.equal(archived.active,false);assert.equal((await service.history(actor,'Material',product.id)).length,2);
    });
    await t.test('audit/outbox failure rolls back authoritative state, receipt and revision',async()=>{
      const before=await pool.query('SELECT count(*)::int AS n FROM master_data.revision');
      await pool.query("CREATE FUNCTION master_data.fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture outbox failure'; END $$; CREATE TRIGGER fixture_fail BEFORE INSERT ON master_data.outbox_event FOR EACH ROW EXECUTE FUNCTION master_data.fixture_fail()");
      await assert.rejects(service.createMaterial(actor,{...material,code:'rollback'},context('rollback')));
      await pool.query('DROP TRIGGER fixture_fail ON master_data.outbox_event');
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM master_data.material WHERE code='rollback'")).rows[0].n,0);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM master_data.command_idempotency WHERE idempotency_key='rollback'")).rows[0].n,0);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM master_data.revision')).rows[0].n,before.rows[0].n);
      await pool.query("CREATE TRIGGER fixture_fail BEFORE INSERT ON master_data.revision FOR EACH ROW EXECUTE FUNCTION master_data.fixture_fail()");
      await assert.rejects(service.createMaterial(actor,{...material,code:'audit-rollback'},context('audit-rollback')));
      await pool.query('DROP TRIGGER fixture_fail ON master_data.revision');
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM master_data.material WHERE code='audit-rollback'")).rows[0].n,0);
    });
    await t.test('default deny, revoked replay permission and cloud writes fail',async()=>{
      const denied=new MasterDataService(pool,new MasterDataRegistry(),integrations);
      await assert.rejects(denied.read(actor,'Material',created.id),/FORBIDDEN/);
      allowed=false;await assert.rejects(service.createMaterial(actor,material,context('create-material')),/FORBIDDEN/);allowed=true;
      process.env.AGRO_DEPLOYMENT_MODE='CLOUD';await assert.rejects(service.createMaterial(actor,material,context()),/LOCAL_PRIMARY/);process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
    });
    await t.test('mock-backed external field projection uses existing mappings without changing canonical identity',async()=>{
      integrationRegistry.registerAdapter(new MockOneCAdapter(pool,{}));
      const oneC=new OneCService(pool,integrationRegistry,integrations);oneC.registerOwner(service.externalCommand());
      const profile={id:'fixture-codes',adapter:'ONE_C_MOCK',version:1,schemaVersion:'one-c-mock/1',mapping:[{from:['code'],to:'accountingCode',required:true},{from:['version'],to:'expectedVersion',required:true},{from:['reason'],to:'reason',required:true}],retry:{maxAttempts:2,baseDelayMs:1,maxDelayMs:10,jitter:0,timeoutMs:2000}};
      const fields=Object.fromEntries(['accountingCode','expectedVersion','reason'].map(name=>[name,{aspect:name==='accountingCode'?'ACCOUNTING':'REFERENCE',authority:'ONE_C',direction:'IN',type:'string',required:true}]));
      await oneC.configure(actor,profile,{profileId:profile.id,profileVersion:1,direction:'INBOUND',operation:'master-data.apply-external',entityType:'Material',fields});
      const env=(externalId,localId=created.id,version=created.rowVersion,code='fixture-accounting')=>({id:randomUUID(),tenantId,profileId:profile.id,profileVersion:1,direction:'INBOUND',idempotencyKey:randomUUID(),operation:'master-data.apply-external',entityType:'Material',localId,externalId,schemaVersion:'one-c-mock/1',observedAt:'2026-11-02T00:00:00Z',correlationId:'wp025-fixed-demo',payload:{code,version,reason:'Fixture external projection'},provenance:{importBatch:'fixture-batch',fileHash:'a'.repeat(64),sourceRow:'fixture-row'}});
      const first=env('fixture-guid-old');await oneC.stage(actor,first);await integrations.dispatchAvailable();assert.equal((await integrations.inspect(actor,first.id,profile.id)).state,'ACCEPTED');
      const after=await service.read(actor,'Material',created.id);assert.equal(after.id,created.id);assert.equal(after.name,created.name);assert.equal(after.accountingCode,'fixture-accounting');assert.equal(after.rowVersion,'3');
      await oneC.stage(actor,first);await integrations.dispatchAvailable();assert.equal((await service.history(actor,'Material',created.id)).length,3);
      const second=env('fixture-guid-new',created.id,after.rowVersion,'fixture-accounting-new');await oneC.stage(actor,second);await integrations.dispatchAvailable();assert.equal((await integrations.inspect(actor,second.id,profile.id)).state,'ACCEPTED');
      const refs=await service.externalReferences(actor,'Material',created.id,profile.id);assert.deepEqual(refs.map(x=>x.external_id).sort(),['fixture-guid-new','fixture-guid-old']);
      assert.equal((await integrations.resolveExternalReference(actor,profile.id,'Material','fixture-guid-old')).local_id,created.id);
      assert.equal(await integrations.resolveExternalReference(other,profile.id,'Material','fixture-guid-old'),undefined);
      const collision=env('fixture-guid-old',product.id,'2','collision');await oneC.stage(actor,collision);await integrations.dispatchAvailable();assert.equal((await integrations.inspect(actor,collision.id,profile.id)).state,'ACTION_REQUIRED');assert.equal((await service.read(actor,'Material',product.id)).rowVersion,'2');
      const h=await service.history(actor,'Material',created.id);assert.equal(h[2].provenance.source,'ONE_C');assert.equal(h[2].provenance.importBatch,'fixture-batch');assert.equal(h[2].provenance.fileHash,'a'.repeat(64));
      const port=service.externalCommand(),tx=await pool.connect();
      try {await assert.rejects(port.execute(tx,actor,env('autocommit'),{expectedVersion:'4',reason:'x',accountingCode:'x'}),/transaction|TRANSACTION|SAVEPOINT/);}finally{tx.release();}
      const apply=async(e,m)=>{const tx=await pool.connect();try{await tx.query('BEGIN');await port.execute(tx,actor,e,m);await tx.query('COMMIT');}catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}};
      await assert.rejects(apply(env('wrong-source'),{expectedVersion:'4',reason:'x',name:'external-overwrite'}),/SOURCE|INVALID/);
      await assert.rejects(apply({...env('wrong-profile'),profileId:'other'}, {expectedVersion:'4',reason:'x',accountingCode:'x'}),/SOURCE/);
      externalAllowed=false;await assert.rejects(apply(env('revoked'),{expectedVersion:'4',reason:'x',accountingCode:'x'}),/FORBIDDEN/);externalAllowed=true;
      await assert.rejects(apply({...env('cross-tenant'),tenantId:otherTenant},{expectedVersion:'4',reason:'x',accountingCode:'x'}),/FORBIDDEN|TENANT/);
    });
    await t.test('persisted field policy versions cannot be silently changed or downgraded after restart',async()=>{
      const changedRegistry=new MasterDataRegistry();changedRegistry.installPolicy(async()=>true);
      changedRegistry.registerSourcePolicy({...policy(tenantId),fields:{}});
      const changedService=new MasterDataService(pool,changedRegistry,integrations);
      await assert.rejects(changedService.correctUnit(actor,unit.id,{expectedVersion:'1',reason:'Conflicting policy',patch:{name:'must not commit'}},context()),/SOURCE_POLICY_IMMUTABLE/);
      assert.equal((await service.read(actor,'UnitOfMeasure',unit.id)).name,u.name);
      const upgradedRegistry=new MasterDataRegistry();upgradedRegistry.installPolicy(async()=>true);upgradedRegistry.registerSourcePolicy({...policy(tenantId),version:2});
      const upgradedService=new MasterDataService(pool,upgradedRegistry,integrations);
      await upgradedService.correctUnit(actor,unit.id,{expectedVersion:'1',reason:'Explicit policy version',patch:{name:'Fixture governed count'}},context());
      await assert.rejects(service.createMaterial(actor,{...material,code:'stale-policy'},context()),/SOURCE_POLICY_STALE/);
      for(const sql of ['UPDATE master_data.source_policy SET version=version','DELETE FROM master_data.source_policy','TRUNCATE master_data.source_policy'])await assert.rejects(pool.query(sql),/IMMUTABLE/);
    });
    await t.test('catalogued outbox dispatch is transactionally replay-safe',async()=>{
      const {events}=await loadAndValidateContracts();const catalog=new Map(events.events.map(e=>[e.name,e]));
      const rows=(await pool.query('SELECT * FROM master_data.outbox_event')).rows;assert.ok(rows.length>5);
      for(const event of rows){const def=catalog.get(event.event_name);assert.equal(def.producer,'master-data');assert.equal(event.event_version,def.version);assert.deepEqual(Object.keys(event.payload).sort(),def.schema.required.slice().sort());}
      await pool.query('CREATE TABLE master_data.fixture_consumer(event_id uuid PRIMARY KEY)');let fail=true;
      const handler={name:'wp025-fixture',async handle(tx,e){if(e.source!=='master-data')return;await tx.query('INSERT INTO master_data.fixture_consumer VALUES($1)',[e.id]);if(fail)throw Error('fixture failure');}};
      const dispatcher=new OutboxDispatcherService(pool,[handler],new InboxService(pool));await dispatcher.dispatchAvailable();assert.equal((await pool.query('SELECT count(*)::int AS n FROM master_data.fixture_consumer')).rows[0].n,0);
      fail=false;await pool.query("UPDATE platform_events.outbox_delivery SET next_attempt_at=clock_timestamp() WHERE source='master-data'");await dispatcher.dispatchAvailable();
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM master_data.fixture_consumer')).rows[0].n,rows.length);
      await pool.query("UPDATE platform_events.outbox_delivery SET delivered_at=NULL,next_attempt_at=clock_timestamp() WHERE source='master-data'");await dispatcher.dispatchAvailable();assert.equal((await pool.query('SELECT count(*)::int AS n FROM master_data.fixture_consumer')).rows[0].n,rows.length);
      await assert.rejects(pool.query('UPDATE master_data.outbox_event SET event_version=event_version'),/immutable|IMMUTABLE/);
    });
    console.log(JSON.stringify({scenario:'WP49-025',clock:'2026-11-02T00:00:00Z',canonicalProduct:true,tenantIsolation:true,atomicRollback:true,correctionHistory:true,externalFieldSoT:true,aliasesPreserved:true,inboxReplaySafe:true}));
  } finally {
    if(previousMode===undefined)delete process.env.AGRO_DEPLOYMENT_MODE;else process.env.AGRO_DEPLOYMENT_MODE=previousMode;
    await pool?.end();if(started)assertCommand(docker(['stop',container]),'Fixture cleanup');
  }
});
