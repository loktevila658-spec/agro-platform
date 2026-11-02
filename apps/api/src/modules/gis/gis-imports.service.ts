import { Inject,Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { ObjectStorage } from '../../../../../packages/storage/src/index.cjs';
import type { MalwareScanner } from '../files/files.types';
import { FILES_STORAGE,FILES_SCANNER } from '../files/files.tokens';
import { GisParser,GIS_FILE_LIMIT } from './gis.parser';
import { GisService } from './gis.service';
import type { GisActor,GisContext,GisResult,ImportOptions,Proposal } from './gis.types';
import { id,keys,text,uuidv7 } from './gis.validation';
@Injectable()
export class GisImportsService {
 constructor(private readonly gis:GisService,private readonly parser:GisParser,@Inject(FILES_STORAGE) private readonly storage:ObjectStorage,@Inject(FILES_SCANNER) private readonly scanner:MalwareScanner){}
 /** Dedicated GIS ingress; NOT the media attachment uploader or an unchecked file reference. */
 async stage(actor:GisActor,input:{bytes:Buffer;filename:string;options:ImportOptions},ctx:GisContext):Promise<{batchId:string;count:number;invalid:number}>{
  actor=Object.freeze({...actor});ctx=structuredClone(ctx);
  this.gis.local();
  keys(input,['bytes','filename','options']);
  if(!text(input.filename,255)||/[\\/]/.test(input.filename)||!Buffer.isBuffer(input.bytes)||!input.bytes.length||input.bytes.length>GIS_FILE_LIMIT)throw Error('GIS_INVALID_FILE');
  // Freeze caller-owned buffers/options before awaits; no mutable source can race scan/hash/parse.
  const bytes=Buffer.from(input.bytes),options=structuredClone(input.options),filename=input.filename;
  await this.gis.registry.authorize(actor,'gis.import');
  const hash=createHash('sha256').update(bytes).digest('hex');
  if(await this.scanner.scan(Readable.from([bytes]))!=='CLEAN')throw Error('GIS_MALWARE_REJECTED');
  const parsed=await this.parser.parse(bytes,options);
  const batchId=uuidv7(),objectKey=`gis/${actor.tenantId}/original/${batchId}`;
  await this.storage.putObject(objectKey,Readable.from([bytes]),bytes.length,{'x-amz-meta-sha256':hash});
  const result=await this.gis.transaction(tx=>this.gis.command(tx,actor,'gis.import',{operation:'STAGE',hash,filename,options},ctx,async()=>{
   await tx.query('INSERT INTO gis.import_batch(tenant_id,id,object_key,sha256,size_bytes,filename,format,options,parser_version,layers,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[actor.tenantId,batchId,objectKey,hash,bytes.length,filename,options.format,options,parsed.parserVersion,JSON.stringify(parsed.layers),actor.subjectId]);
   let invalid=0;
   for(const [index,feature] of parsed.features.entries()){
    let canonical:unknown=null;const issues=[...feature.issues];
    await tx.query('SAVEPOINT gis_feature_validation');
    try{if(issues.length)throw Error('GIS_SOURCE_FEATURE_INVALID');canonical=await this.gis.validateGeometry(tx,feature.geometry);await tx.query('RELEASE SAVEPOINT gis_feature_validation');}
    catch{await tx.query('ROLLBACK TO SAVEPOINT gis_feature_validation');await tx.query('RELEASE SAVEPOINT gis_feature_validation');issues.push('GIS_INVALID_OR_UNSUPPORTED_GEOMETRY');invalid++;}
    const mapped:Record<string,unknown>=Object.create(null);
    for(const [target,from] of Object.entries(options.mapping??{})){
     if(Object.hasOwn(feature.properties,from))mapped[target]=feature.properties[from];else issues.push(`GIS_ATTRIBUTE_MISSING:${from}`);
    }
    if(canonical!==null&&issues.length){canonical=null;invalid++;}
    await tx.query('INSERT INTO gis.feature_staging(tenant_id,batch_id,feature_index,source_feature_id,layer,source_crs,original_geometry,geometry,properties,mapped_properties,issues) VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8::text IS NULL THEN NULL ELSE ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($8),4326)) END,$9,$10,$11)',[actor.tenantId,batchId,index,feature.sourceFeatureId,feature.layer,feature.sourceCrs,feature.geometry,canonical?JSON.stringify(canonical):null,feature.properties,mapped,JSON.stringify(issues)]);
   }
   const response={batchId,count:parsed.features.length,invalid};await this.gis.audit(tx,actor,batchId,'IMPORT_STAGED',null,{...response,hash,filename,options,parserVersion:parsed.parserVersion},'Source scanned and validated; candidates not committed',ctx);return response;
  }));
  // A replay can produce an unreferenced private source object; remove only this known unused copy.
  if(result.batchId!==batchId)await this.storage.removeObject(objectKey).catch(()=>undefined);
  return result;
 }
 async preview(actor:GisActor,batchId:string):Promise<Record<string,unknown>>{
  actor=Object.freeze({...actor});
  await this.gis.registry.authorize(actor,'gis.import');id(batchId);
  const batch=(await this.gis.pool.query('SELECT id,sha256,size_bytes,filename,format,options,parser_version,layers FROM gis.import_batch WHERE tenant_id=$1 AND id=$2',[actor.tenantId,batchId])).rows[0];if(!batch)throw Error('GIS_NOT_FOUND');
  const features=(await this.gis.pool.query('SELECT feature_index,source_feature_id,layer,source_crs,ST_AsGeoJSON(geometry,17,0)::json AS geometry,properties,mapped_properties,issues FROM gis.feature_staging WHERE tenant_id=$1 AND batch_id=$2 ORDER BY feature_index',[actor.tenantId,batchId])).rows;
  for(const feature of features){
   feature.duplicate_candidates=(await this.gis.pool.query(`SELECT v.geometry_id,v.id AS version_id FROM gis.geometry_version v JOIN gis.feature_staging s ON s.tenant_id=v.tenant_id AND s.batch_id=$2 AND s.feature_index=$3 WHERE v.tenant_id=$1 AND v.geometry && s.geometry AND ST_Equals(v.geometry,s.geometry) LIMIT 20`,[actor.tenantId,batchId,feature.feature_index])).rows;
  }
  return {...batch,features};
 }
 /** Whole batch + GIS owner effects share one DB transaction; never writes foreign facts. */
 async commit(actor:GisActor,input:{batchId:string;mode:'ALL_OR_NOTHING'|'VALID_ONLY';reason:string},ctx:GisContext):Promise<{batchId:string;committed:GisResult[];skipped:number}>{
  actor=Object.freeze({...actor});input=structuredClone(input);ctx=structuredClone(ctx);
  await this.gis.registry.authorize(actor,'gis.import');keys(input,['batchId','mode','reason']);id(input.batchId);
  if(!['ALL_OR_NOTHING','VALID_ONLY'].includes(input.mode)||!text(input.reason))throw Error('GIS_INVALID_COMMIT_POLICY');
  return this.gis.transaction(tx=>this.gis.command(tx,actor,'gis.import',{operation:'COMMIT',...input},ctx,async()=>{
   const batch=(await tx.query('SELECT id,sha256 FROM gis.import_batch WHERE tenant_id=$1 AND id=$2',[actor.tenantId,input.batchId])).rows[0];if(!batch)throw Error('GIS_NOT_FOUND');
   // One commit per immutable batch; other idempotency keys cannot import it twice.
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,26))',[`${actor.tenantId}:${input.batchId}`]);
   if((await tx.query("SELECT id FROM gis.audit WHERE tenant_id=$1 AND entity_id=$2 AND action='IMPORT_COMMITTED'",[actor.tenantId,input.batchId])).rowCount)throw Error('GIS_IMPORT_ALREADY_COMMITTED');
   const rows=(await tx.query('SELECT feature_index,source_feature_id,source_crs,ST_AsGeoJSON(geometry,17,0)::json AS geometry,issues FROM gis.feature_staging WHERE tenant_id=$1 AND batch_id=$2 ORDER BY feature_index',[actor.tenantId,input.batchId])).rows;
   const invalid=rows.filter(r=>r.issues.length>0);if(invalid.length&&input.mode==='ALL_OR_NOTHING')throw Error('GIS_IMPORT_HAS_ERRORS');
   const committed:GisResult[]=[];
   for(const row of rows){if(row.issues.length)continue;
    const proposal:Proposal={expectedVersion:'0',geometry:row.geometry,source:{type:'IMPORT',sourceCrs:row.source_crs,importBatchId:input.batchId,sourceFeatureId:row.source_feature_id},reason:input.reason};
    committed.push(await this.gis.proposeInTransaction(tx,actor,proposal,{...ctx,idempotencyKey:`gis-feature:${input.batchId}:${row.feature_index}`}));
   }
   const result={batchId:input.batchId,committed,skipped:invalid.length};await this.gis.audit(tx,actor,input.batchId,'IMPORT_COMMITTED',null,{...result,mode:input.mode,sha256:batch.sha256},input.reason,ctx);return result;
  }));
 }
}
