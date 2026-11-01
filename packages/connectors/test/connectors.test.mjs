import assert from 'node:assert/strict';
import test from 'node:test';
import { mapRecord, retryDelay, ConnectorError, fingerprint } from '../src/index.cjs';
test('explicit versioned mappings reject missing fields, dictionary misses and unsafe paths', () => {
 const rules=[{from:['value'],to:'quantity',required:true},{from:['unit'],to:'unit',dictionary:{kg:'KG'},required:true}];
 assert.deepEqual(mapRecord({value:2,unit:'kg'},rules),{quantity:2,unit:'KG'});
 assert.throws(()=>mapRecord({value:2,unit:'g'},rules),/MAPPING/);
 assert.throws(()=>mapRecord({unit:'kg'},rules),/MAPPING/);
 assert.throws(()=>mapRecord({},[{from:['__proto__'],to:'x'}]),/MAPPING/);
 assert.throws(()=>mapRecord({},[{from:['x'],to:'constructor'}]),/MAPPING/);
 assert.throws(()=>mapRecord({},[{from:['x'],to:'x'},{from:['y'],to:'x'}]),/MAPPING/);
});
test('bounded configured exponential jitter respects provider Retry-After without invented policy',()=>{
 const p={maxAttempts:3,baseDelayMs:100,maxDelayMs:1000,jitter:0.5,timeoutMs:500};
 assert.equal(retryDelay(p,2,0),100);
 assert.equal(retryDelay(p,20,1),1000);
 assert.equal(retryDelay(p,1,0,5000),5000);
 assert.throws(()=>retryDelay({...p,maxAttempts:0},1,0),/POLICY/);
 assert.equal(new ConnectorError('TIMEOUT').retryable,true);
 assert.equal(new ConnectorError('AUTH_ERROR').retryable,false);
 assert.equal(fingerprint({b:2,a:1}),fingerprint({a:1,b:2}));
 assert.notEqual(fingerprint({a:1}),fingerprint({a:2}));
});
