import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { LandRegistry } from '../dist/modules/land/land.registry.js';
import { validateSnapshot } from '../dist/modules/land/land.validation.js';
const source={source:'Fixture manual document',profile:'fixture',profileVersion:'1',capturedAt:'2026-11-03T00:00:00Z',sourceHash:'a'.repeat(64)};
const snapshot=()=>({source:{...source},attributes:{original:'unchanged'},rights:[]});
test('Land deny-by-default and immutable current policy installation',async()=>{
 const actor={tenantId:'11111111-1111-4111-8111-111111111111',subjectId:'22222222-2222-4222-8222-222222222222'};
 const registry=new LandRegistry();await assert.rejects(registry.authorize(actor,'land.read'),/FORBIDDEN/);
 registry.installPolicy(async()=>true);await registry.authorize(actor,'land.read');
 await assert.rejects(registry.authorize(actor,'unknown'),/FORBIDDEN/);await assert.rejects(registry.authorize({...actor,tenantId:'bad'},'land.read'),/FORBIDDEN/);
 assert.throws(()=>registry.installPolicy(async()=>true),/IMMUTABLE/);
 const broken=new LandRegistry();broken.installPolicy(async()=>{throw Error('policy unavailable');});await assert.rejects(broken.authorize(actor,'land.read'),/FORBIDDEN/);
});
test('Land strict metadata validation preserves opaque identifiers and accepts no inferred rights',()=>{
 const input={...snapshot(),cadastralNumber:'fixture:parcel:001',declaredAreaHa:'12.3400'};assert.deepEqual(validateSnapshot(input),input);
 for(const patch of [{status:'INVENTED'},{geometry:{type:'Polygon'}},{declaredAreaHa:-1},{declaredAreaHa:'NaN'},{declaredAreaHa:'1e2'},{cadastralNumber:'has space'},{cadastralNumber:'x'.repeat(33)},{rights:[{rightType:'INVENTED',source}]},{rights:[{rightType:'LEASE',validFrom:'2026-02-30',source}]},{rights:[{rightType:'LEASE',validFrom:'2026-11-04',validTo:'2026-11-03',source}]},{source:{...source,capturedAt:'2026-02-30T00:00:00Z'}},{source:{...source,sourceHash:'bad'}},{attributes:{x:Infinity}}])assert.throws(()=>validateSnapshot({...snapshot(),...patch}));
 const rights=[{rightType:'LEASE',validFrom:'2026-01-01',validTo:'2026-12-31',source:{...source}}];assert.deepEqual(validateSnapshot({...snapshot(),rights}).rights,rights);
});
test('Land compiled registration and no foreign authoritative SQL',()=>{
 const root=new URL('../../../',import.meta.url);const source=readFileSync(new URL('apps/api/src/modules/land/land.service.ts',root),'utf8');
 assert.match(readFileSync(new URL('apps/api/src/app.module.ts',root),'utf8'),/LandModule/);
 assert.doesNotMatch(source,/(?:FROM|JOIN|INTO|UPDATE)\s+(?:gis|org|master_data)\./i);
 assert.match(source,/versionInTransaction/);assert.match(source,/executeCommandEffect/);
});
