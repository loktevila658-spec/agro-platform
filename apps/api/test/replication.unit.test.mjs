import assert from 'node:assert/strict';
import test from 'node:test';
import { validateChange, signBody, verifyBody } from '../dist/modules/replication/replication.validation.js';
import { ReplicationRegistry } from '../dist/modules/replication/replication.registry.js';
import { ReplicationModule } from '../dist/modules/replication/replication.module.js';

test('replication authenticates exact message and ACK contents', () => {
 const key='a'.repeat(64), value={version:1,seq:'1'};
 const signed=signBody('message',value,key);
 assert.deepEqual(verifyBody('message',signed,key),value);
 assert.throws(()=>verifyBody('ack',signed,key));
 assert.throws(()=>verifyBody('message',{...signed,body:{...value,seq:'2'}},key));
 assert.throws(()=>verifyBody('message',signed,'b'.repeat(64)));
});

const fixture=()=>({version:1,tenantId:'tenant-1',eventId:'event-1',aggregateType:'fixture',aggregateId:'one',revision:'1',operation:'UPSERT',supersedes:null,payload:{value:1},provenance:{owner:'fixture',sourceEventId:'event-1',actorId:'actor',correlationId:'corr',causationId:'cause',occurredAt:'2026-11-01T00:00:00Z',evidence:{source:'local'}},objectRefs:[]});
test('strict versioned projection retains provenance and requires explicit correction/tombstone',()=>{
 validateChange(fixture());
 for(const change of [{...fixture(),version:2},{...fixture(),revision:'01'},{...fixture(),revision:'9223372036854775808'}, {...fixture(),extra:true}, {...fixture(),operation:'TOMBSTONE'}, {...fixture(),payload:{bad:NaN}}, {...fixture(),provenance:{}}, {...fixture(),objectRefs:[{id:'x',sha256:'wrong'}]}]) assert.throws(()=>validateChange(change));
 validateChange({...fixture(),eventId:'event-2',operation:'TOMBSTONE',revision:'2',supersedes:'event-1',payload:{},provenance:{...fixture().provenance,sourceEventId:'event-2'}});
 assert.throws(()=>validateChange({...fixture(),payload:{huge:'x'.repeat(1048576)}}));
});
const binding={tenantId:'tenant-1',siteId:'site-1',installationId:'installation-1',subjectId:'service-1',key:'s'.repeat(64),timeoutMs:1000,pollMs:100,maxAttempts:3};
test('trusted binding pins identities, external key and HTTPS transport; no default destination',()=>{
 const registry=new ReplicationRegistry();assert.equal(registry.get(binding.tenantId),undefined);
 for(const b of [{...binding,key:'short'},{...binding,timeoutMs:0},{...binding,pollMs:0},{...binding,maxAttempts:101}])assert.throws(()=>registry.register(b));
 assert.throws(()=>registry.register(binding,{protocol:'http:',send:async()=>{}}));
 const mutable={...binding};registry.register(mutable);mutable.siteId='changed';
 assert.equal(registry.get(binding.tenantId).binding.siteId,'site-1');assert.ok(Object.isFrozen(registry.get(binding.tenantId)));
 assert.throws(()=>registry.register(binding));
});

import { readFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { IntegrationsRegistry } from '../dist/modules/integrations/integrations.registry.js';
import { ReplicationService } from '../dist/modules/replication/replication.service.js';
import { ReplicationConsumer } from '../dist/modules/replication/replication.consumer.js';
import { AppModule } from '../dist/app.module.js';
import { EVENT_HANDLERS } from '../dist/modules/events/events.tokens.js';
test('compiled Nest registers one Local worker/capture, no Cloud receiver or reverse endpoint',async()=>{
 const old=process.env.AGRO_DEPLOYMENT_MODE;process.env.AGRO_DEPLOYMENT_MODE='DEMO_DEV';
 const app=await NestFactory.createApplicationContext(AppModule,{logger:false});
 try{
  const service=app.get(ReplicationService), registry=app.get(ReplicationRegistry);
  assert.ok(service);assert.equal(registry.get(binding.tenantId),undefined);
  assert.ok(app.get(EVENT_HANDLERS).includes(app.get(ReplicationConsumer)));
  await assert.rejects(service.dispatchAvailable(),/LOCAL_PRIMARY_REQUIRED/);
  await assert.rejects(service.append({},fixture()),/LOCAL_PRIMARY_REQUIRED/);
  process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
  await assert.rejects(service.status({tenantId:'tenant-1',subjectId:'denied'}),/INTEGRATION_FORBIDDEN/);
  await assert.rejects(service.replay({tenantId:'tenant-1',subjectId:'denied'},'reason'),/INTEGRATION_FORBIDDEN/);
  assert.ok(app.get(IntegrationsRegistry));
  const moduleSource=await readFile(new URL('../src/modules/replication/replication.module.ts',import.meta.url),'utf8');
  assert.ok(moduleSource.includes('ReplicationService'));assert.ok(!moduleSource.includes('ReplicationReceiver'));
  for(const name of ['replication.receiver.ts','replication.service.ts']){
   const source=await readFile(new URL('../src/modules/replication/'+name,import.meta.url),'utf8');
   assert.doesNotMatch(source,/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:org|identity|sync|files|integrations)\./i);
   assert.doesNotMatch(source,/@(?:Controller|Post|Put|Patch|Delete)\(/);
  }
 }finally{await app.close();if(old===undefined)delete process.env.AGRO_DEPLOYMENT_MODE;else process.env.AGRO_DEPLOYMENT_MODE=old;}
});

test('capture preserves actual owner entity types for all four current org events',async()=>{
 const old=process.env.AGRO_DEPLOYMENT_MODE;process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
 const captured=[];const consumer=new ReplicationConsumer({append:async(_tx,c)=>captured.push(c)});
 try{
  for(const [name,type] of [['tenant','tenant'],['organization','organization'],['unit','organization_unit'],['site','site']]){
   const metadata={eventId:`event-${name}`,entityId:'entity',entityType:type,tenantId:'tenant',actorId:'actor',correlationId:'corr',causationId:'cause',occurredAt:'2026-11-01T00:00:00.000Z'};
   await consumer.handle({}, {id:metadata.eventId,source:'org',eventName:`org.${name}.created`,eventVersion:'1.0.0',producer:'org',entityId:'entity',tenantId:'tenant',actorId:'actor',correlationId:'corr',causationId:'cause',occurredAt:new Date(metadata.occurredAt),payload:metadata});
   assert.equal(captured.at(-1).aggregateType,`org.${type}`);assert.deepEqual(captured.at(-1).payload,metadata);
  }
  await assert.rejects(consumer.handle({}, {source:'org',producer:'org',eventName:'org.unit.created',eventVersion:'2.0.0'}),/ORG_REPLICA_VERSION_UNSUPPORTED/);
  assert.equal(captured.length,4);
 }finally{if(old===undefined)delete process.env.AGRO_DEPLOYMENT_MODE;else process.env.AGRO_DEPLOYMENT_MODE=old;}
});
