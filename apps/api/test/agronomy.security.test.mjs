import assert from 'node:assert/strict';
import test from 'node:test';
import { AgronomyRegistry } from '../dist/modules/agronomy/agronomy.registry.js';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',a={tenantId:id,subjectId:id};
test('planning policy fails closed, preserves identity and rejects revoked or cross-scope rights',async()=>{
 const r=new AgronomyRegistry();await assert.rejects(r.authorize(a,'agronomy.season_plan.edit',id),/FORBIDDEN/);
 let allowed=true;r.install({authorize:async(actor,action,org)=>allowed&&actor.tenantId===id&&org===id,reference:async()=>undefined,formula:async()=>false});
 await r.authorize(a,'agronomy.season_plan.edit',id);await assert.rejects(r.authorize(a,'agronomy.season_plan.edit',other));await assert.rejects(r.authorize({...a,tenantId:other},'agronomy.season_plan.edit',id));
 allowed=false;await assert.rejects(r.authorize(a,'agronomy.season_plan.edit',id));allowed=true;await assert.rejects(r.authorize(a,'invented',id));
 assert.throws(()=>r.install({}),/IMMUTABLE/);await assert.rejects(r.reference({},a,'MACHINE',id,id),/UNAVAILABLE/);await assert.rejects(r.formula(a,{}),/UNAVAILABLE/);
 const broken=new AgronomyRegistry();broken.install({authorize:async()=>{throw Error('policy unavailable');},reference:async()=>undefined,formula:async()=>false});await assert.rejects(broken.authorize(a,'agronomy.season_plan.edit',id),/FORBIDDEN/);
});
test('reference resolver cannot silently change canonical identity or organization',async()=>{
 const r=new AgronomyRegistry();r.install({authorize:async()=>true,reference:async()=>({id,revisionId:other,organizationId:other}),formula:async()=>true});
 await assert.rejects(r.reference({},a,'OPERATION',id,id),/UNAVAILABLE/);await assert.rejects(r.reference({},a,'OPERATION',other,other),/UNAVAILABLE/);
});
