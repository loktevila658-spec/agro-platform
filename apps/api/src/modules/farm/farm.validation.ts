import { id, keys, text, timestamp, version } from '../gis/gis.validation';
import type { FieldData, SeasonData, FieldSeasonData } from './farm.types';
export function area(v:unknown):void {if(typeof v!=='string'||!/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,4})?$/.test(v))throw Error('FARM_INVALID_AREA');}
export function effective(v:unknown,reason:unknown):void {if(!timestamp(v)||!text(reason))throw Error('FARM_EFFECTIVE_REASON_REQUIRED');}
function date(v:unknown):v is string{return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&timestamp(v+'T00:00:00Z');}
export function validateField(v:FieldData):FieldData {
 keys(v,['name','nominalAreaHa','status','siteId','geometryVersionId','allocations']);
 if(!text(v.name,255)||!['ACTIVE','FALLOW','OUT_OF_USE'].includes(v.status))throw Error('FARM_INVALID_FIELD');area(v.nominalAreaHa);
 if(v.siteId!==undefined)id(v.siteId);if(v.geometryVersionId!==undefined)id(v.geometryVersionId);
 // Deployment command bound, not a business cardinality/geometry inference rule.
 if(!Array.isArray(v.allocations)||v.allocations.length>1000)throw Error('FARM_ALLOCATION_LIMIT');
 const seen=new Set<string>();
 for(const a of v.allocations){
  keys(a,['landPlotId','validFrom','validTo','source','reason','areaHa','geometryVersionId']);id(a.landPlotId);
  if(!timestamp(a.validFrom)||(a.validTo!==undefined&&(!timestamp(a.validTo)||Date.parse(a.validTo)<Date.parse(a.validFrom)))||!text(a.source)||!text(a.reason))throw Error('FARM_INVALID_ALLOCATION');
  const key=a.landPlotId+'/'+Date.parse(a.validFrom);if(seen.has(key))throw Error('FARM_DUPLICATE_ALLOCATION');seen.add(key);
  if(a.areaHa!==undefined)area(a.areaHa);if(a.geometryVersionId!==undefined)id(a.geometryVersionId);
 }
 return v;
}
export function validateSeason(v:SeasonData):SeasonData {
 keys(v,['name','year','startDate','endDate','status']);
 if(!text(v.name,128)||!Number.isInteger(v.year)||v.year< -32768||v.year>32767||!['PLANNED','ACTIVE','CLOSED'].includes(v.status))throw Error('FARM_INVALID_SEASON');
 if(!date(v.startDate)||!date(v.endDate)||v.endDate<v.startDate)throw Error('FARM_INVALID_DATE_RANGE');return v;
}
export function validateFieldSeason(v:FieldSeasonData):FieldSeasonData {
 keys(v,['plannedAreaHa','status','notes']);area(v.plannedAreaHa);
 if(!['PLANNED','ACTIVE','HARVESTING','CLOSED'].includes(v.status)||(v.notes!==undefined&&!text(v.notes,65536)))throw Error('FARM_INVALID_FIELD_SEASON');return v;
}
export function validateLineage(op:string,sources:{fieldId:string;expectedVersion:string}[],targets:unknown[]):void {
 if(!Array.isArray(sources)||!Array.isArray(targets)||sources.length>1000||targets.length>1000||!(op==='SPLIT'?sources.length===1&&targets.length>=2:op==='MERGE'&&sources.length>=2&&targets.length===1))throw Error('FARM_INVALID_LINEAGE');
 const seen=new Set<string>();for(const s of sources){keys(s,['fieldId','expectedVersion']);id(s.fieldId);version(s.expectedVersion);if(seen.has(s.fieldId))throw Error('FARM_DUPLICATE_SOURCE');seen.add(s.fieldId);}
}
