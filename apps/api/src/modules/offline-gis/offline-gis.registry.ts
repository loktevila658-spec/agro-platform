import {ForbiddenException,Injectable} from '@nestjs/common';
import {UUID,text} from '../gis/gis.validation';
import type {SyncActor} from '../sync/sync.types';
import {OFFLINE_GIS_ACTIONS,type OfflineGisPolicy,type Scope,type MapSource} from './offline-gis.types';
import {source} from './offline-gis.validation';
@Injectable()
export class OfflineGisRegistry {
 private policy?:OfflineGisPolicy;
 install(policy:OfflineGisPolicy):void{if(this.policy)throw Error('OFFLINE_GIS_POLICY_IMMUTABLE');if(typeof policy?.scope!=='function'||typeof policy?.sources!=='function')throw Error('OFFLINE_GIS_INVALID_POLICY');this.policy=policy;}
 async scope(actor:SyncActor,action='offline-gis.package.read'):Promise<Scope>{try{if(!OFFLINE_GIS_ACTIONS.has(action)||![actor.tenantId,actor.userId,actor.deviceId,actor.sessionId].every(v=>typeof v==='string'&&UUID.test(v)))throw Error();const s=structuredClone(await this.policy?.scope(Object.freeze({...actor}),action));if(!s||!Array.isArray(s.organizationIds)||!s.organizationIds.length||[s.organizationIds,s.siteIds,s.fieldIds].some(ids=>ids!==undefined&&(!Array.isArray(ids)||ids.some(v=>typeof v!=='string'||!UUID.test(v)))))throw Error();if(!text(s.renderProfile?.version,128)||!Number.isFinite(s.renderProfile.toleranceDegrees)||s.renderProfile.toleranceDegrees<0||s.renderProfile.toleranceDegrees>=180)throw Error();return s;}catch{throw new ForbiddenException('OFFLINE_GIS_FORBIDDEN');}}
 async sources(actor:SyncActor):Promise<MapSource[]>{await this.scope(actor);const values=structuredClone(await this.policy!.sources(Object.freeze({...actor})));const seen=new Set();for(const v of values){source(v);if(seen.has(v.id))throw Error('OFFLINE_GIS_DUPLICATE_SOURCE');seen.add(v.id);}return values;}
}
