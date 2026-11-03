import { Injectable, OnModuleInit } from '@nestjs/common';
import { SyncRegistry } from '../sync/sync.registry';
import { TASK_COMMANDS } from './tasks.types';
import { TasksService, executorActions, projection } from './tasks.service';
@Injectable()
export class TasksSync implements OnModuleInit {
 constructor(private readonly sync:SyncRegistry,private readonly service:TasksService){}
 onModuleInit():void{
  const s=this.service;
  this.sync.registerProjectionPolicy('Task',async(actor,id)=>{const r=await s.row(s.pool,actor,id);return !!r&&await s.registry.can(actor,'task.read',r);});
  this.sync.registerFilePolicy('Task',async req=>{try{const actor={tenantId:req.tenantId,userId:req.actorId,deviceId:'',sessionId:''};const r=await s.row(s.pool,actor,req.ownerRef.slice(5));return !!r&&await s.registry.can(actor,'task.read',r)&&(req.action==='file.read'||(r.executor_user_ids.includes(actor.userId)&&await s.registry.can(actor,'task.complete',r)));}catch{return false;}});
  for(const action of TASK_COMMANDS)this.sync.register({commandType:`Task.${action}`,version:1,requiresVersion:true,
   authorize:(tx,a,c)=>s.authorize(tx,a,c),assertVersion:(tx,a,c)=>s.assertVersion(tx,a,c),
   currentState:async(tx,a,c)=>{const r=await s.row(tx,a,c.aggregate.id);return r?projection(r) as unknown as Record<string,unknown>:{};},
   execute:(tx,a,c)=>s.apply(tx,a,c),
   offlinePolicy:async actor=>{
    if(!executorActions.has(action))return undefined;const ttl=s.registry.ttl;if(!Number.isSafeInteger(ttl)||!ttl||ttl<=0||ttl>7*86400)return undefined;
    const rows=await s.pool.query("SELECT * FROM tasks.work_order WHERE tenant_id=$1 AND $2=ANY(executor_user_ids) ORDER BY id LIMIT 500",[actor.tenantId,actor.userId]);
    const owners=[];for(const r of rows.rows){if(['ASSIGNED','ACCEPTED','IN_PROGRESS','PAUSED'].includes(r.status)&&await s.can(actor,action,r))owners.push(`Task:${r.id}`);}
    return owners.length?{owners,risk:'O1',ttlSeconds:ttl}:undefined;
   },
  });
 }
}
