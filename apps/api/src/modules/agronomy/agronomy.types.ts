import type { PoolClient } from 'pg';
export type AgronomyKind='SEASON_PLAN'|'TEMPLATE'|'TECH_MAP';
export type AgronomyState='DRAFT'|'APPROVED'|'PUBLISHED';
export interface AgronomyActor {tenantId:string;subjectId:string;}
export interface RevisionRef {entityId:string;revisionId:string;}
export interface OwnerReference {id:string;revisionId:string;organizationId?:string;}
export interface PlannedResource {kind:'MATERIAL'|'MACHINE'|'LABOR';referenceId:string;unit:string;quantity?:string;normPerArea?:string;effectiveArea?:string;reserveFactor?:string;formulaVersion?:string;}
export interface PlannedOperation {id:string;operationTypeId:string;sequence:number;quantity:string;unit:string;unscheduled:boolean;window?:{start:string;end:string};resources:PlannedResource[];}
export interface AgronomyData {name:string;seasonId?:string;siteId?:string;scenario?:'BASE'|'OPTIMISTIC'|'CONSERVATIVE';assumptions?:string[];sourceReferences?:{source:string;version:string}[];techMaps?:RevisionRef[];fieldSeasonId?:string;template?:RevisionRef;parent?:RevisionRef;cropId?:string;operations?:PlannedOperation[];}
export interface AgronomyCreate {kind:AgronomyKind;organizationId:string;data:AgronomyData;effectiveAt:string;reason:string;}
export interface AgronomyCommand {expectedVersion:string;data?:AgronomyData;effectiveAt:string;reason:string;}
export interface AgronomyContext {idempotencyKey:string;correlationId:string;causationId:string;}
export interface AgronomyRow {tenant_id:string;id:string;organization_id:string;kind:AgronomyKind;version:string;revision_id:string;state:AgronomyState;data:AgronomyData;source_refs:Record<string,unknown>;author_id:string;approver_id:string|null;effective_at:string;}
export const AGRONOMY_ACTIONS=new Set(['agronomy.season_plan.view','agronomy.season_plan.edit','agronomy.season_plan.publish','agronomy.tech_map.edit','agronomy.tech_map.approve','agronomy.resource_demand.view']);
export interface AgronomyPolicy {
 authorize(actor:Readonly<AgronomyActor>,action:string,organizationId?:string):Promise<boolean>;
 reference(tx:PoolClient,actor:Readonly<AgronomyActor>,kind:'OPERATION'|'MACHINE'|'LABOR'|'CROP',id:string,organizationId:string):Promise<OwnerReference|undefined>;
 formula(actor:Readonly<AgronomyActor>,resource:Readonly<PlannedResource>):Promise<boolean>;
}
