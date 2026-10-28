import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { IntegrationsRegistry } from '../dist/modules/integrations/integrations.registry.js';
import { IntegrationsService } from '../dist/modules/integrations/integrations.service.js';
import { IntegrationsModule } from '../dist/modules/integrations/integrations.module.js';
import { AppModule } from '../dist/app.module.js';
test('registered runtime, default deny, unique trusted policy and routes',async()=>{
 const registry=new IntegrationsRegistry();
 await assert.rejects(registry.authorize({tenantId:'a',subjectId:'b'},'STAGE','p'),/FORBIDDEN/);
 assert.throws(()=>registry.command('unknown'),/NOT_REGISTERED/);
 assert.throws(()=>registry.adapter('unknown'),/NOT_REGISTERED/);
 registry.installPolicy(async()=>true);assert.throws(()=>registry.installPolicy(async()=>true),/Duplicate/);
 registry.registerAdapter({code:'fixture'});assert.throws(()=>registry.registerAdapter({code:'fixture'}),/Duplicate/);
 assert.ok(Reflect.getMetadata('imports',AppModule).includes(IntegrationsModule));
});
test('cloud and unspecified authority fail closed before touching persistence',async()=>{
 const old=process.env.AGRO_DEPLOYMENT_MODE;delete process.env.AGRO_DEPLOYMENT_MODE;
 const service=new IntegrationsService({query(){throw Error('must not touch DB');}},new IntegrationsRegistry());
 try {await assert.rejects(service.dispatchAvailable(),/LOCAL_PRIMARY/);process.env.AGRO_DEPLOYMENT_MODE='CLOUD';await assert.rejects(service.dispatchAvailable(),/LOCAL_PRIMARY/);}
 finally {if(old===undefined)delete process.env.AGRO_DEPLOYMENT_MODE;else process.env.AGRO_DEPLOYMENT_MODE=old;}
});
test('framework only mutates its own schema and Docker carries the shared runtime',()=>{
 const source=readFileSync(new URL('../src/modules/integrations/integrations.service.ts',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:org|identity|files|sync|warehouse|grain)\./i);
 assert.match(readFileSync(new URL('../Dockerfile',import.meta.url),'utf8'),/COPY --from=build \/workspace\/packages\/connectors\/src/);
});
