import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { FarmService } from '../farm/farm.service';
import { SyncConflict, type SyncActor, type SyncChange, type SyncCommand } from '../sync/sync.types';
import { TasksRegistry } from './tasks.registry';
import { TASK_COMMANDS, type TaskAction, type TaskDefinition, type TaskProjection, type TaskRow } from './tasks.types';
import { V7, iso, nextState, object, validateAction } from './tasks.validation';
export const TASKS_POOL=Symbol('TASKS_POOL');
export const executorActions=new Set<TaskAction>(['Accept','Start','Pause','Resume','Complete']);
export function projection(r:TaskRow):TaskProjection{return {id:r.id,version:Number(r.version),status:r.status,organizationId:r.organization_id,definition:r.definition,assignment:r.assignment,targetProvenance:r.target_provenance,requiresQuantity:r.quantity_required,...(r.started_at?{startedAt:new Date(r.started_at).toISOString()}:{}),...(r.last_observed_at?{lastObservedAt:new Date(r.last_observed_at).toISOString()}:{})};}
@Injectable()
export class TasksService implements OnModuleDestroy {
 constructor(@Inject(TASKS_POOL) readonly pool:Pool,readonly registry:TasksRegistry,private readonly farm:FarmService){}
 async onModuleDestroy():Promise<void>{await this.pool.end();}
 async row(tx:Pool|PoolClient,actor:SyncActor,id:string,lock=false):Promise<TaskRow|undefined>{if(!V7.test(id))throw new BadRequestException('TASK_INVALID_ID');return(await tx.query<TaskRow>(`SELECT * FROM tasks.work_order WHERE tenant_id=$1 AND id=$2${lock?' FOR UPDATE':''}`,[actor.tenantId,id])).rows[0];}
 async can(actor:SyncActor,action:TaskAction,row?:TaskRow):Promise<boolean>{return await this.registry.can(actor,`task.${action.toLowerCase()}`,row)&&(!executorActions.has(action)||!!row?.executor_user_ids.includes(actor.userId));}
 async read(actor:SyncActor,id:string):Promise<TaskProjection>{const row=await this.row(this.pool,actor,id);if(!row||!await this.registry.can(actor,'task.read',row))throw new NotFoundException('Task not available');return projection(row);}
 async list(actor:SyncActor,after?:string):Promise<{tasks:TaskProjection[];nextAfter?:string}>{if(after!==undefined&&!V7.test(after))throw new BadRequestException('TASK_INVALID_CURSOR');const rows=(await this.pool.query<TaskRow>('SELECT * FROM tasks.work_order WHERE tenant_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT 500',[actor.tenantId,after??null])).rows;const result=[];for(const r of rows)if(await this.registry.can(actor,'task.read',r))result.push(projection(r));return {tasks:result,...(rows.length===500?{nextAfter:rows.at(-1)!.id}:{})};}
 action(command:SyncCommand):TaskAction{const action=command.type.slice(5) as TaskAction;if(command.aggregate.type!=='Task'||!V7.test(command.aggregate.id)||command.type!==`Task.${action}`||!TASK_COMMANDS.includes(action)||command.commandVersion!==1)throw new BadRequestException('TASK_INVALID_COMMAND');return action;}
 async authorize(tx:PoolClient,actor:SyncActor,c:SyncCommand):Promise<boolean>{const action=this.action(c),r=action==='Create'?undefined:await this.row(tx,actor,c.aggregate.id);return this.can(actor,action,r);}
 async assertVersion(tx:PoolClient,actor:SyncActor,c:SyncCommand):Promise<boolean>{const r=await this.row(tx,actor,c.aggregate.id,true);return c.type==='Task.Create'?!r&&c.baseVersion===0:!!r&&Number(r.version)===c.baseVersion;}
 async apply(tx:PoolClient,actor:SyncActor,c:SyncCommand):Promise<{canonical:Record<string,unknown>;aggregateVersion:number;changes:SyncChange[]}>{
  if(process.env.AGRO_DEPLOYMENT_MODE!=='LOCAL_PRIMARY')throw new ForbiddenException('AUTHORITY_MODE_MISMATCH');
  const action=this.action(c);validateAction(action,c.payload);if(!iso(c.observedAt)||!object(c.provenance))throw new BadRequestException('TASK_INVALID_PROVENANCE');
  const before=await this.row(tx,actor,c.aggregate.id,true);if(!await this.can(actor,action,before))throw new ForbiddenException('TASK_FORBIDDEN');
  if((action==='Create'&&(before||c.baseVersion!==0))||(action!=='Create'&&(!before||Number(before.version)!==c.baseVersion)))throw new SyncConflict('VERSION_CONFLICT',before?projection(before) as unknown as Record<string,unknown>:{});
  let row:TaskRow;
  if(action==='Create'){
   const definition=c.payload as unknown as TaskDefinition;
   if(!await this.registry.operation(actor,definition.operationTypeId))throw new BadRequestException('TASK_OPERATION_TYPE_UNAVAILABLE');
   let ref:Record<string,unknown>;try{ref=await this.farm.taskReferenceInTransaction(tx,{tenantId:actor.tenantId,subjectId:actor.userId},definition.targetId,definition.targetType);}catch{throw new BadRequestException('TASK_TARGET_UNAVAILABLE');}
   const required=await this.registry.quantityRequired(actor,definition.operationTypeId);if(required&&!definition.uom)throw new BadRequestException('TASK_QUANTITY_UNIT_REQUIRED');
   const candidate={quantity_required:required,tenant_id:actor.tenantId,id:c.aggregate.id,organization_id:ref.organization_id,version:'1',status:'DRAFT',definition,assignment:{},executor_user_ids:[],target_provenance:ref,started_at:null,last_observed_at:null} as TaskRow;
   if(!await this.registry.can(actor,'task.create',candidate))throw new ForbiddenException('TASK_SCOPE_DENIED');
   const inserted=await tx.query<TaskRow>("INSERT INTO tasks.work_order(tenant_id,id,organization_id,version,status,definition,target_provenance,last_observed_at,quantity_required) VALUES($1,$2,$3,1,'DRAFT',$4,$5,$6,$7) RETURNING *",[actor.tenantId,c.aggregate.id,ref.organization_id,definition,ref,c.observedAt,required]);row=inserted.rows[0]!;
  }else{
   const r=before!;let status;try{status=nextState(r.status,action);}catch{throw new SyncConflict('STATE_CONFLICT',projection(r) as unknown as Record<string,unknown>);}
   // Observed device time is evidence, not ordering authority. Start/completion
   // interval must still be valid; future clock values are retained, never rewritten.
   if(action==='Complete'&&((r.quantity_required&&c.payload.actualQty===undefined)||(c.payload.actualQty!==undefined&&c.payload.uom!==r.definition.uom)||!r.started_at||Date.parse(c.observedAt)<new Date(r.started_at).getTime()))throw new BadRequestException('TASK_INVALID_COMPLETION_INTERVAL_OR_UNIT');
   let assignment=r.assignment,executors=r.executor_user_ids;
   if(action==='Assign'){
    const employeeIds=c.payload.employeeIds as string[];if(!await this.registry.assets(actor,(c.payload.assetIds??[]) as string[]))throw new BadRequestException('TASK_ASSET_REFERENCE_UNAVAILABLE');
    try{executors=await this.registry.employees(actor,employeeIds);}catch{throw new BadRequestException('TASK_EMPLOYEE_UNRESOLVED');}
    assignment={employeeIds,assetIds:c.payload.assetIds??[],resolvedUserIds:executors};
   }
   row=(await tx.query<TaskRow>('UPDATE tasks.work_order SET version=version+1,status=$3,assignment=$4,executor_user_ids=$5,started_at=CASE WHEN $6 THEN $7::timestamptz ELSE started_at END,last_observed_at=$7 WHERE tenant_id=$1 AND id=$2 RETURNING *',[actor.tenantId,c.aggregate.id,status,assignment,executors,action==='Start',c.observedAt])).rows[0]!;
   if(action==='Complete')await tx.query('INSERT INTO tasks.operation_fact(tenant_id,task_id,id,actual_qty,uom,started_at,completed_at,actor_id,evidence,provenance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[actor.tenantId,row.id,c.localCommandId,c.payload.actualQty??null,c.payload.uom??null,row.started_at,c.observedAt,actor.userId,c.attachments,c.provenance]);
  }
  const after=projection(row),correlationId=typeof c.provenance.correlationId==='string'?c.provenance.correlationId:c.localCommandId;
  await tx.query('INSERT INTO tasks.transition(tenant_id,task_id,version,command_id,action,actor_id,observed_at,before_value,after_value,provenance,correlation_id,causation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[actor.tenantId,row.id,row.version,c.localCommandId,action,actor.userId,c.observedAt,before?projection(before):null,after,c.provenance,correlationId,c.localCommandId]);
  const eventId=randomUUID(),occurredAt=new Date().toISOString(),payload={eventId,entityId:row.id,entityType:'Task',tenantId:actor.tenantId,actorId:actor.userId,correlationId,causationId:c.localCommandId,occurredAt,revision:row.version};
  await tx.query("INSERT INTO tasks.outbox_event(id,tenant_id,event_name,event_version,producer,entity_id,actor_id,correlation_id,causation_id,occurred_at,payload) VALUES($1,$2,'task.changed','1.0.0','tasks',$3,$4,$5,$6,$7,$8)",[eventId,actor.tenantId,row.id,actor.userId,correlationId,c.localCommandId,occurredAt,payload]);
  // Current recipient scope is rechecked at every pull. Assignment adds its
  // resolved users; manager visibility requires current explicit read policy.
  const users=[...new Set([actor.userId,...row.executor_user_ids])];
  return {canonical:after as unknown as Record<string,unknown>,aggregateVersion:after.version,changes:[{entityType:'Task',entityId:row.id,entityVersion:after.version,op:'UPSERT',projection:after as unknown as Record<string,unknown>,visibleUserIds:users}]};
 }
}
