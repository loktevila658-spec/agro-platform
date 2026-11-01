import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { ProvidersService } from '../dist/modules/providers/providers.service.js';
import { ProvidersModule } from '../dist/modules/providers/providers.module.js';
import { PROVIDER_CONTRACT, ProviderError } from '../dist/modules/providers/providers.contracts.v1.js';
import { IntegrationsRegistry } from '../dist/modules/integrations/integrations.registry.js';
import { AppModule } from '../dist/app.module.js';

const now='2026-11-01T12:00:00.000Z';
const actor={tenantId:'tenant-a',subjectId:'reader-a'};
const query={kind:'cadastre',cadastralNumber:'77:01:0001:1'};
const options={correlationId:'fixture-correlation',timeoutMs:20,maxAgeMs:3600000,now};
const descriptor={kind:'cadastre',provider:'fixture',apiVersion:'fixture/v1',contractVersion:PROVIDER_CONTRACT,access:'FILE_IMPORT',licenseRef:'fixture-license'};
const snapshot={contractVersion:PROVIDER_CONTRACT,kind:'cadastre',provider:'fixture',apiVersion:'fixture/v1',externalId:'external-1',sourceVersion:'opaque-1',sourceHash:'a'.repeat(64),capturedAt:'2026-10-30T12:00:00.000Z',processedAt:null,retrievedAt:now,data:{cadastralNumber:query.cadastralNumber,geometryStatus:'PENDING',geometryRef:null,sourceCrs:null,attributes:{areaM2:2000}}};
function setup(read=async()=>[structuredClone(snapshot)],policy=async()=>true) {
 const registry=new IntegrationsRegistry();registry.installPolicy(policy);
 const service=new ProvidersService(registry);service.register(actor.tenantId,'profile-a',descriptor,{read});
 return {service,registry};
}

