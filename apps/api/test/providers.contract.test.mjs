import assert from 'node:assert/strict';
import test from 'node:test';
import { validateBatch, validateQuery, freshness, matchesQuery } from '../dist/modules/providers/providers.validation.js';
import { PROVIDER_CONTRACT } from '../dist/modules/providers/providers.contracts.v1.js';

const now='2026-11-01T12:00:00.000Z';
const descriptor=kind=>({kind,provider:'fixture',apiVersion:'fixture-v1',contractVersion:PROVIDER_CONTRACT,access:'FILE_IMPORT',licenseRef:'license-fixture'});
const base=kind=>({contractVersion:PROVIDER_CONTRACT,kind,provider:'fixture',apiVersion:'fixture-v1',externalId:'external-1',sourceVersion:'opaque-z',sourceHash:'a'.repeat(64),capturedAt:'2026-11-01T10:00:00.000Z',processedAt:'2026-11-01T10:30:00.000Z',retrievedAt:'2026-11-01T11:00:00.000Z'});
const records={
 weather:{...base('weather'),data:{mode:'FORECAST',model:'fixture-model',runAt:'2026-11-01T09:00:00.000Z',spatialMethod:'centroid/v1',resolution:'hourly',point:[37,55],variables:[{name:'temperature',unit:'degC',at:now,value:8}]}},
 satellite:{...base('satellite'),data:{collection:'fixture-collection',cloudPercent:15,footprintRef:'footprint-1',assets:[{band:'RED',ref:'asset-1'}],quality:'MASK_AVAILABLE',processingVersion:'processor/v1'}},
 cadastre:{...base('cadastre'),data:{cadastralNumber:'77:01:0001:1',geometryStatus:'UNKNOWN',geometryRef:null,sourceCrs:null,attributes:{areaM2:2000,category:'agriculture'}}},
};
const batch=record=>validateBatch([record],descriptor(record.kind),now,4*3600000);

test('v1 validates all three provider-neutral snapshots and preserves immutable detached provenance',()=>{
 for(const r of Object.values(records)) {
  const input=structuredClone(r),before=structuredClone(input);
  const result=batch(input);
  assert.deepEqual(result[0].snapshot,before);
  assert.equal(result[0].freshness.state,'FRESH');
  input.sourceHash='b'.repeat(64);
  assert.equal(result[0].snapshot.sourceHash,before.sourceHash);
  assert.ok(Object.isFrozen(result)&&Object.isFrozen(result[0].snapshot.data));
  assert.throws(()=>{result[0].snapshot.externalId='replacement';},TypeError);
 }
});

test('exact v1 compatibility fails closed for unknown versions, identity mismatch and partial payloads',()=>{
 for(const r of Object.values(records)) {
  for(const mutation of [x=>{x.contractVersion='external-provider/2';},x=>{x.apiVersion='other';},x=>{x.provider='other';},x=>{delete x.sourceHash;},x=>{delete x.data;},x=>{x.sourceHash='bad';},x=>{x.extra='unexpected';},x=>{x.processedAt='yesterday';}]) {
   const input=structuredClone(r);mutation(input);assert.throws(()=>batch(input));
  }
 }
 assert.throws(()=>validateBatch([records.weather],{...descriptor('weather'),contractVersion:'external-provider/2'},now,1000),/VERSION_UNSUPPORTED/);
 const bad=structuredClone(records.weather);bad.data.variables[0].value=Infinity;assert.throws(()=>batch(bad));
 bad.data.variables[0].value=8;bad.data.variables[0].unit='';assert.throws(()=>batch(bad));
 const invalidDate={...records.weather,capturedAt:'2026-02-30T10:00:00Z'};assert.throws(()=>batch(invalidDate));
 const satellite=structuredClone(records.satellite);satellite.data.cloudPercent=101;assert.throws(()=>batch(satellite));
 const badTime={...records.satellite,processedAt:'2026-11-01T09:00:00Z'};assert.throws(()=>batch(badTime));
 const cadastre=structuredClone(records.cadastre);cadastre.data.geometryStatus='AVAILABLE';assert.throws(()=>batch(cadastre));
 cadastre.data.geometryStatus='PENDING';cadastre.data.geometryRef='invented';assert.throws(()=>batch(cadastre));
});

