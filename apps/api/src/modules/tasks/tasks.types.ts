import type { PoolClient } from 'pg';
import type { SyncActor, SyncCommand } from '../sync/sync.types';
export const TASK_ACTIONS = new Set(['task.read','task.create','task.plan','task.assign','task.accept','task.start','task.pause','task.resume','task.complete','task.verify','task.close','task.return','task.cancel','task.abort']);
export const TASK_COMMANDS = ['Create','Plan','Assign','Accept','Start','Pause','Resume','Complete','Verify','Close','Return','Cancel','Abort'] as const;
export type TaskAction=typeof TASK_COMMANDS[number];
export type TaskState='DRAFT'|'PLANNED'|'ASSIGNED'|'ACCEPTED'|'IN_PROGRESS'|'PAUSED'|'COMPLETED'|'VERIFIED'|'CLOSED'|'RETURNED'|'CANCELLED'|'ABORTED';
export interface TaskDefinition {operationTypeId:string;targetType:'FIELD'|'FIELD_SEASON';targetId:string;plannedStart?:string;plannedEnd?:string;plannedQty?:string;uom?:string;priority:number;}
export interface TaskRow {tenant_id:string;id:string;organization_id:string;version:string;status:TaskState;definition:TaskDefinition;assignment:Record<string,unknown>;executor_user_ids:string[];target_provenance:Record<string,unknown>;started_at:string|null;last_observed_at:string|null;}
export interface TaskPolicy {
 authorize(actor:Readonly<SyncActor>,action:string,task?:Readonly<TaskRow>):Promise<boolean>;
 resolveEmployee(actor:Readonly<SyncActor>,employeeId:string):Promise<string[]>;
 operationType(actor:Readonly<SyncActor>,operationTypeId:string):Promise<boolean>;
 offlineTtlSeconds?:number;
}
export interface TaskRequest {scopeVersion:number;command:SyncCommand;}
export interface TaskProjection {id:string;version:number;status:TaskState;organizationId:string;definition:TaskDefinition;assignment:Record<string,unknown>;targetProvenance:Record<string,unknown>;startedAt?:string;lastObservedAt?:string;}
export type TaskTransaction=PoolClient;
