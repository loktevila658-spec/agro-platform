import { randomBytes } from 'node:crypto';
import type { Geometry, GisContext, GisSource } from './gis.types';
export const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function id(v:unknown):asserts v is string { if(typeof v!=='string'||!UUID.test(v))throw Error('GIS_INVALID_ID'); }
export function text(v:unknown,max=1000):v is string{return typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v&&!/[\u0000-\u001f]/.test(v);}
export function record(v:unknown):asserts v is Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw Error('GIS_INVALID_OBJECT');}
export function keys(v:unknown,allowed:string[]):asserts v is Record<string,unknown>{record(v);if(Object.keys(v).some(k=>!allowed.includes(k)))throw Error('GIS_INVALID_FIELD');}
export function version(v:unknown):asserts v is string{if(typeof v!=='string'||!/^(0|[1-9][0-9]{0,15})$/.test(v))throw Error('GIS_INVALID_VERSION');}
export function timestamp(v:unknown):v is string{
 if(typeof v!=='string')return false;
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(v);
 if(!m||!Number.isFinite(Date.parse(v)))return false;
 const [y,month,day,h,min,s]=m.slice(1,7).map(Number) as [number,number,number,number,number,number];
 const days=[31,(y%4===0&&(y%100!==0||y%400===0))?29:28,31,30,31,30,31,31,30,31,30,31];
 return month>=1&&month<=12&&day>=1&&day<=days[month-1]!&&h<24&&min<60&&s<60;
}
export function context(v:GisContext):void{try{keys(v,['idempotencyKey','correlationId','causationId']);if(!text(v.idempotencyKey,200)||!text(v.correlationId,128)||!text(v.causationId,128))throw Error();}catch{throw Error('GIS_INVALID_CONTEXT');}}
export function source(v:GisSource):void{
 try{
  keys(v,['type','sourceCrs','capturedAt','accuracy','method','qualityFlags','sourceRef','importBatchId','sourceFeatureId']);
  if(!['MANUAL','IMPORT','CADASTRE_REFERENCE','GPS_SURVEY','DEVICE_TRACK','EXTERNAL_API','DERIVED'].includes(v.type)||!text(v.sourceCrs,256))throw Error();
  if(v.capturedAt!==undefined&&!timestamp(v.capturedAt))throw Error();
  if(v.accuracy!==undefined&&(typeof v.accuracy!=='number'||!Number.isFinite(v.accuracy)||v.accuracy<0))throw Error();
  for(const k of ['method','sourceRef','sourceFeatureId'] as const)if(v[k]!==undefined&&!text(v[k]))throw Error();
  if(v.qualityFlags!==undefined&&(!Array.isArray(v.qualityFlags)||v.qualityFlags.length>50||v.qualityFlags.some(s=>!text(s,128))))throw Error();
  if(v.type==='IMPORT'){id(v.importBatchId);if(!text(v.sourceFeatureId))throw Error();}
  else if(v.importBatchId!==undefined||v.sourceFeatureId!==undefined)throw Error();
 }catch{throw Error('GIS_INVALID_SOURCE');}
}
export function geometry(v:unknown,maxVertices=5000):Geometry{
 keys(v,['type','coordinates']);if(v.type!=='Polygon'&&v.type!=='MultiPolygon')throw Error('GIS_GEOMETRY_TYPE');
 const polygons=v.type==='Polygon'?[v.coordinates]:v.coordinates;
 if(!Array.isArray(polygons)||!polygons.length)throw Error('GIS_EMPTY_GEOMETRY');
 let count=0;
 for(const rings of polygons){
  if(!Array.isArray(rings)||!rings.length)throw Error('GIS_INVALID_RINGS');
  for(const ring of rings){
   if(!Array.isArray(ring)||ring.length<4)throw Error('GIS_INVALID_RING');
   for(const p of ring){
    if(!Array.isArray(p)||p.length!==2||p.some((x:unknown)=>typeof x!=='number'||!Number.isFinite(x))||Math.abs(p[0])>180||Math.abs(p[1])>90)throw Error('GIS_INVALID_COORDINATES');
    if(++count>maxVertices)throw Error('GIS_VERTEX_LIMIT');
   }
   if(ring[0][0]!==ring[ring.length-1][0]||ring[0][1]!==ring[ring.length-1][1])throw Error('GIS_UNCLOSED_RING');
  }
 }
 return structuredClone(v) as unknown as Geometry;
}
export function bbox(v:unknown,limit:number):number[]{
 if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('GIS_QUERY_LIMIT');
 if(!Array.isArray(v)||v.length!==4||v.some(x=>typeof x!=='number'||!Number.isFinite(x))||Math.abs(v[0])>180||Math.abs(v[2])>180||Math.abs(v[1])>90||Math.abs(v[3])>90||v[1]>=v[3]||v[0]===v[2])throw Error('GIS_INVALID_BBOX');
 // Deployment query bound, not a canonical geometry precision/business rule.
 const width=v[2]>v[0]?v[2]-v[0]:360-v[0]+v[2];if(width*(v[3]-v[1])>3600)throw Error('GIS_BBOX_AREA_LIMIT');return [...v];
}
export function uuidv7():string{const b=randomBytes(16);b.writeUIntBE(Date.now(),0,6);b[6]=(b[6]!&15)|112;b[8]=(b[8]!&63)|128;const h=b.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
