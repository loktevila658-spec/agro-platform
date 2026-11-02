import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import type { ImportOptions,ParsedImport } from './gis.types';
import { keys,text } from './gis.validation';
const exec=promisify(execFile);
export const GIS_FILE_LIMIT=16*1024*1024;
@Injectable()
export class GisParser {
 async parse(bytes:Buffer,options:ImportOptions):Promise<ParsedImport>{
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>GIS_FILE_LIMIT)throw Error('GIS_FILE_SIZE_LIMIT');
  keys(options,['format','sourceCrs','layer','encoding','mapping','csv']);
  if(!['GeoJSON','KML','KMZ','GPKG','SHP','WKT','WKB','CSV'].includes(options.format))throw Error('GIS_FORMAT_UNSUPPORTED');
  for(const k of ['sourceCrs','layer','encoding'] as const)if(options[k]!==undefined&&!text(options[k],256))throw Error('GIS_IMPORT_OPTIONS_INVALID');
  if(options.mapping!==undefined){if(!options.mapping||typeof options.mapping!=='object'||Array.isArray(options.mapping)||Object.entries(options.mapping).length>64||Object.entries(options.mapping).some(([a,b])=>!text(a,128)||!text(b,128)||['__proto__','prototype','constructor'].includes(a)))throw Error('GIS_MAPPING_INVALID');}
  if(options.csv!==undefined){keys(options.csv,['x','y','mode']);if(!text(options.csv.x,128)||!text(options.csv.y,128)||!['POINTS','VERTICES'].includes(options.csv.mode))throw Error('GIS_CSV_MAPPING_REQUIRED');}
  const dir=await mkdtemp(join(tmpdir(),'agro-gis-'));
  try{
   const suffix={GeoJSON:'geojson',KML:'kml',KMZ:'zip',GPKG:'gpkg',SHP:'zip',WKT:'wkt',WKB:'wkb',CSV:'csv'}[options.format];
   const path=join(dir,`source.${suffix}`),config=join(dir,'options.json');
   await writeFile(path,bytes,{mode:0o600});await writeFile(config,JSON.stringify(options),{mode:0o600});
   const script=resolve(process.env.GIS_PARSER_SCRIPT??join(__dirname,'../../../src/modules/gis/gis-parser.py'));
   const {stdout}=await exec(process.env.GIS_PYTHON??'/usr/bin/python3',['-I',script,path,config],{timeout:20000,maxBuffer:GIS_FILE_LIMIT+1024,env:{PATH:'/usr/bin:/bin',PROJ_NETWORK:'OFF',GDAL_HTTP_TIMEOUT:'1'}});
   const parsed=JSON.parse(stdout) as ParsedImport;
   if(!parsed||!Array.isArray(parsed.features)||parsed.features.length<1||parsed.features.length>1000||!text(parsed.parserVersion,100))throw Error('GIS_PARSER_INVALID_RESPONSE');return parsed;
  }catch(error){const e=error as {stderr?:string;message?:string};const match=e.stderr?.match(/GIS_[A-Z0-9_]+/);throw Error(match?.[0]??'GIS_PARSER_UNAVAILABLE_OR_REJECTED');}
  finally{await rm(dir,{recursive:true,force:true});}
 }
}
