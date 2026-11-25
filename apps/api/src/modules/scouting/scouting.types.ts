import type { PoolClient } from 'pg';
import type { SyncActor } from '../sync/sync.types';
export const SCOUTING_ACTIONS=new Set(['scouting.read','scouting.capture','scouting.correct','scouting.create-work']);
export const SCOUTING_COMMANDS=['Capture','Correct','CreateWork'] as const;
export type ScoutingAction=typeof SCOUTING_COMMANDS[number];
export interface ObservationData {
 organizationId:string;fieldSeasonId:string;observationType:'GENERAL'|'SOIL'|'EMERGENCE'|'WEED'|'PEST'|'DISEASE';note?:string;anomaly:boolean;sourceType:'USER_MOBILE'|'USER_WEB'|'API';
 severity?:'LOW'|'MEDIUM'|'HIGH';
 location?:{latitude:number;longitude:number;accuracyMetres:number;observedAt:string;provider:string;};
 form?:{id:string;version:string;answers:Record<string,string|number|boolean>;};
}
export interface ScoutingPolicy {
 authorize(a:Readonly<SyncActor>,action:string,organizationId:string):Promise<boolean>;
 captureScopes(a:Readonly<SyncActor>):Promise<{organizationId:string;fieldSeasonId:string}[]>;
 observer(tx:PoolClient,a:Readonly<SyncActor>,organizationId:string):Promise<{employeeId:string;revisionId:string}|undefined>;
 form(a:Readonly<SyncActor>,form:Readonly<NonNullable<ObservationData['form']>>):Promise<boolean>;
 offlineTtlSeconds?:number;
}
export interface ObservationRow {tenant_id:string;id:string;organization_id:string;field_season_id:string;version:string;current_revision_id:string;task_id:string|null;data:ObservationData;source_refs:Record<string,unknown>;author_id:string;actor_id:string;observed_at:Date|string;recorded_at:Date|string;provenance:Record<string,unknown>;}
