import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { ConnectorError, fingerprint } from '../../../../../../packages/connectors/src/index.cjs';
import type { Connector, Context, Envelope, Submission } from '../../../../../../packages/connectors/src/index.cjs';
import { MOCK_SCHEMA, ONE_C_MOCK } from './one-c.types';
import type { MockFaults, OneCBinding } from './one-c.types';
import { validateAttributes } from './one-c.policy';
export async function bindingFor(tx:Pool|PoolClient,e:Envelope):Promise<OneCBinding> {
 const r=await tx.query('SELECT config FROM integrations.one_c_binding WHERE tenant_id=$1 AND profile_id=$2 AND profile_version=$3',[e.tenantId,e.profileId,e.profileVersion]);
 const b=r.rows[0]?.config as OneCBinding|undefined;
 if(!b||e.direction!==b.direction||e.operation!==b.operation||e.entityType!==b.entityType)throw new ConnectorError('ONE_C_BINDING_MISMATCH');
 return b;
}
/** No HTTP client, URL, credentials, provider SDK or production transport. */
export class MockOneCAdapter implements Connector {
 readonly code=ONE_C_MOCK;
 constructor(private readonly pool:Pool,private readonly faults:MockFaults={}) {}
 async validate(payload:Record<string,unknown>,schemaVersion:string):Promise<void> {
  if(schemaVersion!==MOCK_SCHEMA)throw new ConnectorError('SCHEMA_CHANGED');
  if(!payload||Array.isArray(payload)||typeof payload!=='object')throw new ConnectorError('VALIDATION');
 }
 private async job(ctx:Context):Promise<Envelope> {
  const r=await this.pool.query('SELECT envelope FROM integrations.job WHERE tenant_id=$1 AND id=$2 AND profile_id=$3 AND idempotency_key=$4',[ctx.tenantId,ctx.jobId,ctx.profileId,ctx.idempotencyKey]);
  const e=r.rows[0]?.envelope as Envelope|undefined;
  if(!e||e.direction!=='OUTBOUND')throw new ConnectorError('ONE_C_BINDING_MISMATCH');return e;
 }
 async submit(mapped:Record<string,unknown>,ctx:Context):Promise<Submission> {
  const e=await this.job(ctx);const b=await bindingFor(this.pool,e);validateAttributes(mapped,b);
  await this.faults.beforeSubmit?.();
  if(ctx.signal.aborted)throw new ConnectorError('TIMEOUT');
  const hash=fingerprint(mapped);
  const result:Submission={status:'ACCEPTED',externalId:randomUUID(),metadata:{mock:true,postingStatus:'MOCK_ACCEPTED'}};
  await this.pool.query(`INSERT INTO integrations.one_c_mock_receipt(tenant_id,profile_id,idempotency_key,intent_hash,result,provenance)
   VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,[ctx.tenantId,ctx.profileId,ctx.idempotencyKey,hash,result,{jobId:e.id,observedAt:e.observedAt,correlationId:e.correlationId,source:'ONE_C_MOCK'}]);
  const receipt=(await this.pool.query('SELECT intent_hash,result FROM integrations.one_c_mock_receipt WHERE tenant_id=$1 AND profile_id=$2 AND idempotency_key=$3',[ctx.tenantId,ctx.profileId,ctx.idempotencyKey])).rows[0];
  if(receipt.intent_hash!==hash)throw new ConnectorError('IDEMPOTENCY_CONFLICT');
  await this.faults.afterSubmit?.();return receipt.result as Submission;
 }
 async reconcile(ctx:Context):Promise<Submission|{status:'NOT_FOUND'|'UNKNOWN'}> {
  await this.job(ctx);await this.faults.beforeReconcile?.();
  if(ctx.signal.aborted)throw new ConnectorError('TIMEOUT');
  const r=await this.pool.query('SELECT result FROM integrations.one_c_mock_receipt WHERE tenant_id=$1 AND profile_id=$2 AND idempotency_key=$3',[ctx.tenantId,ctx.profileId,ctx.idempotencyKey]);
  // Conclusive only for this durable mock store. No claim about a real 1C system.
  return r.rows[0]?.result??{status:'NOT_FOUND'};
 }
}
