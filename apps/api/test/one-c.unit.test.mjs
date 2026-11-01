import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { OneCService } from '../dist/modules/integrations/1c/one-c.service.js';
import { IntegrationsRegistry } from '../dist/modules/integrations/integrations.registry.js';
import { validateBinding, validateAttributes, compareSnapshots } from '../dist/modules/integrations/1c/one-c.policy.js';
import { OneCModule } from '../dist/modules/integrations/1c/one-c.module.js';
import { AppModule } from '../dist/app.module.js';
const field={aspect:'ACCOUNTING',authority:'ONE_C',direction:'IN',type:'string',required:true};
const binding={profileId:'accounting',profileVersion:1,direction:'INBOUND',operation:'AccountingProjection',entityType:'Material',fields:{accountingCode:field}};
test('1C compiled runtime is wired into the API',()=>assert.ok(Reflect.getMetadata('imports',AppModule).includes(OneCModule)));
test('explicit attribute SoT rejects operational inbound ownership, partial/unknown/type-invalid data',()=>{
 validateBinding(binding);validateAttributes({accountingCode:'001'},binding);
 for(const payload of [{},{accountingCode:5},{accountingCode:'001',roles:'admin'}])assert.throws(()=>validateAttributes(payload,binding));
 assert.throws(()=>validateBinding({...binding,fields:{quantity:{...field,aspect:'OPERATIONAL'}}}));
 assert.throws(()=>validateBinding({...binding,fields:{accountingCode:{...field,direction:'OUT'}}}));
});
test('reconciliation compares GUID, totals, modified versions without changing snapshots',()=>{
 const a={externalId:'GUID-1',total:'12.000',modifiedVersion:'v1'};
 const b={...a,externalId:'GUID-2',total:'13.000',modifiedVersion:'v2'};
 assert.deepEqual(compareSnapshots(a,a),[]);
 assert.deepEqual(compareSnapshots(a,b),['GUID_MISMATCH','TOTAL_MISMATCH','VERSION_MISMATCH']);
 assert.deepEqual(compareSnapshots(a,null),['MISSING_EXTERNAL']);
 assert.deepEqual(compareSnapshots(null,a),['MISSING_LOCAL']);
 assert.equal(a.total,'12.000');
});

test('default deny and cloud authority fail before DB access; mock runtime has no transport or foreign writes',async()=>{
 const registry=new IntegrationsRegistry();
 const pool={query(){throw Error('must not query');}};
 const service=new OneCService(pool,registry,{});
 const previous=process.env.AGRO_DEPLOYMENT_MODE;
 try {
  process.env.AGRO_DEPLOYMENT_MODE='LOCAL_PRIMARY';
  await assert.rejects(service.reconcile({tenantId:'a',subjectId:'b'},'p',1,{}),/FORBIDDEN/);
  await assert.rejects(service.observations({tenantId:'a',subjectId:'b'},'p'),/FORBIDDEN/);
  process.env.AGRO_DEPLOYMENT_MODE='CLOUD';
  await assert.rejects(service.configure({},{}),/LOCAL_PRIMARY/);
 }finally{if(previous===undefined)delete process.env.AGRO_DEPLOYMENT_MODE;else process.env.AGRO_DEPLOYMENT_MODE=previous;}
 for(const file of ['one-c.mock.ts','one-c.service.ts']) {
  const source=readFileSync(new URL('../src/modules/integrations/1c/'+file,import.meta.url),'utf8');
  assert.doesNotMatch(source,/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:org|identity|warehouse|files|sync)\./i);
  assert.doesNotMatch(source,/\bfetch\(|node:https|node:http|https?:\/\//);
 }
});
