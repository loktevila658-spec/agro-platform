import test from 'node:test';
import assert from 'node:assert/strict';
import { validateObservation } from '../dist/modules/scouting/scouting.validation.js';
import { ScoutingRegistry } from '../dist/modules/scouting/scouting.registry.js';
const id='019a0000-0000-7000-8000-000000000034';
const data=()=>({organizationId:id,fieldSeasonId:id,observationType:'GENERAL',note:'Ручное наблюдение',anomaly:false,sourceType:'USER_MOBILE'});
test('manual observation needs no GPS, photo or voice',()=>assert.deepEqual(validateObservation(data()),data()));
test('GPS retains exact provider, time and accuracy; no fabricated coordinates',()=>{const d={...data(),location:{latitude:54.123456789,longitude:36.12,accuracyMetres:8.21,observedAt:'2026-11-25T08:00:00Z',provider:'gps'}};assert.deepEqual(validateObservation(d),d);for(const patch of [{accuracyMetres:-1},{latitude:91},{provider:''},{observedAt:'bad'}])assert.throws(()=>validateObservation({...d,location:{...d.location,...patch}}));});
test('strict observation and bounded versioned forms reject unsafe fields',()=>{for(const patch of [{note:''},{diagnosis:'invented'},{sourceType:'AI'},{observationType:'UNKNOWN'},{anomaly:'yes'},{form:{id,version:'v1',answers:{x:Infinity}}}])assert.throws(()=>validateObservation({...data(),...patch}));const d={...data(),form:{id,version:'1',answers:{soil:'dry',density:12.5}}};assert.deepEqual(validateObservation(d),d);});
test('policy defaults deny; current rights, identity and immutable installation are checked',async()=>{const r=new ScoutingRegistry(),a={tenantId:id,userId:id,deviceId:id,sessionId:id};assert.equal(await r.can(a,'scouting.capture',id),false);let allow=true;r.install({authorize:async()=>allow,captureScopes:async()=>[{organizationId:id,fieldSeasonId:id}],observer:async()=>({employeeId:id,revisionId:id}),form:async()=>true,offlineTtlSeconds:300});assert.equal(await r.can(a,'scouting.capture',id),true);allow=false;assert.equal(await r.can(a,'scouting.capture',id),false);assert.equal(await r.can(a,'scouting.*',id),false);assert.throws(()=>r.install({}));});

test('optional note may be omitted without manufacturing media or coordinates',()=>{const d=data();delete d.note;assert.deepEqual(validateObservation(d),d);});
