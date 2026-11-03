export const FARM_ACTIONS = new Set(['field.read','field.create','field.correct','field.split','field.merge','season.create','season.correct','field-season.create','field-season.correct']);
export interface FarmActor {tenantId:string;subjectId:string;}
export interface FarmContext {idempotencyKey:string;correlationId:string;causationId:string;}
export type FarmPolicy=(actor:Readonly<FarmActor>,action:string)=>Promise<boolean>;
export type Kind='FIELD'|'SEASON'|'FIELD_SEASON';
export interface Allocation {landPlotId:string;validFrom:string;validTo?:string;source:string;reason:string;areaHa?:string;geometryVersionId?:string;}
export interface FieldData {name:string;nominalAreaHa:string;status:'ACTIVE'|'FALLOW'|'OUT_OF_USE';siteId?:string;geometryVersionId?:string;allocations:Allocation[];}
export interface SeasonData {name:string;year:number;startDate:string;endDate:string;status:'PLANNED'|'ACTIVE'|'CLOSED';}
export interface FieldSeasonData {plannedAreaHa:string;status:'PLANNED'|'ACTIVE'|'HARVESTING'|'CLOSED';notes?:string;}
export interface FieldCreate {organizationId:string;code:string;data:FieldData;effectiveAt:string;reason:string;}
export interface SeasonCreate {organizationId:string;data:SeasonData;effectiveAt:string;reason:string;}
export interface FieldSeasonCreate {fieldId:string;seasonId:string;data:FieldSeasonData;effectiveAt:string;reason:string;}
export interface Correction<T> {expectedVersion:string;data:T;effectiveAt:string;reason:string;}
export interface EntityResult {entityId:string;revisionId:string;version:string;}
export interface LineageInput {sources:{fieldId:string;expectedVersion:string}[];targets:FieldCreate[];effectiveAt:string;reason:string;}
