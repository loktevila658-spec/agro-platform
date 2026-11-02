import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { GisParser } from '../dist/modules/gis/gis.parser.js';
const parser=new GisParser();
const polygon={type:'Polygon',coordinates:[[[30,50],[30.01,50],[30.01,50.01],[30,50]]]};
const collection={type:'FeatureCollection',features:[{type:'Feature',id:'source-fixture',properties:{name:'Тест'},geometry:polygon}]};
test('GIS actual GDAL parser preserves GeoJSON and normalizes WKT/WKB/CSV/KML/GPKG/SHP', {timeout:90000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'gis-parser-fixture-'));
 try{
  const result=await parser.parse(Buffer.from(JSON.stringify(collection)),{format:'GeoJSON'});
  assert.equal(result.features.length,1);assert.equal(result.features[0].sourceCrs,'EPSG:4326');assert.equal(result.features[0].properties.name,'Тест');assert.match(result.parserVersion,/GDAL\//);
  const precise=structuredClone(collection);precise.features[0].geometry.coordinates[0][0][0]=30.123456789012344;precise.features[0].geometry.coordinates[0][3][0]=30.123456789012344;
  const exact=await parser.parse(Buffer.from(JSON.stringify(precise)),{format:'GeoJSON'});assert.equal(exact.features[0].geometry.coordinates[0][0][0],30.123456789012344);
  const wkt='POLYGON ((30 50,30.01 50,30.01 50.01,30 50))';
  assert.equal((await parser.parse(Buffer.from(wkt),{format:'WKT',sourceCrs:'EPSG:4326'})).features[0].geometry.type,'Polygon');
  await assert.rejects(parser.parse(Buffer.from(wkt),{format:'WKT'}),/CRS/);
  const csv=Buffer.from('x,y\n30,50\n30.01,50\n30.01,50.01\n30,50');
  assert.equal((await parser.parse(csv,{format:'CSV',sourceCrs:'EPSG:4326',csv:{x:'x',y:'y',mode:'VERTICES'}})).features[0].geometry.type,'Polygon');
  await assert.rejects(parser.parse(csv,{format:'CSV',sourceCrs:'EPSG:4326'}),/MAPPING/);
  const kml=Buffer.from('<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>30,50 30.01,50 30.01,50.01 30,50</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>');
  assert.deepEqual((await parser.parse(kml,{format:'KML'})).features[0].issues,[]);
  execFileSync(process.env.GIS_PYTHON??'/usr/bin/python3',['-c',String.raw`
from osgeo import ogr,osr
import pathlib,sys,zipfile
p=pathlib.Path(sys.argv[1]);s=osr.SpatialReference();s.ImportFromEPSG(4326)
g=ogr.CreateGeometryFromWkt('POLYGON ((30 50,30.01 50,30.01 50.01,30 50))')
(p/'source.wkb').write_bytes(g.ExportToWkb())
for driver,name in [('GPKG','source.gpkg'),('ESRI Shapefile','source.shp')]:
 d=ogr.GetDriverByName(driver).CreateDataSource(str(p/name));l=d.CreateLayer('fixture',s,ogr.wkbPolygon,options=['ENCODING=UTF-8'] if driver=='ESRI Shapefile' else [])
 l.CreateField(ogr.FieldDefn('name',ogr.OFTString));f=ogr.Feature(l.GetLayerDefn());f.SetField('name','fixture');f.SetGeometry(g);l.CreateFeature(f);f=None;l=None;d=None
with zipfile.ZipFile(p/'source.zip','w') as z:
 for f in p.glob('source.*'):
  if f.suffix in ['.shp','.dbf','.shx','.prj','.cpg']:z.write(f,f.name)
with zipfile.ZipFile(p/'ambiguous.zip','w') as z:
 for f in p.glob('source.*'):
  if f.suffix in ['.shp','.dbf','.shx','.prj']:z.write(f,f.name)
with zipfile.ZipFile(p/'traversal.zip','w') as z:z.writestr('../source.kml','bad')
with zipfile.ZipFile(p/'bomb.zip','w',compression=zipfile.ZIP_DEFLATED) as z:z.writestr('source.kml','x'*1000000)
`,dir]);
  for(const [file,options] of [['source.wkb',{format:'WKB',sourceCrs:'EPSG:4326'}],['source.gpkg',{format:'GPKG'}],['source.zip',{format:'SHP'}]]){
   const parsed=await parser.parse(await readFile(join(dir,file)),options);assert.deepEqual(parsed.features[0].issues,[]);assert.equal(parsed.features[0].sourceCrs,'EPSG:4326');
  }
  await assert.rejects(parser.parse(await readFile(join(dir,'ambiguous.zip')),{format:'SHP'}),/ENCODING/);
  await assert.rejects(parser.parse(await readFile(join(dir,'traversal.zip')),{format:'KMZ'}),/ARCHIVE_PATH/);
  await assert.rejects(parser.parse(await readFile(join(dir,'bomb.zip')),{format:'KMZ'}),/EXPANSION_LIMIT/);
  await assert.rejects(parser.parse(kml,{format:'KML',sourceCrs:'EPSG:3857'}),/CRS_MAPPING_CONFLICT/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('GIS parser rejects unexpected formats, unsafe mappings and external KML references',async()=>{
 await assert.rejects(parser.parse(Buffer.alloc(0),{format:'GeoJSON'}),/SIZE_LIMIT/);
 await assert.rejects(parser.parse(Buffer.from('{}'),{format:'VRT'}),/FORMAT/);
 await assert.rejects(parser.parse(Buffer.from('<!DOCTYPE kml SYSTEM "file:///etc/passwd"><kml/>'),{format:'KML'}),/EXTERNAL_REFERENCE/);
 await assert.rejects(parser.parse(Buffer.from(JSON.stringify({...collection,crs:{type:'name',properties:{name:'EPSG:3857'}}})),{format:'GeoJSON'}),/RFC7946/);
 await assert.rejects(parser.parse(Buffer.from(JSON.stringify(collection)),{format:'GeoJSON',mapping:JSON.parse('{"__proto__":"name"}')}),/MAPPING/);
});
