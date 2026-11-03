import assert from 'node:assert/strict';
import test from 'node:test';
import { nextState, validateDefinition, validateAction } from '../dist/modules/tasks/tasks.validation.js';
import { TasksRegistry } from '../dist/modules/tasks/tasks.registry.js';
const id='019a4d83-0000-7000-8000-000000000001';
test('documented WorkOrder transitions reject unsafe state changes and invalid completion',()=>{
 assert.equal(nextState('ASSIGNED','Accept'),'ACCEPTED');
 assert.equal(nextState('ACCEPTED','Start'),'IN_PROGRESS');
 assert.equal(nextState('IN_PROGRESS','Pause'),'PAUSED');
 assert.equal(nextState('PAUSED','Resume'),'IN_PROGRESS');
 assert.equal(nextState('PAUSED','Complete'),'COMPLETED');
 assert.throws(()=>nextState('ASSIGNED','Complete'),/STATE_CONFLICT/);
 assert.throws(()=>nextState('CLOSED','Start'),/STATE_CONFLICT/);
 assert.throws(()=>validateAction('Complete',{actualQty:'-1',uom:'ha'}),/INVALID/);
 assert.throws(()=>validateAction('Complete',{actualQty:'1.1',uom:'ha',materialConsumptions:[{}]}),/INVALID/);
 assert.throws(()=>validateDefinition({operationTypeId:id,targetType:'FIELD',targetId:id,plannedQty:'NaN',uom:'ha',priority:50}),/INVALID/);
});
test('task policy is fail closed and cannot be replaced after installation',async()=>{
 const r=new TasksRegistry(),actor={tenantId:id,userId:id,deviceId:id,sessionId:id};
 assert.equal(await r.can(actor,'task.read'),false);
 r.install({authorize:async()=>true,resolveEmployee:async()=>[id],operationType:async()=>true});
 assert.equal(await r.can(actor,'task.read'),true);
 assert.equal(await r.can(actor,'task.unknown'),false);
 assert.throws(()=>r.install({}),/IMMUTABLE/);
});
