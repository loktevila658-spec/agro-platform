import { Injectable } from '@nestjs/common';
import { GIS_ACTIONS, type GisActor, type GisPolicy } from './gis.types';
import { UUID } from './gis.validation';
@Injectable()
export class GisRegistry {
 private policy:GisPolicy=async()=>false;
 private installed=false;
 installPolicy(policy:GisPolicy):void{if(this.installed||typeof policy!=='function')throw Error('GIS_POLICY_IMMUTABLE');this.policy=policy;this.installed=true;}
 async authorize(actor:GisActor,action:string):Promise<void>{
  let allowed=false;try{allowed=typeof actor?.tenantId==='string'&&UUID.test(actor.tenantId)&&typeof actor?.subjectId==='string'&&UUID.test(actor.subjectId)&&GIS_ACTIONS.has(action)&&await this.policy(Object.freeze({...actor}),action);}catch{allowed=false;}
  if(!allowed)throw Error('GIS_FORBIDDEN');
 }
}
