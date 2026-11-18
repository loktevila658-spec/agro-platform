import test from 'node:test';
import assert from 'node:assert/strict';
import { validateData, demand, transition } from '../dist/modules/agronomy/agronomy.validation.js';
const id='019a0000-0000-7000-8000-000000000001';
const op=()=>({id,operationTypeId:id,sequence:1,quantity:'2',unit:'fixture',unscheduled:true,resources:[]});
test('planning requires explicit scheduling, exact quantity and unique ordered operations',()=>{
 const data={name:'Fixture',operations:[op()]};assert.deepEqual(validateData('TEMPLATE',data),data);
 for(const patch of [{quantity:2},{quantity:'-1'},{unscheduled:false},{window:{start:'2026-11-19T00:00:00Z',end:'2026-11-18T00:00:00Z'}},{actualQty:'2'},{resources:[{kind:'MATERIAL',referenceId:id,quantity:'1',unit:'fixture',rate:'1'}]}])assert.throws(()=>validateData('TEMPLATE',{...data,operations:[{...op(),...patch}]}));
 assert.throws(()=>validateData('TEMPLATE',{...data,operations:[op(),op()]}));
});
test('explicit source formulas use exact decimal inputs without invented conversions or rounding',()=>{
 assert.equal(demand('MATERIAL','0.100000','3.000000','0.100000'),'0.33');
 assert.equal(demand('MACHINE','0.1','3'),'0.3');assert.equal(demand('LABOR','2','1.5'),'3');
 assert.throws(()=>demand('MATERIAL','1','1'),/INPUT/);assert.throws(()=>demand('OTHER','1','1'),/FORMULA/);
 assert.throws(()=>demand('MACHINE','0.000001','0.000001'),/PRECISION/);
});
test('published or approved content can only change through explicit revision',()=>{
 assert.equal(transition('DRAFT','Approve'),'APPROVED');assert.equal(transition('APPROVED','Publish'),'PUBLISHED');
 assert.throws(()=>transition('DRAFT','Publish'));assert.throws(()=>transition('PUBLISHED','Approve'));
});
