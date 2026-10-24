import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const { decodeCursor, encodeCursor } = require('../dist/modules/sync/sync.crypto.js');
test('signed tenant scoped cursor rejects corruption and expires explicitly', () => {
 const key = 'fixture-only-cursor-key-32-bytes!!';
 const value = { tenantId:'tenant',userId:'user',deviceId:'device',scopeVersion:1,schemaVersion:1,seq:'7',issuedAt:1000 };
 const cursor = encodeCursor(value,key);
 assert.deepEqual(decodeCursor(cursor,key,1001),value);
 assert.throws(()=>decodeCursor(cursor+'x',key,1001),/RESET_REQUIRED/);
 assert.throws(()=>decodeCursor(cursor,key,1000+91*86400000),/CURSOR_EXPIRED/);
});

const { validatePush } = require('../dist/modules/sync/sync.service.js');
const { SyncRegistry } = require('../dist/modules/sync/sync.registry.js');
test('empty registry denies all commands/file writes and requires atomic guard',async()=>{
 const registry=new SyncRegistry();
 assert.equal(registry.get('invented'),undefined);
 assert.equal(await registry.authorize({ownerRef:'Fixture:one'}),false);
 assert.throws(()=>registry.register({commandType:'bad',requiresVersion:true}),/Atomic version/);
});
test('batch and schema limits fail before effects',()=>{
 assert.throws(()=>validatePush({deviceId:'invalid',scopeVersion:1,schemaVersion:1,commands:[]}),/SCHEMA/);
 assert.throws(()=>validatePush({deviceId:'00000000-0000-4000-8000-000000000001',scopeVersion:1,schemaVersion:1,commands:Array(51).fill({})}),/BATCH/);
});
