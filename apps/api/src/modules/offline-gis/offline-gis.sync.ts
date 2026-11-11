import {Injectable,OnModuleInit} from '@nestjs/common';
import {SyncRegistry} from '../sync/sync.registry';
import {OfflineGisService} from './offline-gis.service';
@Injectable()
export class OfflineGisSync implements OnModuleInit {
 constructor(private readonly registry:SyncRegistry,private readonly service:OfflineGisService){}
 onModuleInit():void{const s=this.service;for(const entity of ['OfflineGisPackage','OfflineGisField'])this.registry.registerProjectionPolicy(entity,(actor,id)=>s.canRead(actor,entity,id));for(const action of ['Select','Refresh'])this.registry.register({commandType:`OfflineGis.${action}`,version:1,requiresVersion:true,authorize:(tx,a,c)=>s.authorize(tx,a,c),currentState:(tx,a,c)=>s.current(tx,a,c),assertVersion:(tx,a,c)=>s.assertVersion(tx,a,c),execute:(tx,a,c)=>s.apply(tx,a,c),offlinePolicy:async actor=>{try{const scope=await s.registry.scope(actor,`offline-gis.package.${action.toLowerCase()}`);const ttl=scope.offlineTtlSeconds;if(!Number.isSafeInteger(ttl)||!ttl||ttl<1||ttl>7*86400)return undefined;return {owners:[`OfflineGisPackage:${actor.deviceId}`],risk:'O1',ttlSeconds:ttl};}catch{return undefined;}}});}
}
