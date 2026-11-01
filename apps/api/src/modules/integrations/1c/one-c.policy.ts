import { ConnectorError } from '../../../../../../packages/connectors/src/index.cjs';
import type { OneCBinding, Snapshot } from './one-c.types';
export function identifier(value:unknown):value is string { return typeof value==='string'&&value.length>0&&value.length<=500; }
export function validateBinding(b:OneCBinding):void {
 if(!b||!identifier(b.profileId)||!Number.isSafeInteger(b.profileVersion)||b.profileVersion<1||
 !['INBOUND','OUTBOUND'].includes(b.direction)||!identifier(b.operation)||!identifier(b.entityType)||
 !b.fields||Array.isArray(b.fields)||!Object.keys(b.fields).length)throw new ConnectorError('ONE_C_BINDING_INVALID');
 for(const [name,f] of Object.entries(b.fields)) {
  if(!identifier(name)||['__proto__','constructor','prototype'].includes(name)||!f||
  !['ACCOUNTING','REFERENCE','OPERATIONAL'].includes(f.aspect)||!['ONE_C','PLATFORM'].includes(f.authority)||
  !['string','number','boolean'].includes(f.type)||typeof f.required!=='boolean'||
  f.direction!==(b.direction==='INBOUND'?'IN':'OUT')||
  (f.aspect==='OPERATIONAL'&&f.authority!=='PLATFORM')||
  (f.aspect==='ACCOUNTING'&&f.authority!=='ONE_C')||
  (b.direction==='INBOUND'&&f.authority!=='ONE_C'))throw new ConnectorError('ONE_C_SOT_VIOLATION');
 }
}
export function validateAttributes(mapped:Record<string,unknown>,b:OneCBinding):void {
 validateBinding(b);
 for(const name of Object.keys(mapped))if(!Object.hasOwn(b.fields,name))throw new ConnectorError('ONE_C_ATTRIBUTE_UNKNOWN');
 for(const [name,f] of Object.entries(b.fields)) {
  if(!Object.hasOwn(mapped,name)) {if(f.required)throw new ConnectorError('ONE_C_ATTRIBUTE_MISSING');continue;}
  const value=mapped[name];
  if(typeof value!==f.type||(typeof value==='number'&&!Number.isFinite(value))||
  (typeof value==='string'&&value.length>10000))throw new ConnectorError('VALIDATION');
 }
}
export function validateSnapshot(s:Snapshot|null):void {
 if(s===null)return;
 if(!s||Object.keys(s).sort().join(',')!=='externalId,modifiedVersion,total'||!identifier(s.externalId)||!identifier(s.modifiedVersion)||
 typeof s.total!=='string'||s.total.length>100||!/^\d+(\.\d+)?$/.test(s.total))throw new ConnectorError('ONE_C_SNAPSHOT_INVALID');
}
/** Totals are compared as supplied normalized decimal strings: no guessed units/rounding. */
export function compareSnapshots(local:Snapshot|null,external:Snapshot|null):string[] {
 validateSnapshot(local);validateSnapshot(external);
 if(!local&&!external)throw new ConnectorError('ONE_C_SNAPSHOT_INVALID');
 if(!local)return ['MISSING_LOCAL'];if(!external)return ['MISSING_EXTERNAL'];
 const differences:string[]=[];
 if(local.externalId!==external.externalId)differences.push('GUID_MISMATCH');
 if(local.total!==external.total)differences.push('TOTAL_MISMATCH');
 if(local.modifiedVersion!==external.modifiedVersion)differences.push('VERSION_MISMATCH');
 return differences;
}
