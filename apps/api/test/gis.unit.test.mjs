import assert from 'node:assert/strict';
import test from 'node:test';
import { GisService } from '../dist/modules/gis/gis.service.js';
import { GisRegistry } from '../dist/modules/gis/gis.registry.js';
import { geometry, context, source, bbox, uuidv7 } from '../dist/modules/gis/gis.validation.js';
const polygon={type:'Polygon',coordinates:[[[30,50],[31,50],[31,51],[30,50]]]};
test('GIS permission is default-deny, tenant-bound, current and immutable in composition',async()=>{
 const registry=new GisRegistry(),actor={tenantId:uuidv7(),subjectId:uuidv7()};
 await assert.rejects(registry.authorize(actor,'gis.read'),/FORBIDDEN/);
 let allow=true;registry.installPolicy(async(a,action)=>allow&&a.tenantId===actor.tenantId&&action==='gis.read');
 await registry.authorize(actor,'gis.read');
 await assert.rejects(registry.authorize({...actor,tenantId:uuidv7()},'gis.read'),/FORBIDDEN/);
 await assert.rejects(registry.authorize(actor,'gis.unknown'),/FORBIDDEN/);
 allow=false;await assert.rejects(registry.authorize(actor,'gis.read'),/FORBIDDEN/);
 assert.throws(()=>registry.installPolicy(async()=>true),/IMMUTABLE/);
});
test('GIS rejects malformed, nonfinite, out-of-world, 3D, unclosed and oversized geometry without rounding',()=>{
 assert.deepEqual(geometry(polygon),polygon);
 for(const value of [null,{...polygon,type:'GeometryCollection'},{...polygon,coordinates:[[[0,0,5],[1,0],[1,1],[0,0]]]},{...polygon,coordinates:[[[181,0],[1,0],[1,1],[181,0]]]},{...polygon,coordinates:[[[0,0],[1,0],[1,Infinity],[0,0]]]},{...polygon,coordinates:[[[0,0],[1,0],[1,1],[2,2]]]}])assert.throws(()=>geometry(value),/GIS_/);
 assert.throws(()=>geometry(polygon,3),/LIMIT/);
 const precise=structuredClone(polygon);precise.coordinates[0][0][0]=30.1234567890123;precise.coordinates[0][3][0]=30.1234567890123;
 assert.equal(geometry(precise).coordinates[0][0][0],30.1234567890123);
});
test('GIS requires exact command provenance and known source metadata',()=>{
 assert.throws(()=>context({}),/CONTEXT/);
 context({idempotencyKey:'x',correlationId:'c',causationId:'p'});
 for(const value of [{type:'BOGUS',sourceCrs:'EPSG:4326'},{type:'MANUAL'},{type:'MANUAL',sourceCrs:'EPSG:4326',capturedAt:'2026-02-30T00:00:00Z'}])assert.throws(()=>source(value),/SOURCE/);
 source({type:'MANUAL',sourceCrs:'EPSG:4326',capturedAt:'2026-11-02T00:00:00Z'});
});
test('GIS bounds queries with explicit limits and supports antimeridian bbox',()=>{
 assert.deepEqual(bbox([170,-10,-170,10],100),[170,-10,-170,10]);
 for(const b of [[0,0,1,100],[0,10,1,-10],[NaN,0,1,1],[0,0,0,1]])assert.throws(()=>bbox(b,100),/BBOX/);
 assert.throws(()=>bbox([0,0,1,1],1001),/LIMIT/);
});

test('GIS query binds tenant to the authorized immutable actor across async policy checks',async()=>{
 const tenantId=uuidv7(),actor={tenantId,subjectId:uuidv7()},registry=new GisRegistry();let release,seen;
 registry.installPolicy(async(a)=>{await new Promise(resolve=>{release=resolve;});return a.tenantId===tenantId;});
 const pool={async query(_sql,params){seen=params;return{rows:[]};}};
 const service=new GisService(pool,registry),pending=service.history(actor,uuidv7());
 actor.tenantId=uuidv7();release();await pending;assert.equal(seen[0],tenantId);
});
