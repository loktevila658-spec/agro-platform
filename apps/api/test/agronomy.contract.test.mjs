import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadAndValidateContracts } from '../../../packages/contracts/scripts/lib/contracts.mjs';
import { validateAction } from '../dist/modules/tasks/tasks.validation.js';
test('planning API declares typed commands/history/resources and exact Task draft contract',async()=>{
 const {openapi,events}=await loadAndValidateContracts();const ops=openapi.operations.filter(o=>o.operationId.startsWith('agronomy'));
 assert.equal(ops.length,7);for(const o of ops)assert.ok(o.inputs.header.some(h=>h.name==='Authorization'&&h.required));
 for(const id of ['agronomyCreate','agronomyCommand'])assert.ok(ops.find(o=>o.operationId===id).inputs.header.some(h=>h.name==='Idempotency-Key'&&h.required));
 assert.equal(openapi.document.components.schemas.AgronomyTaskDraft.properties.definition.$ref,'#/components/schemas/TaskDefinition');
 const id='019a0000-0000-7000-8000-000000000001';validateAction('Create',{operationTypeId:id,targetType:'FIELD_SEASON',targetId:id,plannedQty:'2',uom:'fixture',priority:50});
 assert.deepEqual(events.events.filter(e=>e.producer==='agronomy').map(e=>e.name),['agronomy.plan.changed','agronomy.season_plan.created','agronomy.season_plan.published','agronomy.tech_map.published','agronomy.resource_demand.calculated']);
});
test('compiled registration, shared version guard, bounded owner contracts and source immutability are explicit',()=>{
 const root=new URL('../../../',import.meta.url),s=readFileSync(new URL('apps/api/src/modules/agronomy/agronomy.service.ts',root),'utf8');
 assert.match(readFileSync(new URL('apps/api/src/app.module.ts',root),'utf8'),/AgronomyModule/);assert.match(s,/executeCommandEffect/);assert.match(s,/planningReferenceInTransaction/);
 assert.doesNotMatch(s,/(?:FROM|JOIN|INTO|UPDATE)\s+(?:farm|org|master_data|tasks)\./i);assert.doesNotMatch(s,/tasks\.apply\(|tasks\.pool\.query/);
});
