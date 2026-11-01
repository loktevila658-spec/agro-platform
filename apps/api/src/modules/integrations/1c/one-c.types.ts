/** Internal mock contracts only. Not a 1C wire format or exchange protocol. */
export const ONE_C_MOCK = 'ONE_C_MOCK';
export const MOCK_SCHEMA = 'one-c-mock/1';
export interface AttributePolicy {
 aspect:'ACCOUNTING'|'REFERENCE'|'OPERATIONAL';
 authority:'ONE_C'|'PLATFORM'; direction:'IN'|'OUT';
 type:'string'|'number'|'boolean'; required:boolean;
}
export interface OneCBinding {
 profileId:string; profileVersion:number; direction:'INBOUND'|'OUTBOUND';
 operation:string; entityType:string; fields:Record<string,AttributePolicy>;
}
export interface Snapshot { externalId:string; total:string; modifiedVersion:string; }
export interface Observation {
 key:string; local:Snapshot|null; external:Snapshot|null;
 observedAt:string; correlationId:string;
}
export interface MockFaults {
 beforeSubmit?():Promise<void>;
 afterSubmit?():Promise<void>;
 beforeReconcile?():Promise<void>;
}
