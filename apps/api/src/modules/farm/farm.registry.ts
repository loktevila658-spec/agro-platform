import { Injectable } from '@nestjs/common';
import { UUID } from '../gis/gis.validation';
import { FARM_ACTIONS, type FarmActor, type FarmPolicy } from './farm.types';
@Injectable()
export class FarmRegistry {
 private policy: FarmPolicy=async()=>false;
 private installed=false;
 installPolicy(policy:FarmPolicy):void {if(this.installed||typeof policy!=='function')throw Error('FARM_POLICY_IMMUTABLE');this.policy=policy;this.installed=true;}
 async authorize(actor:FarmActor,action:string):Promise<void>{
  let allowed=false;
  try{allowed=typeof actor?.tenantId==='string'&&UUID.test(actor.tenantId)&&typeof actor?.subjectId==='string'&&UUID.test(actor.subjectId)&&FARM_ACTIONS.has(action)&&await this.policy(Object.freeze({...actor}),action);}catch{allowed=false;}
  if(!allowed)throw Error('FARM_FORBIDDEN');
 }
}
