import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { ConnectorError, fingerprint } from '../../../../../../packages/connectors/src/index.cjs';
import type { Envelope, Profile } from '../../../../../../packages/connectors/src/index.cjs';
import { IntegrationsRegistry, IntegrationActor, OwnerCommand } from '../integrations.registry';
import { IntegrationsService } from '../integrations.service';
import { bindingFor, MockOneCAdapter } from './one-c.mock';
import { compareSnapshots, identifier, validateAttributes, validateBinding } from './one-c.policy';
import { MOCK_SCHEMA, ONE_C_MOCK } from './one-c.types';
import type { Observation, OneCBinding } from './one-c.types';
export const ONE_C_POOL=Symbol('ONE_C_POOL');
@Injectable()
export class OneCService implements OnModuleInit,OnModuleDestroy {
 constructor(@Inject(ONE_C_POOL) private readonly pool:Pool,private readonly registry:IntegrationsRegistry,private readonly framework:IntegrationsService) {}
 onModuleInit():void {this.registry.registerAdapter(new MockOneCAdapter(this.pool));}
 async onModuleDestroy():Promise<void> {await this.pool.end();}
 private local():void {if(process.env.AGRO_DEPLOYMENT_MODE!=='LOCAL_PRIMARY')throw Error('LOCAL_PRIMARY_REQUIRED');}
 /** Trusted server composition supplies actual owner application commands. No default business handler. */
 registerOwner(owner:OwnerCommand):void {
  this.registry.registerCommand({operation:owner.operation,
   validate:async(tx,actor,e,mapped)=>{
    const b=await bindingFor(tx,e);
    if(e.direction!=='INBOUND')throw new ConnectorError('ONE_C_BINDING_MISMATCH');
    validateAttributes(mapped,b);await owner.validate(tx,actor,e,mapped);
   },execute:(tx,actor,e,mapped)=>owner.execute(tx,actor,e,mapped)});
 }
 async configure(actor:IntegrationActor,profile:Profile,binding:OneCBinding):Promise<void> {
  this.local();await this.registry.authorize(actor,'CONFIGURE',profile.id);validateBinding(binding);
  if(profile.adapter!==ONE_C_MOCK||profile.schemaVersion!==MOCK_SCHEMA||profile.id!==binding.profileId||profile.version!==binding.profileVersion||
   !Array.isArray(profile.mapping)||profile.mapping.map(f=>f.to).sort().join('\0')!==Object.keys(binding.fields).sort().join('\0'))throw new ConnectorError('ONE_C_BINDING_MISMATCH');
  if(binding.direction==='INBOUND')this.registry.command(binding.operation);
  // Framework owns immutable profile validation. A failed binding commit can leave an inert
  // unbound profile; no 1C execution succeeds without its matching immutable binding.
  await this.framework.configure(actor,profile);
  const tx=await this.pool.connect();
  try {
   await tx.query('BEGIN');
   const r=await tx.query(`INSERT INTO integrations.one_c_binding(tenant_id,profile_id,profile_version,config) VALUES($1,$2,$3,$4)
    ON CONFLICT DO NOTHING RETURNING config`,[actor.tenantId,profile.id,profile.version,binding]);
   if(!r.rowCount) {
    const previous=(await tx.query('SELECT config FROM integrations.one_c_binding WHERE tenant_id=$1 AND profile_id=$2 AND profile_version=$3',[actor.tenantId,profile.id,profile.version])).rows[0];
    if(fingerprint(previous.config)!==fingerprint(binding))throw Error('ONE_C_BINDING_IMMUTABLE');
   } else await tx.query("INSERT INTO integrations.audit_entry(tenant_id,actor,action,detail) VALUES($1,$2,'ONE_C_CONFIGURED',$3)",[actor.tenantId,actor,{profileId:profile.id,version:profile.version}]);
   await tx.query('COMMIT');
  }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
 }
 async stage(actor:IntegrationActor,e:Envelope):Promise<string> {
  this.local();await this.registry.authorize(actor,'STAGE',e.profileId);
  if(actor.tenantId!==e.tenantId)throw Error('INTEGRATION_FORBIDDEN');
  await bindingFor(this.pool,e);return this.framework.stage(actor,e);
 }
 async reconcile(actor:IntegrationActor,profileId:string,profileVersion:number,observation:Observation):Promise<Record<string,unknown>> {
  this.local();await this.registry.authorize(actor,'EXECUTE',profileId);
  if(!identifier(observation?.key)||!identifier(observation.correlationId)||!identifier(observation.observedAt)||!Number.isFinite(Date.parse(observation.observedAt)))throw Error('ONE_C_OBSERVATION_INVALID');
  const differences=compareSnapshots(observation.local,observation.external);
  const saved={key:observation.key,local:observation.local,external:observation.external,observedAt:observation.observedAt,correlationId:observation.correlationId};
  const hash=fingerprint(saved);const tx=await this.pool.connect();
  try {
   await tx.query('BEGIN');
   const binding=await tx.query('SELECT 1 FROM integrations.one_c_binding WHERE tenant_id=$1 AND profile_id=$2 AND profile_version=$3',[actor.tenantId,profileId,profileVersion]);
   if(!binding.rowCount)throw Error('ONE_C_BINDING_MISMATCH');
   const r=await tx.query(`INSERT INTO integrations.one_c_reconciliation(tenant_id,profile_id,profile_version,observation_key,intent_hash,observation,differences,actor)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING *`,[actor.tenantId,profileId,profileVersion,observation.key,hash,saved,JSON.stringify(differences),actor]);
   let row=r.rows[0];
   if(!row) {
    row=(await tx.query('SELECT * FROM integrations.one_c_reconciliation WHERE tenant_id=$1 AND profile_id=$2 AND profile_version=$3 AND observation_key=$4',[actor.tenantId,profileId,profileVersion,observation.key])).rows[0];
    if(row.intent_hash!==hash)throw Error('IDEMPOTENCY_CONFLICT');
   }else {
    await tx.query("INSERT INTO integrations.audit_entry(tenant_id,actor,action,detail) VALUES($1,$2,'ONE_C_RECONCILIATION',$3)",[actor.tenantId,actor,{reconciliationId:row.id,profileId,differences}]);
    await tx.query('INSERT INTO integrations.one_c_reconciliation_outbox(reconciliation_id,tenant_id) VALUES($1,$2)',[row.id,actor.tenantId]);
   }
   await tx.query('COMMIT');return row;
  }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
 }
 async observations(actor:IntegrationActor,profileId:string):Promise<Record<string,unknown>[]> {
  await this.registry.authorize(actor,'READ',profileId);
  return (await this.pool.query('SELECT id,profile_version,observation_key,observation,differences,state,recorded_at FROM integrations.one_c_reconciliation WHERE tenant_id=$1 AND profile_id=$2 ORDER BY id DESC LIMIT 100',[actor.tenantId,profileId])).rows;
 }
}
