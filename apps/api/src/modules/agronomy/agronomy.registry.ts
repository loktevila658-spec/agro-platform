import { ForbiddenException, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AGRONOMY_ACTIONS, type AgronomyActor, type AgronomyPolicy, type OwnerReference, type PlannedResource } from './agronomy.types';
import { UUID } from './agronomy.validation';
@Injectable()
export class AgronomyRegistry {
 private policy?:AgronomyPolicy;
 install(policy:AgronomyPolicy):void{if(this.policy)throw Error('AGRONOMY_POLICY_IMMUTABLE');if(!policy||typeof policy.authorize!=='function'||typeof policy.reference!=='function'||typeof policy.formula!=='function')throw Error('AGRONOMY_POLICY_INVALID');this.policy=policy;}
 async authorize(actor:AgronomyActor,action:string,org?:string):Promise<void>{let ok=false;try{ok=UUID.test(actor.tenantId)&&UUID.test(actor.subjectId)&&AGRONOMY_ACTIONS.has(action)&&!!await this.policy?.authorize(Object.freeze({...actor}),action,org);}catch{}if(!ok)throw new ForbiddenException('AGRONOMY_FORBIDDEN');}
 async reference(tx:PoolClient,actor:AgronomyActor,type:'OPERATION'|'MACHINE'|'LABOR'|'CROP',id:string,org:string):Promise<OwnerReference>{const r=await this.policy?.reference(tx,Object.freeze({...actor}),type,id,org);if(!r||r.id!==id||!UUID.test(r.revisionId)||(r.organizationId!==undefined&&r.organizationId!==org))throw new ForbiddenException('AGRONOMY_REFERENCE_UNAVAILABLE');return {id:r.id,revisionId:r.revisionId,...(r.organizationId?{organizationId:r.organizationId}:{})};}
 async formula(actor:AgronomyActor,r:PlannedResource):Promise<void>{if(!await this.policy?.formula(Object.freeze({...actor}),Object.freeze({...r})))throw new ForbiddenException('AGRONOMY_FORMULA_UNIT_UNAVAILABLE');}
}
