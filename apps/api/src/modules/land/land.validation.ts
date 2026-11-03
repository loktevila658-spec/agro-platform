import type { LandSnapshot, LandSource } from './land.types';
// Shared lexical primitives only; spatial formats/geometry validation remain GIS-owned.
import { keys, text, timestamp } from '../gis/gis.validation';
export function validateSource(value: LandSource): void {
 keys(value, ['source','profile','profileVersion','capturedAt','sourceHash']);
 if (!text(value.source,256) || !text(value.profile,128) || !text(value.profileVersion,64) || !timestamp(value.capturedAt) || typeof value.sourceHash!=='string' || !/^[a-f0-9]{64}$/.test(value.sourceHash)) throw Error('LAND_INVALID_SOURCE');
}
function json(value: unknown, depth=0): void {
 if(depth>12)throw Error('LAND_ATTRIBUTES_LIMIT');
 if(value===null||typeof value==='boolean'||typeof value==='string')return;
 if(typeof value==='number'&&Number.isFinite(value))return;
 if(Array.isArray(value)){for(const v of value)json(v,depth+1);return;}
 if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype){for(const v of Object.values(value))json(v,depth+1);return;}
 throw Error('LAND_INVALID_ATTRIBUTES');
}
function date(value: unknown): value is string {return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&timestamp(value+'T00:00:00Z');}
export function validateSnapshot(input: LandSnapshot): LandSnapshot {
 keys(input,['source','cadastralNumber','declaredAreaHa','geometryVersionId','attributes','rights']);validateSource(input.source);
 if(input.cadastralNumber!==undefined&&(!text(input.cadastralNumber,32)||/\s/.test(input.cadastralNumber)))throw Error('LAND_INVALID_CADASTRAL_REFERENCE');
 // DOC10 numeric(14,4), decimal text avoids binary-float reinterpretation.
 if(input.declaredAreaHa!==undefined&&(typeof input.declaredAreaHa!=='string'||! /^(0|[1-9][0-9]{0,9})(\.[0-9]{1,4})?$/.test(input.declaredAreaHa)))throw Error('LAND_INVALID_DECLARED_AREA');
 if(input.geometryVersionId!==undefined&&(typeof input.geometryVersionId!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.geometryVersionId)))throw Error('LAND_INVALID_GEOMETRY_REFERENCE');
 keys(input.attributes,Object.keys(input.attributes??{}));json(input.attributes);
 if(Buffer.byteLength(JSON.stringify(input.attributes))>65536)throw Error('LAND_ATTRIBUTES_LIMIT');
 if(!Array.isArray(input.rights)||input.rights.length>100)throw Error('LAND_RIGHTS_LIMIT');
 for(const right of input.rights){
  keys(right,['rightType','validFrom','validTo','source']);
  if(!['OWNERSHIP','LEASE'].includes(right.rightType)||(right.validFrom!==undefined&&!date(right.validFrom))||(right.validTo!==undefined&&!date(right.validTo))||(right.validFrom&&right.validTo&&right.validFrom>right.validTo))throw Error('LAND_INVALID_RIGHT_METADATA');
  validateSource(right.source);
 }
 return input;
}
