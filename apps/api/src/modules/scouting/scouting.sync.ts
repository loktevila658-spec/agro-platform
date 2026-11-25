import { Injectable, OnModuleInit } from '@nestjs/common';
import { SyncRegistry } from '../sync/sync.registry';
import { ScoutingService } from './scouting.service';
import { SCOUTING_COMMANDS } from './scouting.types';
@Injectable()
export class ScoutingSync implements OnModuleInit {
 constructor(private readonly registry:SyncRegistry,private readonly service:ScoutingService){}
 onModuleInit(){const s=this.service;
 this.registry.registerProjectionPolicy('Observation',async(a,id)=>{try{await s.read(a,id);return true;}catch{return false;}});
 this.registry.registerProjectionPolicy('ScoutingCapture',async(a,id)=>{try{return(await s.contexts(a)).some(r=>r.fieldSeasonId===id);}catch{return false;}});
 this.registry.registerFilePolicy('ScoutingCapture',async(req)=>{try{return(await s.contexts({tenantId:req.tenantId,userId:req.actorId,deviceId:'',sessionId:''})).some(r=>`ScoutingCapture:${r.fieldSeasonId}`===req.ownerRef);}catch{return false;}});
 this.registry.registerFilePolicy('Observation',async(req)=>{try{const a={tenantId:req.tenantId,userId:req.actorId,deviceId:'',sessionId:''},r=await s.read(a,req.ownerRef.slice(12));return req.action==='file.read'||await s.registry.can(a,'scouting.correct',String(r.organizationId));}catch{return false;}});
 for(const action of SCOUTING_COMMANDS)this.registry.register({commandType:`Scouting.${action}`,version:1,requiresVersion:true,authorize:(tx,a,c)=>s.authorize(tx,a,c),assertVersion:(tx,a,c)=>s.assertVersion(tx,a,c),currentState:(tx,a,c)=>s.current(tx,a,c),execute:(tx,a,c)=>s.apply(tx,a,c),offlinePolicy:async(a)=>{if(action!=='Capture')return undefined;try{const contexts=await s.contexts(a),ttl=s.registry.ttl;return ttl&&contexts.length?{owners:contexts.map(r=>`ScoutingCapture:${r.fieldSeasonId}`),risk:'O1',ttlSeconds:ttl}:undefined;}catch{return undefined;}}});
 }
}
