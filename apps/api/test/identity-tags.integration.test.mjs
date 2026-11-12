import 'reflect-metadata';
import {Module} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {hash,Algorithm} from '@node-rs/argon2';
import {IdentityService} from '../dist/modules/identity/identity.service.js';
import {IdentityTagsService} from '../dist/modules/identity-tags/identity-tags.service.js';
import {IdentityTagsRegistry} from '../dist/modules/identity-tags/identity-tags.registry.js';
import {IdentityTagsController} from '../dist/modules/identity-tags/identity-tags.controller.js';
import {encodePayload} from '../dist/modules/identity-tags/identity-tags.payload.js';
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
test('QR: authorized Material identity, durable issuance and immutable provenance', {timeout:180000}, async (t) => {
  const container = `agro-wp49-030-qr-${process.pid}`;
  const password = 'wp49_030_ephemeral_test_only';
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'agro-master-data-integration-'));
  const psqlWrapper = join(temporaryDirectory, 'psql');
  let pool, app;
  const savedEnv={...process.env};
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


    const tenantId=randomUUID(),otherTenant=randomUUID(),subjectId=randomUUID();
    const actor={tenantId,subjectId},other={tenantId:otherTenant,subjectId};
    process.env.DATABASE_URL=databaseUrl;
    process.env.AUTH_JWT_SIGNING_KEY=Buffer.alloc(32,11).toString('base64');
    process.env.AUTH_AUDIT_HMAC_KEY=Buffer.alloc(32,12).toString('base64');
    await pool.query("INSERT INTO org.tenant(id,code,name,timezone,created_by) VALUES($1,'QR-A','Fixture A','UTC',$3),($2,'QR-B','Fixture B','UTC',$3)",[tenantId,otherTenant,subjectId]);
    const masterRegistry=new MasterDataRegistry();let ownerAllowed=true;
    masterRegistry.installPolicy(async(a)=>ownerAllowed&&[tenantId,otherTenant].includes(a.tenantId));
    masterRegistry.registerSourcePolicy({tenantId,version:1,dataOwnerId:subjectId,stewardId:subjectId,fields:{}});
    const master=new MasterDataService(pool,masterRegistry,new IntegrationsService(pool,new IntegrationsRegistry()));
    const context=()=>({idempotencyKey:randomUUID(),correlationId:'qr-fixed-scenario',causationId:'manual-fixture'});
    const unit=await master.createUnit(actor,{code:'EA',name:'Count',dimension:'COUNT',precision:0},context());
    const material=await master.createMaterial(actor,{code:'QR-M1',name:'QR fixture material',itemType:'FINISHED',baseUom:'EA'},context());
    const tagsRegistry=new IdentityTagsRegistry();let allowed=true;
    tagsRegistry.installPolicy(async()=>allowed);
    const tags=new IdentityTagsService(pool,tagsRegistry,master);
    const payload=encodePayload('Material',material.id);
    const key={idempotencyKey:'issue-fixture-1',correlationId:'qr-deterministic-1'};
    const identity=new IdentityService(pool);
    await pool.query('INSERT INTO identity.user_account(id,tenant_id,login,password_hash,mfa_required) VALUES($1,$2,$3,$4,false)',[subjectId,tenantId,'qr-fixture',await hash('qr-fixture-password',{algorithm:Algorithm.Argon2id,memoryCost:19456,timeCost:2,parallelism:1})]);
    const credentials=await identity.login({login:'qr-fixture',password:'qr-fixture-password',deviceId:randomUUID()});
    class TestModule{}
    Module({controllers:[IdentityTagsController],providers:[
      {provide:IdentityTagsService,useValue:{resolve:tags.resolve.bind(tags),issue:tags.issue.bind(tags)}},
      {provide:IdentityService,useValue:{authenticate:identity.authenticate.bind(identity)}}
    ]})(TestModule);
    app=await NestFactory.create(TestModule,{logger:false});await app.listen(0,'127.0.0.1');
    const base=await app.getUrl();
    const post=async(path,body,auth=credentials.accessToken,headers={})=>{
      const response=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:`Bearer ${auth}`} :{}),...headers},body:JSON.stringify(body)});
      return {status:response.status,body:await response.json()};
    };
    assert.equal((await post('/v1/qr/resolve',{payload},null)).status,401);
    assert.equal((await post('/v1/qr/resolve',{payload:'invalid'})).status,400);
    const resolved=await post('/v1/qr/resolve',{payload});assert.equal(resolved.status,200);assert.equal(resolved.body.name,material.name);
    assert.equal((await pool.query('SELECT count(*) FROM identity_tags.audit')).rows[0].count,'0','preview must not create audit spam');
    assert.equal((await tags.resolve(other,{payload})).status,'UNAVAILABLE','foreign IDs must not disclose existence');
    const issue=await post('/v1/qr-codes',{entityType:'Material',entityId:material.id},undefined,{'Idempotency-Key':key.idempotencyKey});
    assert.equal(issue.status,200);assert.equal(issue.body.payload,payload);
    const replay=await tags.issue(actor,{entityType:'Material',entityId:material.id},key);
    assert.equal(issue.body.qrCodeId,replay.qrCodeId);
    const concurrent=await Promise.all(Array.from({length:5},()=>tags.issue(actor,{entityType:'Material',entityId:material.id},{...key,idempotencyKey:'parallel'})));
    assert.equal(new Set(concurrent.map(v=>v.qrCodeId)).size,1);
    assert.equal((await pool.query('SELECT count(*) FROM identity_tags.tag')).rows[0].count,'2');
    ownerAllowed=false;assert.equal((await post('/v1/qr/resolve',{payload})).status,403);
    await assert.rejects(tags.issue(actor,{entityType:'Material',entityId:material.id},key),/QR_FORBIDDEN/);ownerAllowed=true;
    allowed=false;assert.equal((await post('/v1/qr/resolve',{payload})).status,403);allowed=true;
    await assert.rejects(tags.issue({...actor,subjectId:randomUUID()},{entityType:'Material',entityId:material.id},key),/QR_IDEMPOTENCY_CONFLICT/);
    const otherMaterial=await master.createMaterial(actor,{code:'QR-M2',name:'Other',itemType:'RAW',baseUom:'EA'},context());
    await assert.rejects(tags.issue(actor,{entityType:'Material',entityId:otherMaterial.id},key),/QR_IDEMPOTENCY_CONFLICT/);
    // A database failure after tag insert rolls back issuance, audit and event.
    await pool.query("CREATE FUNCTION identity_tags.test_abort() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture_abort'; END $$; CREATE TRIGGER fixture_abort BEFORE INSERT ON identity_tags.outbox_event FOR EACH STATEMENT EXECUTE FUNCTION identity_tags.test_abort()");
    await assert.rejects(tags.issue(actor,{entityType:'Material',entityId:material.id},{...key,idempotencyKey:'rollback'}),/fixture_abort/);
    await pool.query('DROP TRIGGER fixture_abort ON identity_tags.outbox_event');
    assert.equal((await pool.query('SELECT count(*) FROM identity_tags.tag')).rows[0].count,'2');
    for(const table of ['tag','audit','outbox_event'])await assert.rejects(pool.query(`UPDATE identity_tags.${table} SET tenant_id=tenant_id`),/QR_IMMUTABLE/);
    const contracts=await loadAndValidateContracts();
    for(const event of (await pool.query("SELECT payload FROM identity_tags.outbox_event")).rows)assert.deepEqual(contracts.events.events.find(e=>e.name==='qr_code.created').schema.required.filter(k=>!Object.hasOwn(event.payload,k)),[]);
    const seen=[];const inbox=new InboxService(pool);
    const dispatcher=new OutboxDispatcherService(pool,[{name:'qr-fixture',handle:async(_tx,event)=>{if(event.source==='identity-tags')seen.push(event.id);}}],inbox);
    await dispatcher.dispatchAvailable(100);await dispatcher.dispatchAvailable(100);
    assert.equal(new Set(seen).size,2);assert.equal(seen.length,2);
    const corrected=await master.correctMaterial(actor,material.id,{expectedVersion:'1',reason:'Rename retains identity',patch:{name:'Renamed'}},context());
    assert.equal((await tags.resolve(actor,{payload})).name,'Renamed');
    await master.correctMaterial(actor,material.id,{expectedVersion:corrected.rowVersion,reason:'Archive fixture',patch:{active:false}},context());
    assert.equal((await tags.resolve(actor,{payload})).status,'UNAVAILABLE');
    await assert.rejects(tags.issue(actor,{entityType:'Material',entityId:material.id},key),/UNAVAILABLE/);
    assert.equal((await pool.query('SELECT count(*) FROM identity_tags.audit')).rows[0].count,'2');
    await identity.logout(await identity.authenticate(`Bearer ${credentials.accessToken}`));
    assert.equal((await post('/v1/qr/resolve',{payload})).status,401);
  } finally {
    await app?.close();
    for(const key of ['DATABASE_URL','AUTH_JWT_SIGNING_KEY','AUTH_AUDIT_HMAC_KEY','AGRO_DEPLOYMENT_MODE']){if(savedEnv[key]===undefined)delete process.env[key];else process.env[key]=savedEnv[key];}
    await pool?.end();if(started)assertCommand(docker(['stop',container]),'Fixture cleanup');
  }
});
