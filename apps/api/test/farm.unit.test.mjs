import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { FarmRegistry } from '../dist/modules/farm/farm.registry.js';
import { validateField, validateSeason, validateFieldSeason, validateLineage } from '../dist/modules/farm/farm.validation.js';
const uid='11111111-1111-4111-8111-111111111111';
const field=()=>({name:'Fixture field',nominalAreaHa:'12.3400',status:'ACTIVE',allocations:[]});
const season=()=>({name:'Fixture noncalendar season',year:2027,startDate:'2026-09-01',endDate:'2027-08-31',status:'PLANNED'});
test('Farm default deny, immutable installation and current policy',async()=>{
 const r=new FarmRegistry(),a={tenantId:uid,subjectId:uid};await assert.rejects(r.authorize(a,'field.read'),/FORBIDDEN/);
 let allowed=true;r.installPolicy(async()=>allowed);await r.authorize(a,'field.read');allowed=false;await assert.rejects(r.authorize(a,'field.read'),/FORBIDDEN/);
 assert.throws(()=>r.installPolicy(async()=>true),/IMMUTABLE/);await assert.rejects(r.authorize({...a,tenantId:'bad'},'field.read'),/FORBIDDEN/);
 allowed=true;await assert.rejects(r.authorize(a,'unknown'),/FORBIDDEN/);
 const broken=new FarmRegistry();broken.installPolicy(async()=>{throw Error('offline policy');});await assert.rejects(broken.authorize(a,'field.read'),/FORBIDDEN/);
});
test('Field is strict, has no seasonal attributes, and validates allocation provenance/date/area',()=>{
 assert.deepEqual(validateField(field()),field());
 const allocation={landPlotId:uid,validFrom:'2026-01-01T00:00:00Z',source:'Reviewed fixture',reason:'Explicit allocation',areaHa:'1.0000'};
 assert.deepEqual(validateField({...field(),allocations:[allocation]}).allocations,[allocation]);
 for(const p of [{cropId:uid},{seasonYear:2027},{geometry:{}},{status:'INVENTED'},{status:'ARCHIVED'},{nominalAreaHa:'-1'},{nominalAreaHa:1},{nominalAreaHa:'1e3'},{name:'x'.repeat(256)},{allocations:[{...allocation,validTo:'2025-01-01T00:00:00Z'}]},{allocations:[{...allocation,source:''}]},{allocations:[allocation,allocation]}])assert.throws(()=>validateField({...field(),...p}));
});
test('Season uses supplied business year and calendar-valid dates; no fabricated defaults',()=>{
 assert.deepEqual(validateSeason(season()),season());
 for(const p of [{year:undefined},{year:1.2},{startDate:'2026-02-30'},{endDate:'2026-08-31'},{status:'INVENTED'},{cropId:uid}])assert.throws(()=>validateSeason({...season(),...p}));
 const s={plannedAreaHa:'0',status:'PLANNED',notes:'Fixture only'};assert.deepEqual(validateFieldSeason(s),s);
 for(const p of [{plannedAreaHa:'-1'},{status:'INVENTED'},{fieldId:uid},{cropId:uid}])assert.throws(()=>validateFieldSeason({...s,...p}));
});
test('Split/merge cardinality and distinct optimistic source references',()=>{
 const source={fieldId:uid,expectedVersion:'1'};
 validateLineage('SPLIT',[source],[{},{}]);validateLineage('MERGE',[source,{...source,fieldId:'22222222-2222-4222-8222-222222222222'}],[{}]);
 for(const [op,s,t] of [['SPLIT',[source],[{}]],['MERGE',[source],[{}]],['MERGE',[source,source],[{}]],['OTHER',[source],[{},{}]]])assert.throws(()=>validateLineage(op,s,t));
});
test('Farm is compiled/registered, owner boundaries use application queries and shared version guard',()=>{
 const root=new URL('../../../',import.meta.url),s=readFileSync(new URL('apps/api/src/modules/farm/farm.service.ts',root),'utf8');
 assert.match(readFileSync(new URL('apps/api/src/app.module.ts',root),'utf8'),/FarmModule/);
 assert.doesNotMatch(s,/(?:FROM|JOIN|INTO|UPDATE)\s+(?:land|gis|org|master_data)\./i);
 assert.match(s,/referenceInTransaction/);assert.match(s,/approvedVersionInTransaction/);assert.match(s,/executeCommandEffect/);
});
