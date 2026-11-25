import { BadRequestException } from '@nestjs/common';
export { uuidv7 } from '../master-data/master-data.validation';
import type { ObservationData } from './scouting.types';
export const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const V7=/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function fail():never{throw new BadRequestException('SCOUTING_INVALID_INPUT');}
export function id(x:unknown):asserts x is string{if(typeof x!=='string'||!UUID.test(x))fail();}
export function text(x:unknown,max=4000):asserts x is string{if(typeof x!=='string'||!x.trim()||x.length>max)fail();}
export const timestamp=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-.*Z$/.test(x)&&Number.isFinite(Date.parse(x));
export function keys(x:unknown,allowed:string[]):asserts x is Record<string,unknown>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!allowed.includes(k)))fail();}
export function validateObservation(x:unknown):ObservationData{
 keys(x,['organizationId','fieldSeasonId','observationType','note','anomaly','sourceType','severity','location','form']);
 id(x.organizationId);id(x.fieldSeasonId);if(x.note!==undefined)text(x.note);
 if(!['GENERAL','SOIL','EMERGENCE','WEED','PEST','DISEASE'].includes(String(x.observationType))||typeof x.anomaly!=='boolean'||!['USER_MOBILE','USER_WEB','API'].includes(String(x.sourceType)))fail();
 if(x.severity!==undefined&&!['LOW','MEDIUM','HIGH'].includes(String(x.severity)))fail();
 if(x.location!==undefined){keys(x.location,['latitude','longitude','accuracyMetres','observedAt','provider']);const l=x.location;
 if(typeof l.latitude!=='number'||!Number.isFinite(l.latitude)||Math.abs(l.latitude)>90||typeof l.longitude!=='number'||!Number.isFinite(l.longitude)||Math.abs(l.longitude)>180||typeof l.accuracyMetres!=='number'||!Number.isFinite(l.accuracyMetres)||l.accuracyMetres<0||!timestamp(l.observedAt))fail();text(l.provider,64);}
 if(x.form!==undefined){keys(x.form,['id','version','answers']);id(x.form.id);text(x.form.version,64);const answers=x.form.answers;
 if(!answers||typeof answers!=='object'||Array.isArray(answers)||Object.keys(answers).length>100)fail();
 for(const [k,v]of Object.entries(answers)){text(k,64);if(!['string','number','boolean'].includes(typeof v)||(typeof v==='number'&&!Number.isFinite(v))||(typeof v==='string'&&v.length>2000))fail();}}
 return structuredClone(x) as unknown as ObservationData;
}
