export interface RetryPolicy { maxAttempts:number; baseDelayMs:number; maxDelayMs:number; jitter:number; timeoutMs:number; }
export interface MappingRule { from:string[]; to:string; required?:boolean; dictionary?:Record<string,unknown>; }
export interface Profile {
 id:string; adapter:string; version:number; schemaVersion:string; mapping:MappingRule[]; retry:RetryPolicy;
}
export interface Envelope {
 id:string; tenantId:string; profileId:string; profileVersion:number; direction:'INBOUND'|'OUTBOUND';
 idempotencyKey:string; operation:string; entityType:string; localId:string; externalId:string;
 schemaVersion:string; observedAt:string; correlationId:string; payload:Record<string,unknown>; provenance:Record<string,unknown>;
}
export interface Context { tenantId:string; profileId:string; jobId:string; idempotencyKey:string; correlationId:string; signal:AbortSignal; }
export interface Submission { status:'ACCEPTED'|'SENT'; externalId:string; metadata:Record<string,unknown>; }
/** No database handle, credentials or arbitrary domain command execution is exposed to adapters. */
export interface Connector {
 code:string;
 validate(payload:Record<string,unknown>, schemaVersion:string):Promise<void>;
 submit(payload:Record<string,unknown>,context:Context):Promise<Submission>;
 /** NOT_FOUND must be conclusive; UNKNOWN must never authorize a resend. */
 reconcile(context:Context):Promise<Submission|{status:'NOT_FOUND'|'UNKNOWN'}>;
}
export class ConnectorError extends Error { constructor(code:string,retryAfterMs?:number); code:string; retryable:boolean; retryAfterMs?:number; }
export function fingerprint(value:unknown):string;
export function validatePolicy(policy:RetryPolicy):void;
export function retryDelay(policy:RetryPolicy,attempt:number,random:number,retryAfterMs?:number):number;
export function mapRecord(input:Record<string,unknown>,rules:MappingRule[]):Record<string,unknown>;
