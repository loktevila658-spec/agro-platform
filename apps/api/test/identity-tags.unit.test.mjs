import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {decodePayload,encodePayload} from '../dist/modules/identity-tags/identity-tags.payload.js';
import {IdentityTagsRegistry} from '../dist/modules/identity-tags/identity-tags.registry.js';
const id='019a7430-0000-7000-8000-000000000001';
const checksum=createHash('sha256').update(`v1/Material/${id}`).digest('hex');
const vector=`agro://v1/Material/${id}?c=${checksum}`;
test('QR v1 canonical URI and compact form share the same opaque identity',()=>{
 assert.equal(encodePayload('Material',id),vector);
 assert.deepEqual(decodePayload(vector),{version:1,entityType:'Material',entityId:id});
 assert.deepEqual(decodePayload(JSON.stringify({v:1,t:'Material',id,c:checksum})),decodePayload(vector));
});
test('QR parser rejects malformed, oversized, unsupported and noncanonical input',()=>{
 for(const value of [null,'', 'x'.repeat(513),vector.replace('v1','v2'),vector.replace('Material','Field'),vector.replace(id,id.slice(0,-1)+'2'),vector+'&token=secret',vector+'#fragment',vector.replace('agro:','https:'),vector.replace('/Material/','/Material%2f/'),JSON.stringify({v:1,t:'Material',id,c:checksum,token:'secret'}),`{"v":1,"v":1,"t":"Material","id":"${id}","c":"${checksum}"}`])assert.throws(()=>decodePayload(value));
});
test('checksum is not authentication; a forged valid identity still requires current policy',async()=>{
 const registry=new IdentityTagsRegistry(),actor={tenantId:id,subjectId:id};
 assert.ok(decodePayload(encodePayload('Material',id.slice(0,-1)+'2')));
 await assert.rejects(registry.authorize(actor,'identity-tags.resolve'));
 let allowed=true;registry.installPolicy(async()=>allowed);
 await registry.authorize(actor,'identity-tags.resolve');allowed=false;
 await assert.rejects(registry.authorize(actor,'identity-tags.resolve'));
 await assert.rejects(registry.authorize(actor,'*'));
 assert.throws(()=>registry.installPolicy(async()=>true));
});
