import { Injectable } from '@nestjs/common';
import { UUID } from '../gis/gis.validation';
import { LAND_ACTIONS, type LandActor, type LandPolicy } from './land.types';
@Injectable()
export class LandRegistry {
 private policy: LandPolicy=async()=>false;
 private installed=false;
 installPolicy(policy:LandPolicy):void {if(this.installed||typeof policy!=='function')throw Error('LAND_POLICY_IMMUTABLE');this.policy=policy;this.installed=true;}
 async authorize(actor:LandActor,action:string):Promise<void>{
  let allowed=false;
  try{allowed=typeof actor?.tenantId==='string'&&UUID.test(actor.tenantId)&&typeof actor?.subjectId==='string'&&UUID.test(actor.subjectId)&&LAND_ACTIONS.has(action)&&await this.policy(Object.freeze({...actor}),action);}catch{allowed=false;}
  if(!allowed)throw Error('LAND_FORBIDDEN');
 }
}