test('freshness uses weather run or source capture, never retrieval time; stale, missing and unknown are explicit',()=>{
 const r=records.weather;
 assert.equal(freshness(r,now,3600000).state,'STALE');
 assert.equal(freshness(r,now,3*3600000).state,'FRESH');
 assert.equal(freshness({...r,data:{...r.data,runAt:'2026-11-02T00:00:00Z'}},now,3600000).state,'UNKNOWN');
 const noDate={...records.cadastre,capturedAt:null,processedAt:null};
 assert.equal(batch(noDate)[0].freshness.state,'UNKNOWN');
 assert.deepEqual(validateBatch([],descriptor('weather'),now,1000),[]);
 assert.throws(()=>validateBatch([],descriptor('weather'),'bad',1000));
 assert.throws(()=>freshness(r,'bad',10));assert.throws(()=>freshness(r,now,-1));
});

test('duplicates coalesce, conflicting observation rejects, distinct runs/revisions stay ordered with provenance',()=>{
 const old=structuredClone(records.weather);
 const newer={...structuredClone(old),sourceVersion:'opaque-a',sourceHash:'b'.repeat(64),data:{...structuredClone(old.data),runAt:'2026-11-01T10:00:00.000Z'}};
 const result=validateBatch([newer,old,structuredClone(old)],descriptor('weather'),now,3600000);
 assert.equal(result.length,2);assert.equal(result[0].snapshot.data.runAt,newer.data.runAt);
 assert.deepEqual(result.map(x=>x.snapshot.sourceHash),[newer.sourceHash,old.sourceHash]);
 assert.deepEqual(result,validateBatch([old,newer],descriptor('weather'),now,3600000));
 const conflict=structuredClone(old);conflict.data.variables[0].value=99;
 assert.throws(()=>validateBatch([old,conflict],descriptor('weather'),now,3600000),/DUPLICATE_CONFLICT/);
});

test('queries constrain coordinate/order/type/size and cadastral metadata never invents geometry',()=>{
 const queries=[{kind:'weather',mode:'HISTORY',point:[37,55],from:'2026-10-01T00:00:00Z',to:now},{kind:'satellite',bbox:[36,54,38,56],from:'2026-10-01T00:00:00Z',to:now,maxCloudPercent:25},{kind:'cadastre',cadastralNumber:'77:01:0001:1'}];
 for(const q of queries)validateQuery(q);
 for(const q of [{...queries[0],point:[181,55]},{...queries[0],to:'bad'},{...queries[0],from:'2027-01-01T00:00:00Z'},{...queries[1],bbox:[38,54,36,56]},{...queries[2],cadastralNumber:''},{...queries[2],url:'secret'},{kind:'other'}])assert.throws(()=>validateQuery(q));
 assert.equal(batch(records.cadastre)[0].snapshot.data.geometryRef,null);
 assert.throws(()=>validateBatch(Array(1001).fill(records.weather),descriptor('weather'),now,1000));
});

test('response/query binding rejects unrelated weather locations, periods and cadastral numbers',()=>{
 const weather={kind:'weather',mode:'FORECAST',point:[37,55],from:'2026-10-01T00:00:00Z',to:now};
 const satellite={kind:'satellite',bbox:[36,54,38,56],from:'2026-10-01T00:00:00Z',to:now,maxCloudPercent:25};
 const cadastre={kind:'cadastre',cadastralNumber:records.cadastre.data.cadastralNumber};
 assert.ok(matchesQuery(records.weather,weather));assert.ok(matchesQuery(records.satellite,satellite));assert.ok(matchesQuery(records.cadastre,cadastre));
 assert.equal(matchesQuery(records.weather,{...weather,mode:'HISTORY'}),false);
 assert.equal(matchesQuery(records.weather,{...weather,point:[38,55]}),false);
 assert.equal(matchesQuery(records.weather,{...weather,to:'2026-11-01T11:00:00Z'}),false);
 assert.equal(matchesQuery(records.satellite,{...satellite,maxCloudPercent:5}),false);
 assert.equal(matchesQuery(records.satellite,{...satellite,from:'2026-11-01T11:00:00Z'}),false);
 assert.equal(matchesQuery(records.cadastre,{...cadastre,cadastralNumber:'different'}),false);
 const missing=structuredClone(records.weather);missing.data.variables[0].value=null;assert.equal(batch(missing)[0].snapshot.data.variables[0].value,null);
 const unknownCloud={...records.satellite,data:{...records.satellite.data,cloudPercent:null}};assert.ok(batch(unknownCloud));
 const available={...records.cadastre,data:{...records.cadastre.data,geometryStatus:'AVAILABLE',geometryRef:'reference-geometry-only',sourceCrs:'EPSG:4326'}};
 assert.equal(batch(available)[0].snapshot.data.geometryRef,'reference-geometry-only');
});
