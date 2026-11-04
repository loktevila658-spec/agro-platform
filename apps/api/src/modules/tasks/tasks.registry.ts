import { Injectable } from '@nestjs/common';
import type { SyncActor } from '../sync/sync.types';
import { TASK_ACTIONS, type TaskPolicy, type TaskRow, type TaskDefinition } from './tasks.types';
import { UUID } from './tasks.validation';
@Injectable()
export class TasksRegistry {
 private policy?:TaskPolicy;
 install(policy:TaskPolicy):void {if(this.policy)throw Error('TASK_POLICY_IMMUTABLE');if(!policy||typeof policy.authorize!=='function'||typeof policy.resolveEmployee!=='function'||typeof policy.operationType!=='function'||typeof policy.quantityRequired!=='function')throw Error('TASK_INVALID_POLICY');this.policy=policy;}
 async can(actor:SyncActor,action:string,row?:TaskRow):Promise<boolean>{try{return UUID.test(actor.tenantId)&&UUID.test(actor.userId)&&TASK_ACTIONS.has(action)&&(!row||row.tenant_id===actor.tenantId)&&!!await this.policy?.authorize(Object.freeze({...actor}),action,row?Object.freeze(structuredClone(row)):undefined);}catch{return false;}}
 async employees(actor:SyncActor,ids:string[]):Promise<string[]>{const all=[];for(const id of ids){const users=await this.policy?.resolveEmployee(Object.freeze({...actor}),id);if(!users?.length||users.some(u=>!UUID.test(u)))throw Error('TASK_EMPLOYEE_UNRESOLVED');all.push(...users);}return [...new Set(all)].sort();}
 async operation(actor:SyncActor,id:string,definition:TaskDefinition):Promise<boolean>{return !!await this.policy?.operationType(Object.freeze({...actor}),id,Object.freeze({...definition}));}
 async quantityRequired(actor:SyncActor,id:string):Promise<boolean>{const value=await this.policy?.quantityRequired(Object.freeze({...actor}),id);if(typeof value!=='boolean')throw Error('TASK_QUANTITY_POLICY_UNAVAILABLE');return value;}
 async assets(actor:SyncActor,ids:string[]):Promise<boolean>{return ids.length===0||!!await this.policy?.validateAssets?.(Object.freeze({...actor}),[...ids]);}
 get ttl():number|undefined{return this.policy?.offlineTtlSeconds;}
}
