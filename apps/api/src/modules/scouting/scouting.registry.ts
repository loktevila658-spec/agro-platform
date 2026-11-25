import { ForbiddenException, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { SyncActor } from '../sync/sync.types';
import { SCOUTING_ACTIONS, type ScoutingPolicy, type ObservationData } from './scouting.types';
import { UUID } from './scouting.validation';
@Injectable()
export class ScoutingRegistry {
 private policy?:ScoutingPolicy;
 install(p:ScoutingPolicy){if(this.policy)throw Error('SCOUTING_POLICY_IMMUTABLE');if(!p||['authorize','captureScopes','observer','form'].some(k=>typeof p[k as keyof ScoutingPolicy]!=='function')||(p.offlineTtlSeconds!==undefined&&(!Number.isSafeInteger(p.offlineTtlSeconds)||p.offlineTtlSeconds<1||p.offlineTtlSeconds>604800)))throw Error('SCOUTING_POLICY_INVALID');this.policy=Object.freeze({...p});}
 get ttl(){return this.policy?.offlineTtlSeconds;}
 async can(a:SyncActor,action:string,org:string){try{return UUID.test(a.tenantId)&&UUID.test(a.userId)&&UUID.test(org)&&SCOUTING_ACTIONS.has(action)&&!!await this.policy?.authorize(Object.freeze({...a}),action,org);}catch{return false;}}
 async scopes(a:SyncActor){const r=await this.policy?.captureScopes(Object.freeze({...a}));if(!Array.isArray(r)||r.length>1000||r.some(s=>!UUID.test(s.organizationId)||!UUID.test(s.fieldSeasonId))||new Set(r.map(s=>s.fieldSeasonId)).size!==r.length)throw new ForbiddenException('SCOUTING_SCOPE_UNAVAILABLE');return structuredClone(r);}
 async observer(tx:PoolClient,a:SyncActor,org:string){const r=await this.policy?.observer(tx,Object.freeze({...a}),org);if(!r||!UUID.test(r.employeeId)||!UUID.test(r.revisionId))throw new ForbiddenException('SCOUTING_OBSERVER_UNAVAILABLE');return {employeeId:r.employeeId,revisionId:r.revisionId};}
 async form(a:SyncActor,f:ObservationData['form']){if(f&&!await this.policy?.form(Object.freeze({...a}),Object.freeze(structuredClone(f))))throw new ForbiddenException('SCOUTING_FORM_UNAVAILABLE');}
}
