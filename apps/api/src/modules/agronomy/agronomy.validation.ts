import { BadRequestException, ConflictException } from '@nestjs/common';
import { UUID, text, timestamp } from '../master-data/master-data.validation';
import type { AgronomyData, AgronomyKind, AgronomyState, PlannedOperation, PlannedResource } from './agronomy.types';
export { UUID, timestamp };
export function fail(code:string):never {throw new BadRequestException(`AGRONOMY_${code}`);}
export function object(v:unknown,allowed?:readonly string[]):asserts v is Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v))||Buffer.byteLength(JSON.stringify(v))>262144)fail('OBJECT');
 if(allowed&&Object.keys(v).some(k=>!allowed.includes(k)))fail('FIELD');
}
export function id(v:unknown):asserts v is string{if(typeof v!=='string'||!UUID.test(v))fail('ID');}
export function version(v:unknown):asserts v is string{if(typeof v!=='string'||!/^[1-9][0-9]{0,14}$/.test(v))fail('VERSION');}
export function string(v:unknown,max=1000):asserts v is string{if(!text(v,max))fail('TEXT');}
export function kind(v:unknown):asserts v is AgronomyKind{if(!['SEASON_PLAN','TEMPLATE','TECH_MAP'].includes(v as string))fail('KIND');}
export function ref(v:unknown):void{object(v,['entityId','revisionId']);id(v.entityId);id(v.revisionId);}
export function decimal(v:unknown):asserts v is string{if(typeof v!=='string'||! /^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/.test(v))fail('DECIMAL');}
function scaled(v:string):bigint{decimal(v);const [a,b='']=v.split('.');return BigInt(a!)*1000000n+BigInt(b.padEnd(6,'0'));}
/** DOC34 §8 exact formula, explicit inputs, six decimal result or explicit refusal. */
export function demand(type:string,norm:string,area:string,reserve?:string):string{
 if(!['MATERIAL','MACHINE','LABOR'].includes(type))fail('FORMULA');
 if(type==='MATERIAL'&&reserve===undefined)fail('FORMULA_INPUT');
 const numerator=scaled(norm)*scaled(area)*(type==='MATERIAL'?1000000n+scaled(reserve!):1000000n),divisor=1000000000000n;
 if(numerator%divisor!==0n)fail('RESULT_PRECISION');
 const result=numerator/divisor;if(result>999999999999999999n)fail('RESULT_RANGE');
 const a=result/1000000n,b=(result%1000000n).toString().padStart(6,'0').replace(/0+$/,'');return a.toString()+(b?'.'+b:'');
}
function resource(v:unknown):void{
 object(v,['kind','referenceId','unit','quantity','normPerArea','effectiveArea','reserveFactor','formulaVersion']);
 if(!['MATERIAL','MACHINE','LABOR'].includes(v.kind as string))fail('RESOURCE_KIND');id(v.referenceId);string(v.unit,16);
 if(v.quantity!==undefined){decimal(v.quantity);if(['normPerArea','effectiveArea','reserveFactor','formulaVersion'].some(k=>v[k]!==undefined))fail('RESOURCE_CONFLICT');}
 else{decimal(v.normPerArea);decimal(v.effectiveArea);if(v.kind!=='MATERIAL'&&v.reserveFactor!==undefined)fail('FORMULA_INPUT');
  if(v.formulaVersion!==`DOC34-8-${v.kind}-1`)fail('FORMULA');demand(v.kind as string,v.normPerArea,v.effectiveArea,v.reserveFactor as string|undefined);}
}
export function operation(v:unknown):void{
 object(v,['id','operationTypeId','sequence','quantity','unit','unscheduled','window','resources']);id(v.id);id(v.operationTypeId);decimal(v.quantity);string(v.unit,16);
 if(!Number.isSafeInteger(v.sequence)||Number(v.sequence)<1||Number(v.sequence)>1000||typeof v.unscheduled!=='boolean')fail('OPERATION');
 if(v.unscheduled){if(v.window!==undefined)fail('WINDOW');}else{object(v.window,['start','end']);if(!timestamp(v.window.start)||!timestamp(v.window.end)||Date.parse(v.window.start)>Date.parse(v.window.end))fail('WINDOW');}
 if(!Array.isArray(v.resources)||v.resources.length>100)fail('RESOURCE_LIMIT');v.resources.forEach(resource);
}
export function validateData(type:AgronomyKind,v:unknown):AgronomyData{
 const fields=type==='SEASON_PLAN'?['name','seasonId','siteId','scenario','assumptions','sourceReferences','techMaps']:type==='TEMPLATE'?['name','cropId','parent','operations']:['name','fieldSeasonId','template','cropId','operations'];
 object(v,fields);string(v.name,255);
 if(type==='SEASON_PLAN'){
  id(v.seasonId);if(v.siteId!==undefined)id(v.siteId);if(!['BASE','OPTIMISTIC','CONSERVATIVE'].includes(v.scenario as string))fail('SCENARIO');
  if(!Array.isArray(v.assumptions)||v.assumptions.length>100)fail('ASSUMPTIONS');v.assumptions.forEach(x=>string(x));
  if(!Array.isArray(v.sourceReferences)||v.sourceReferences.length>100)fail('SOURCE');for(const r of v.sourceReferences){object(r,['source','version']);string(r.source);string(r.version);}
  if(!Array.isArray(v.techMaps)||v.techMaps.length>1000)fail('MAP_LIMIT');v.techMaps.forEach(ref);if(new Set(v.techMaps.map(r=>r.entityId)).size!==v.techMaps.length)fail('DUPLICATE_MAP');
 }else{
  if(v.cropId!==undefined)id(v.cropId);if(v.parent!==undefined)ref(v.parent);
  if(type==='TECH_MAP'){id(v.fieldSeasonId);ref(v.template);}
  if(!Array.isArray(v.operations)||v.operations.length>1000)fail('OPERATION_LIMIT');v.operations.forEach(operation);uniqueOperations(v.operations as unknown as PlannedOperation[]);
 }
 return structuredClone(v) as unknown as AgronomyData;
}
export function uniqueOperations(ops:PlannedOperation[]):void{if(new Set(ops.map(o=>o.id)).size!==ops.length||new Set(ops.map(o=>o.sequence)).size!==ops.length)fail('DUPLICATE_OPERATION');}
export function transition(state:AgronomyState,action:string):AgronomyState{
 if(state==='DRAFT'&&action==='Approve')return 'APPROVED';if(state==='APPROVED'&&action==='Publish')return 'PUBLISHED';throw new ConflictException('AGRONOMY_STATE_CONFLICT');
}
export function resourceQuantity(r:PlannedResource):string{return r.quantity??demand(r.kind,r.normPerArea!,r.effectiveArea!,r.reserveFactor);}
