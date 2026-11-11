import type {SyncActor,SyncCommand} from '../sync/sync.types';
export const OFFLINE_GIS_ACTIONS=new Set(['offline-gis.package.read','offline-gis.package.select','offline-gis.package.refresh']);
export interface Target {id:string;kind:'FIELD'|'FIELD_SEASON';}
export interface Selection {targets:Target[];bounds:number[];minZoom:number;maxZoom:number;sourceId?:string;}
export interface MapSource {id:string;label:string;styleUrl:string;styleVersion:string;sourceVersion:string;attribution:string;termsRef:string;offlineAllowed:boolean;publicBasemap:boolean;minZoom:number;maxZoom:number;}
export interface Scope {organizationIds:string[];siteIds?:string[];fieldIds?:string[];renderProfile:{version:string;toleranceDegrees:number};offlineTtlSeconds?:number;}
export interface OfflineGisPolicy {scope(actor:Readonly<SyncActor>,action:string):Promise<Scope|undefined>;sources(actor:Readonly<SyncActor>):Promise<MapSource[]>;}
export interface PackageRow {tenant_id:string;id:string;user_id:string;device_id:string;session_id:string;version:string;selection:Selection;manifest:Record<string,unknown>;content_hash:string;}
export interface SubmitRequest {scopeVersion:number;command:SyncCommand;}
