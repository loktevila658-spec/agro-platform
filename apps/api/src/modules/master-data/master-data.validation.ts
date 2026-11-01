import { randomBytes } from 'node:crypto';
import type { MasterKind, MaterialInput, UnitInput } from './master-data.types';
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const DIMENSIONS = ['MASS','VOLUME','AREA','COUNT'];
export const ITEM_TYPES = ['SEED','FERTILIZER','PPP','FUEL','SPARE','RAW','PACKAGING','FINISHED'];
export const FIELDS: Readonly<Record<MasterKind, readonly string[]>> = Object.freeze({
  Material: Object.freeze(['code','name','itemType','baseUom','active','accountingCode','gtin']),
  UnitOfMeasure: Object.freeze(['code','name','dimension','precision']),
});
export function text(value: unknown, max=500): value is string { return typeof value==='string' && value.length>0 && value.length<=max && value.trim()===value && !/[\u0000-\u001f]/.test(value); }
export function object(value: unknown): asserts value is Record<string,unknown> {
  if(!value || typeof value!=='object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value)) || Buffer.byteLength(JSON.stringify(value))>65536) throw Error('MASTER_DATA_INVALID_OBJECT');
}
export function keys(value: unknown, allowed: readonly string[]): asserts value is Record<string,unknown> { object(value); if(Object.keys(value).some(k=>!allowed.includes(k))) throw Error('MASTER_DATA_INVALID_FIELD'); }
export function kind(value: unknown): asserts value is MasterKind { if(value!=='Material'&&value!=='UnitOfMeasure')throw Error('MASTER_DATA_INVALID_KIND'); }
export function version(value: unknown): asserts value is string { if(typeof value!=='string'||!/^[1-9][0-9]{0,17}$/.test(value))throw Error('MASTER_DATA_INVALID_VERSION'); }
export function validateFields(type: MasterKind, input: Record<string,unknown>, external=false): void {
  keys(input,FIELDS[type]);
  for(const [field,value] of Object.entries(input)) {
    const max=field==='code'?(type==='Material'?64:16):field==='name'?(type==='Material'?255:128):field==='baseUom'?16:field==='gtin'?32:128;
    if(field==='precision') {if(!Number.isInteger(value)||Number(value)<0||Number(value)>6)throw Error('MASTER_DATA_INVALID_PRECISION');}
    else if(field==='dimension') {if(typeof value!=='string'||!DIMENSIONS.includes(value))throw Error('MASTER_DATA_INVALID_DIMENSION');}
    else if(field==='itemType') {if(typeof value!=='string'||!ITEM_TYPES.includes(value))throw Error('MASTER_DATA_INVALID_ITEM_TYPE');}
    else if(field==='active') {if(typeof value!=='boolean')throw Error('MASTER_DATA_INVALID_ACTIVE');}
    else if((field==='accountingCode'||field==='gtin')&&!external)throw Error('MASTER_DATA_INVALID_EXTERNAL_LOCAL_FIELD');
    else if(!text(value,max)) throw Error('MASTER_DATA_INVALID_'+field);
  }
}
export function validateUnit(input: UnitInput): UnitInput {
  keys(input,FIELDS.UnitOfMeasure); validateFields('UnitOfMeasure',input as unknown as Record<string,unknown>);
  for(const k of FIELDS.UnitOfMeasure)if(!Object.hasOwn(input,k))throw Error('MASTER_DATA_INVALID_UNIT');
  return {...input};
}
export function validateMaterial(input: MaterialInput): Required<MaterialInput> {
  keys(input,['code','name','itemType','baseUom','organizationId','active']);
  const {organizationId=null,...fields}=input;
  if(organizationId!==null&&!UUID.test(organizationId))throw Error('MASTER_DATA_INVALID_ORGANIZATION');
  validateFields('Material',fields);
  for(const k of ['code','name','itemType','baseUom'])if(!Object.hasOwn(fields,k))throw Error('MASTER_DATA_INVALID_MATERIAL');
  return {...input,organizationId,active:input.active??true};
}
export function timestamp(value: unknown): value is string {
  if(typeof value!=='string')return false;
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if(!m||!Number.isFinite(Date.parse(value)))return false;
  const [y,month,day,hour,minute,second]=m.slice(1,7).map(Number) as [number,number,number,number,number,number];
  const days=[31,(y%4===0&&(y%100!==0||y%400===0))?29:28,31,30,31,30,31,31,30,31,30,31];
  return month>=1&&month<=12&&day>=1&&day<=days[month-1]!&&hour<24&&minute<60&&second<60;
}
export function uuidv7(): string {
  const bytes=randomBytes(16);bytes.writeUIntBE(Date.now(),0,6);bytes[6]=(bytes[6]!&15)|0x70;bytes[8]=(bytes[8]!&63)|0x80;
  const h=bytes.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