test('compiled provider runtime is wired, exported and discovered by unchanged project CI',()=>{
 assert.ok(Reflect.getMetadata('imports',AppModule).includes(ProvidersModule));
 assert.ok(Reflect.getMetadata('exports',ProvidersModule).includes(ProvidersService));
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
 assert.match(pkg.scripts.test,/test\/\*\.test\.mjs/);
 for(const f of ['providers.service.ts','providers.validation.ts','providers.module.ts']) {
  const source=readFileSync(new URL('../src/modules/providers/'+f,import.meta.url),'utf8');
  assert.doesNotMatch(source,/\bfetch\(|node:https|node:http|https?:\/\/|\b(?:INSERT INTO|UPDATE|DELETE FROM)\b|registerCommand|OwnerCommand|from ['"]pg['"]/i);
 }
});

test('real Nest composition boots and closes with no provider or database prerequisite for this read facade',async()=>{
 const context=await NestFactory.createApplicationContext(ProvidersModule,{logger:false});
 try {
  assert.ok(context.get(ProvidersService) instanceof ProvidersService);
  assert.equal(context.get(IntegrationsRegistry).active(),false);
 }finally{await context.close();}
});

test('current READ policy defaults deny, tenant isolation and revocation apply before releasing evidence',async()=>{
 const env=process.env.AGRO_DEPLOYMENT_MODE;process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
 try {
  const denied=new ProvidersService(new IntegrationsRegistry());
  await assert.rejects(denied.read(actor,'profile-a',query,options),/FORBIDDEN/);
  let permitted=true,calls=0;
  const {service}=setup(async()=>{calls++;permitted=false;return [snapshot];},async(a,action,p)=>a.subjectId===actor.subjectId&&action==='READ'&&p==='profile-a'&&permitted);
  const other=await service.read({...actor,tenantId:'tenant-b'},'profile-a',query,options);
  assert.equal(other.error.code,'UNAVAILABLE');assert.equal(calls,0);
  await assert.rejects(service.read({...actor,subjectId:'other'},'profile-a',query,options),/FORBIDDEN/);
  await assert.rejects(service.read(actor,'profile-a',query,options),/FORBIDDEN/);
  assert.equal(calls,1);
  process.env.AGRO_DEPLOYMENT_MODE='CLOUD';
  await assert.rejects(service.read(actor,'profile-a',query,options),/LOCAL_PRIMARY/);
 }finally{if(env===undefined)delete process.env.AGRO_DEPLOYMENT_MODE;else process.env.AGRO_DEPLOYMENT_MODE=env;}
});

test('deterministic stale/missing/error/timeout scenario preserves source and leaves manual facts independent',async()=>{
 const env=process.env.AGRO_DEPLOYMENT_MODE;process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
 try {
  let mode='ok',aborted=false;
  const localFact=Object.freeze({fieldId:'local-field',state:'CLOSED'});
  const {service}=setup(async(q,ctx)=>{
   assert.equal(ctx.tenantId,actor.tenantId);assert.equal(ctx.correlationId,options.correlationId);
   if(mode==='missing')return [];
   if(mode==='timeout')return new Promise(resolve=>ctx.signal.addEventListener('abort',()=>{aborted=true;resolve([snapshot]);},{once:true}));
   if(mode==='auth')throw new ProviderError('AUTH');
   if(mode==='rate')throw new ProviderError('RATE_LIMIT',500);
   if(mode==='error')throw Error('secret=must-never-escape');
   if(mode==='invalid')return [{...snapshot,contractVersion:'unknown/2'}];
   return [snapshot,snapshot];
  });
  const result=await service.read(actor,'profile-a',query,options);
  assert.equal(result.status,'AVAILABLE');assert.equal(result.records.length,1);assert.equal(result.records[0].freshness.state,'STALE');
  assert.equal(result.records[0].snapshot.sourceHash,snapshot.sourceHash);
  for(const [next,code,retryable] of [['timeout','TIMEOUT',true],['auth','AUTH',false],['rate','RATE_LIMIT',true],['error','TEMPORARY',true],['invalid','VERSION_UNSUPPORTED',false]]) {
   mode=next;const failure=await service.read(actor,'profile-a',query,options);
   assert.equal(failure.status,'ERROR');assert.equal(failure.error.code,code);assert.equal(failure.error.retryable,retryable);
   assert.doesNotMatch(JSON.stringify(failure),/must-never-escape/);
   assert.deepEqual(failure.records,[]);
  }
  assert.ok(aborted);mode='missing';assert.equal((await service.read(actor,'profile-a',query,options)).status,'MISSING');
  // No provider has a canonical command/DB capability; manual local intent remains independent.
  const manualFact={...localFact,manualObservation:'entered offline'};assert.equal(manualFact.state,'CLOSED');
  assert.equal(result.records[0].snapshot.sourceHash,'a'.repeat(64));
  console.log(JSON.stringify({scenario:'WP49-023-contracts',clock:now,duplicateCount:1,stale:true,timeoutAborted:aborted,manualFactPreserved:manualFact.state==='CLOSED',provenancePreserved:true}));
 }finally{if(env===undefined)delete process.env.AGRO_DEPLOYMENT_MODE;else process.env.AGRO_DEPLOYMENT_MODE=env;}
});

test('registration is immutable, rejects secret config/unknown versions and replacing a source needs no Field schema',async()=>{
 const {service}=setup();
 assert.throws(()=>service.register(actor.tenantId,'profile-a',descriptor,{read:async()=>[]}),/DUPLICATE/);
 assert.throws(()=>service.register(actor.tenantId,'bad',{...descriptor,apiKey:'never-a-real-secret'},{read:async()=>[]}),/INVALID/);
 assert.throws(()=>service.register(actor.tenantId,'bad',{...descriptor,contractVersion:'other/2'},{read:async()=>[]}),/VERSION_UNSUPPORTED/);
 const changed={...descriptor,provider:'replacement'};
 service.register(actor.tenantId,'profile-b',changed,{read:async()=>[{...snapshot,provider:'replacement'}]});
 const env=process.env.AGRO_DEPLOYMENT_MODE;process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
 try {
  assert.equal((await service.read(actor,'profile-b',query,options)).records[0].snapshot.provider,'replacement');
  await assert.rejects(service.read(actor,'profile-a',query,{...options,timeoutMs:0}),/INVALID/);
 }finally{if(env===undefined)delete process.env.AGRO_DEPLOYMENT_MODE;else process.env.AGRO_DEPLOYMENT_MODE=env;}
});

test('input intent is pinned across authorization await and unrelated/portal-only response fails closed',async()=>{
 const env=process.env.AGRO_DEPLOYMENT_MODE;process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
 try {
  let release,first=true,received;
  const gate=new Promise(resolve=>{release=resolve;});
  const {service}=setup(async(q)=>{received=q;return [snapshot];},async()=>{if(first){first=false;await gate;}return true;});
  const mutable=structuredClone(query),settings={...options},identity={...actor};
  const pending=service.read(identity,'profile-a',mutable,settings);
  mutable.cadastralNumber='different';settings.now='invalid';identity.tenantId='tenant-b';release();
  assert.equal((await pending).status,'AVAILABLE');assert.equal(received.cadastralNumber,query.cadastralNumber);
  assert.ok(Object.isFrozen(received));
  const unrelated=setup(async()=>[{...snapshot,data:{...snapshot.data,cadastralNumber:'different'}}]).service;
  assert.equal((await unrelated.read(actor,'profile-a',query,options)).error.code,'INVALID_RESPONSE');
  let called=false;
  service.register(actor.tenantId,'portal',{...descriptor,access:'PORTAL_ONLY'},{read:async()=>{called=true;return [];}});
  assert.equal((await service.read(actor,'portal',query,options)).error.code,'UNAVAILABLE');assert.equal(called,false);
  const badDelay=setup(async()=>{throw new ProviderError('RATE_LIMIT',-10);}).service;
  assert.equal((await badDelay.read(actor,'profile-a',query,options)).error.retryAfterMs,undefined);
 }finally{if(env===undefined)delete process.env.AGRO_DEPLOYMENT_MODE;else process.env.AGRO_DEPLOYMENT_MODE=env;}
});
