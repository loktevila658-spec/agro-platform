import type { PoolClient } from 'pg';
export const GIS_ACTIONS = new Set(['gis.read','gis.propose','gis.approve','gis.reject','gis.import']);
export interface GisActor { readonly tenantId:string; readonly subjectId:string; }
export interface GisContext { readonly idempotencyKey:string; readonly correlationId:string; readonly causationId:string; }
export type GisPolicy = (actor:Readonly<GisActor>,action:string)=>Promise<boolean>;
export interface Geometry { type:'Polygon'|'MultiPolygon'; coordinates:number[][][]|number[][][][]; }
export interface GisSource { type:'MANUAL'|'IMPORT'|'CADASTRE_REFERENCE'|'GPS_SURVEY'|'DEVICE_TRACK'|'EXTERNAL_API'|'DERIVED'; sourceCrs:string; capturedAt?:string; accuracy?:number; method?:string; qualityFlags?:string[]; sourceRef?:string; importBatchId?:string; sourceFeatureId?:string; }
export interface Proposal { geometryId?:string; expectedVersion:string; geometry:Geometry; source:GisSource; reason:string; }
export interface GisResult { geometryId:string; versionId:string; headVersion:string; }
export type ImportFormat='GeoJSON'|'KML'|'KMZ'|'GPKG'|'SHP'|'WKT'|'WKB'|'CSV';
export interface ImportOptions { format:ImportFormat; sourceCrs?:string; layer?:string; encoding?:string; mapping?:Record<string,string>; csv?:{x:string;y:string;mode:'POINTS'|'VERTICES'}; }
export interface ParsedFeature { sourceFeatureId:string; layer:string; sourceCrs:string; geometry:unknown; properties:Record<string,unknown>; issues:string[]; }
export interface ParsedImport { features:ParsedFeature[]; layers:string[]; parserVersion:string; }
/** Transaction-bound application command; no Field/LandPlot table is owned here. */
export interface GisOwnerPort { proposeInTransaction(tx:PoolClient,actor:GisActor,input:Proposal,ctx:GisContext):Promise<GisResult>; }
