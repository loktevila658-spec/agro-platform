import { BadRequestException } from '@nestjs/common';
import type { TaskAction, TaskDefinition, TaskState } from './tasks.types';
export const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const V7=/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const decimal=(x:unknown):x is string=>typeof x==='string'&&/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/.test(x);
export const iso=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-.*Z$/.test(x)&&Number.isFinite(Date.parse(x));
export function object(x:unknown):x is Record<string,unknown>{return !!x&&typeof x==='object'&&!Array.isArray(x);}
export function keys(x:unknown,allowed:string[]):asserts x is Record<string,unknown>{if(!object(x)||Object.keys(x).some(k=>!allowed.includes(k)))throw new BadRequestException('TASK_INVALID_PAYLOAD');}
export function validateDefinition(x:TaskDefinition):void{
 keys(x,['operationTypeId','targetType','targetId','plannedStart','plannedEnd','plannedQty','uom','priority']);
 if(!UUID.test(x.operationTypeId)||!UUID.test(x.targetId)||!['FIELD','FIELD_SEASON'].includes(x.targetType)||!Number.isInteger(x.priority)||x.priority<0||x.priority>100||
 (x.plannedStart!==undefined&&!iso(x.plannedStart))||(x.plannedEnd!==undefined&&!iso(x.plannedEnd))||(x.plannedStart&&x.plannedEnd&&Date.parse(x.plannedEnd)<Date.parse(x.plannedStart))||
 (x.plannedQty!==undefined&&!decimal(x.plannedQty))||(x.uom!==undefined&&(typeof x.uom!=='string'||!x.uom.trim()||x.uom.length>16))||(x.plannedQty!==undefined&&!x.uom))throw new BadRequestException('TASK_INVALID_DEFINITION');
}
export function validateAction(action:TaskAction,p:Record<string,unknown>):void{
 if(action==='Create'){validateDefinition(p as unknown as TaskDefinition);return;}
 const allowed=action==='Assign'?['employeeIds','assetIds']:action==='Complete'?['actualQty','uom','comment']:['reason'];keys(p,allowed);
 if(action==='Assign'){
  if(!Array.isArray(p.employeeIds)||p.employeeIds.length===0||p.employeeIds.length>100||p.employeeIds.some(x=>typeof x!=='string'||!UUID.test(x))||new Set(p.employeeIds).size!==p.employeeIds.length||
  (p.assetIds!==undefined&&(!Array.isArray(p.assetIds)||p.assetIds.length>100||p.assetIds.some(x=>typeof x!=='string'||!UUID.test(x))||new Set(p.assetIds).size!==p.assetIds.length)))throw new BadRequestException('TASK_INVALID_ASSIGNMENT');
 }
 if(action==='Complete'&&((p.actualQty!==undefined&&(!decimal(p.actualQty)||typeof p.uom!=='string'||!p.uom.trim()||p.uom.length>16))||(p.actualQty===undefined&&p.uom!==undefined)||(p.comment!==undefined&&(typeof p.comment!=='string'||p.comment.length>4000))))throw new BadRequestException('TASK_INVALID_COMPLETION');
 if(p.reason!==undefined&&(typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>4000))throw new BadRequestException('TASK_INVALID_REASON');
 if(['Pause','Cancel','Abort','Return'].includes(action)&&!p.reason)throw new BadRequestException('TASK_INVALID_REASON');
}
export function nextState(state:TaskState,action:TaskAction):TaskState{
 const rules:Partial<Record<TaskAction,Partial<Record<TaskState,TaskState>>>>={Plan:{DRAFT:'PLANNED'},Assign:{PLANNED:'ASSIGNED'},Accept:{ASSIGNED:'ACCEPTED'},Start:{ACCEPTED:'IN_PROGRESS'},Pause:{IN_PROGRESS:'PAUSED'},Resume:{PAUSED:'IN_PROGRESS'},Complete:{IN_PROGRESS:'COMPLETED',PAUSED:'COMPLETED'},Verify:{COMPLETED:'VERIFIED'},Close:{VERIFIED:'CLOSED'},Return:{COMPLETED:'RETURNED'},Cancel:{DRAFT:'CANCELLED',PLANNED:'CANCELLED',ASSIGNED:'CANCELLED',ACCEPTED:'CANCELLED'},Abort:{IN_PROGRESS:'ABORTED',PAUSED:'ABORTED'}};
 const next=rules[action]?.[state];if(!next)throw Error('STATE_CONFLICT');return next;
}
