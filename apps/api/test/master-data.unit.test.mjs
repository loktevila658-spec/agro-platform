import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { MasterDataRegistry } from '../dist/modules/master-data/master-data.registry.js';
import { MasterDataModule } from '../dist/modules/master-data/master-data.module.js';
import { MasterDataService } from '../dist/modules/master-data/master-data.service.js';
import { validateUnit, validateMaterial, uuidv7 } from '../dist/modules/master-data/master-data.validation.js';
const tenantId='00000000-0000-4000-8000-000000000001',subjectId='00000000-0000-4000-8000-000000000002';
const actor={tenantId,subjectId};
const policy={tenantId,version:1,dataOwnerId:subjectId,stewardId:subjectId,fields:{'Material.accountingCode':{master:'EXTERNAL_SYSTEM',source:'ONE_C',profileId:'fixture-codes',profileVersion:1}}};
test('master-data default denies missing, failed and cross-tenant server policy',async()=>{
 const registry=new MasterDataRegistry();
 await assert.rejects(registry.authorize(actor,'master-data.read'),/FORBIDDEN/);
 registry.installPolicy(async(a)=>a.tenantId===tenantId&&a.subjectId===subjectId);
 await registry.authorize(actor,'master-data.read');
 await assert.rejects(registry.authorize({...actor,tenantId:subjectId},'master-data.read'),/FORBIDDEN/);
 await assert.rejects(registry.authorize(actor,'invented'),/FORBIDDEN/);
 assert.throws(()=>registry.installPolicy(async()=>true),/IMMUTABLE/);
 const broken=new MasterDataRegistry();broken.installPolicy(async()=>{throw Error('failure');});
 await assert.rejects(broken.authorize(actor,'master-data.read'),/FORBIDDEN/);
});
test('field source policies are explicit immutable copies and never infer whole object authority',()=>{
 const r=new MasterDataRegistry();r.registerSourcePolicy(policy);
 assert.equal(r.field(tenantId,'Material','name').master,'PLATFORM');
 assert.equal(r.field(tenantId,'Material','accountingCode').source,'ONE_C');
 assert.equal(r.field(tenantId,'Material','gtin').master,'EXTERNAL_SYSTEM');
 assert.throws(()=>r.registerSourcePolicy(policy),/IMMUTABLE/);
 assert.throws(()=>new MasterDataRegistry().registerSourcePolicy({...policy,stewardId:''}),/POLICY/);
 assert.throws(()=>new MasterDataRegistry().registerSourcePolicy({...policy,fields:{'Material.accountingCode':{master:'PLATFORM'}}}),/POLICY/);
 assert.throws(()=>new MasterDataRegistry().registerSourcePolicy({...policy,fields:{'Material.id':{master:'EXTERNAL_SYSTEM',profileId:'x',profileVersion:1,source:'x'}}}),/POLICY/);
 const p=structuredClone(policy),copy=new MasterDataRegistry();copy.registerSourcePolicy(p);p.fields['Material.accountingCode'].source='changed';
 assert.equal(copy.field(tenantId,'Material','accountingCode').source,'ONE_C');
});
test('unit/material contracts reject invented enums, external local writes and invalid precision',()=>{
 const u={code:'fixture-count',name:'Fixture count',dimension:'COUNT',precision:0};assert.deepEqual(validateUnit(u),u);
 for(const input of [{...u,dimension:'GUESS'},{...u,dimension:['COUNT']},{...u,precision:7},{...u,precision:null},{...u,code:''},{...u,extra:1}])assert.throws(()=>validateUnit(input),/INVALID/);
 const m={code:'fixture-product',name:'Fixture product',itemType:'FINISHED',baseUom:'fixture-count'};
 assert.equal(validateMaterial(m).itemType,'FINISHED');
 for(const input of [{...m,itemType:'GUESS'},{...m,itemType:['FINISHED']},{...m,accountingCode:'forbidden'},{...m,gtin:'external'},{...m,name:null},{...m,id:tenantId}])assert.throws(()=>validateMaterial(input),/INVALID/);
});
test('canonical identity is UUIDv7 and not an external ID',()=>{
 const a=uuidv7(),b=uuidv7();assert.match(a,/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);assert.notEqual(a,b);
});
test('compiled runtime registers exported master-data services with no public endpoint',()=>{
 const imports=Reflect.getMetadata('imports',MasterDataModule);assert.ok(imports.length);
 const exports=Reflect.getMetadata('exports',MasterDataModule);assert.ok(exports.includes(MasterDataService));assert.ok(exports.includes(MasterDataRegistry));
 const app=readFileSync(new URL('../src/app.module.ts',import.meta.url),'utf8');assert.match(app,/MasterDataModule/);
 assert.equal(Reflect.getMetadata('controllers',MasterDataModule)?.length??0,0);
});

test('external owner validation rejects wrong source, malformed observation and incomplete import provenance before effects',async()=>{
 const registry=new MasterDataRegistry();registry.installPolicy(async()=>true);registry.registerSourcePolicy(policy);
 const service=new MasterDataService({},registry,{}),port=service.externalCommand();
 const prior=process.env.AGRO_DEPLOYMENT_MODE;process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
 const e={id:subjectId,tenantId,direction:'INBOUND',operation:'master-data.apply-external',entityType:'Material',localId:tenantId,profileId:'fixture-codes',profileVersion:1,externalId:'fixture-guid',observedAt:'2026-11-02T00:00:00Z',provenance:{}};
 const m={expectedVersion:'1',reason:'Fixture projection',accountingCode:'fixture-code'};
 try {
  await port.validate({},actor,e,m);
  for(const bad of [{...e,observedAt:'1'},{...e,provenance:{importBatch:'partial'}},{...e,profileId:'unapproved'},{...e,direction:'OUTBOUND'}])await assert.rejects(port.validate({},actor,bad,m),/SOURCE|PROVENANCE|ENVELOPE/);
  await assert.rejects(port.validate({},actor,e,{...m,name:'external-overwrite'}),/SOURCE/);
 }finally{if(prior===undefined)delete process.env.AGRO_DEPLOYMENT_MODE;else process.env.AGRO_DEPLOYMENT_MODE=prior;}
});
