import { Injectable } from '@nestjs/common';
import { FIELDS, UUID, keys, text } from './master-data.validation';
import { MASTER_ACTIONS, type FieldSource, type MasterActor, type MasterKind, type MasterPolicy, type MasterSourcePolicy } from './master-data.types';
@Injectable()
export class MasterDataRegistry {
  private policy: MasterPolicy = async()=>false;
  private installed=false;
  private readonly sources=new Map<string,Readonly<MasterSourcePolicy>>();
  installPolicy(policy: MasterPolicy): void { if(this.installed||typeof policy!=='function')throw Error('MASTER_POLICY_IMMUTABLE');this.policy=policy;this.installed=true; }
  async authorize(actor: MasterActor, action: string): Promise<void> {
    let allowed=false;
    try {allowed=UUID.test(actor?.tenantId)&&UUID.test(actor?.subjectId)&&MASTER_ACTIONS.has(action)&&await this.policy(Object.freeze({...actor}),action);}catch{allowed=false;}
    if(!allowed)throw Error('MASTER_DATA_FORBIDDEN');
  }
  registerSourcePolicy(input: MasterSourcePolicy): void {
    try {
      keys(input,['tenantId','version','dataOwnerId','stewardId','fields']);
      if(![input.tenantId,input.dataOwnerId,input.stewardId].every(v=>typeof v==='string'&&UUID.test(v))||!Number.isSafeInteger(input.version)||input.version<1)throw Error();
      keys(input.fields,Object.entries(FIELDS).flatMap(([k,fields])=>fields.map(f=>`${k}.${f}`)));
      for(const [name,f] of Object.entries(input.fields)) {
        keys(f,['master','source','profileId','profileVersion']);
        if(!['PLATFORM','EXTERNAL_SYSTEM'].includes(f.master))throw Error();
        if(['Material.accountingCode','Material.gtin'].includes(name)&&f.master!=='EXTERNAL_SYSTEM')throw Error();
        if(f.master==='EXTERNAL_SYSTEM'&&(!text(f.source)||!text(f.profileId)||!Number.isSafeInteger(f.profileVersion)||f.profileVersion!<1))throw Error();
        if(f.master==='PLATFORM'&&(f.source!==undefined||f.profileId!==undefined||f.profileVersion!==undefined))throw Error();
      }
    } catch {throw Error('MASTER_SOURCE_POLICY_INVALID');}
    if(this.sources.has(input.tenantId))throw Error('MASTER_SOURCE_POLICY_IMMUTABLE');
    const copy=structuredClone(input);for(const f of Object.values(copy.fields))Object.freeze(f);Object.freeze(copy.fields);this.sources.set(input.tenantId,Object.freeze(copy));
  }
  sourcePolicy(tenantId: string): Readonly<MasterSourcePolicy> { const p=this.sources.get(tenantId);if(!p)throw Error('MASTER_SOURCE_POLICY_REQUIRED');return p; }
  field(tenantId: string, type: MasterKind, field: string): Readonly<FieldSource> {
    if(!FIELDS[type]?.includes(field))throw Error('MASTER_SOURCE_POLICY_FIELD_INVALID');
    return this.sourcePolicy(tenantId).fields[`${type}.${field}`]??Object.freeze({master:['accountingCode','gtin'].includes(field)?'EXTERNAL_SYSTEM':'PLATFORM'});
  }
}
