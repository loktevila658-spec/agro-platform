"""One bounded, read-only parse. Receives local temporary paths only, never URLs."""
import csv
import json
import io
import math
import os
import pathlib
import resource
import sys
import tempfile
import zipfile
import xml.etree.ElementTree as ET

resource.setrlimit(resource.RLIMIT_CPU, (15, 15))
resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024, 768 * 1024 * 1024))
resource.setrlimit(resource.RLIMIT_FSIZE, (32 * 1024 * 1024, 32 * 1024 * 1024))
from osgeo import gdal, ogr, osr

gdal.UseExceptions()
ogr.UseExceptions()
osr.UseExceptions()
gdal.SetConfigOption('GDAL_PAM_ENABLED', 'NO')
gdal.SetConfigOption('OGR_SQLITE_LOAD_EXTENSIONS', '')
gdal.SetConfigOption('OGR_SQLITE_ALLOW_VIRTUAL_OGR', 'NO')
gdal.SetConfigOption('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')
gdal.SetConfigOption('CPL_VSIL_CURL_ALLOWED_EXTENSIONS', '')
MAX_BYTES = 16 * 1024 * 1024
MAX_FEATURES = 1000


def require(ok, code):
    if not ok:
        raise ValueError(code)


def srs(value):
    require(isinstance(value, str) and value.startswith('EPSG:') and value[5:].isdigit(), 'GIS_CRS_UNKNOWN')
    crs = osr.SpatialReference()
    crs.ImportFromEPSG(int(value[5:]))
    crs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return crs


class SafeKmlTreeBuilder(ET.TreeBuilder):
    def doctype(self, name, pubid, system):
        raise ValueError('GIS_EXTERNAL_REFERENCE_FORBIDDEN')


def parse_kml(raw):
    # Parse the declared XML encoding before testing structure (including UTF-16).
    root = ET.fromstring(raw, parser=ET.XMLParser(target=SafeKmlTreeBuilder()))
    for node in root.iter():
        local = node.tag.split('}')[-1].lower()
        require(local not in ('networklink', 'href') and not node.tag.startswith('{http://www.w3.org/2001/XInclude}'), 'GIS_EXTERNAL_REFERENCE_FORBIDDEN')
        require(all(key.split('}')[-1].lower() != 'href' for key in node.attrib), 'GIS_EXTERNAL_REFERENCE_FORBIDDEN')
    return root


def geometry_json(geom):
    # Python float JSON round-trips the double; no GDAL decimal-rounding profile.
    name = geom.GetGeometryName()
    if name == 'POLYGON':
        return {'type': 'Polygon', 'coordinates': [[list(p[:2]) for p in geom.GetGeometryRef(i).GetPoints()] for i in range(geom.GetGeometryCount())]}
    if name == 'MULTIPOLYGON':
        return {'type': 'MultiPolygon', 'coordinates': [geometry_json(geom.GetGeometryRef(i))['coordinates'] for i in range(geom.GetGeometryCount())]}
    if name == 'POINT':
        return {'type': 'Point', 'coordinates': list(geom.GetPoint(0)[:2])}
    if name == 'LINESTRING':
        return {'type': 'LineString', 'coordinates': [list(p[:2]) for p in geom.GetPoints()]}
    return {'type': name, 'coordinates': []}  # Unsupported feature remains a review issue.


def main():
    path = pathlib.Path(sys.argv[1])
    opts = json.loads(pathlib.Path(sys.argv[2]).read_text())
    fmt = opts['format']
    raw = path.read_bytes()
    require(0 < len(raw) <= MAX_BYTES, 'GIS_FILE_SIZE_LIMIT')
    features, layers = [], []
    target = srs('EPSG:4326')

    def add(geom, props, feature_id, layer, source_crs, issues=None):
        require(len(features) < MAX_FEATURES, 'GIS_FEATURE_LIMIT')
        issues = list(issues or [])
        output = None
        if geom is None:
            issues.append('GIS_EMPTY_GEOMETRY')
        else:
            try:
                if fmt in ('KML', 'KMZ') and kml_2d:
                    geom.FlattenTo2D()
                require(geom.GetCoordinateDimension() == 2 and not geom.IsMeasured(), 'GIS_GEOMETRY_2D_REQUIRED')
                transform = osr.CoordinateTransformation(source_crs, target)
                require(geom.Transform(transform) == 0, 'GIS_CRS_TRANSFORM_FAILED')
                output = geometry_json(geom)
            except Exception:
                issues.append('GIS_CRS_OR_DIMENSION_INVALID')
        source_text = source_crs.GetAuthorityName(None)
        source_code = source_crs.GetAuthorityCode(None)
        source_name = f'{source_text}:{source_code}' if source_text and source_code else source_crs.ExportToWkt()
        features.append({'sourceFeatureId': f'{layer}:{feature_id}:{len(features)}', 'layer': layer, 'sourceCrs': source_name,
                         'geometry': output, 'properties': props, 'issues': issues})

    with tempfile.TemporaryDirectory(prefix='gis-read-') as temporary:
        base = pathlib.Path(temporary)
        if fmt in ('SHP', 'KMZ'):
            total = 0
            with zipfile.ZipFile(path) as archive:
                require(len(archive.infolist()) <= 32, 'GIS_ARCHIVE_ENTRY_LIMIT')
                seen = set()
                for item in archive.infolist():
                    name = pathlib.PurePosixPath(item.filename)
                    require(len(name.parts) == 1 and not name.is_absolute() and '\\' not in item.filename and ':' not in item.filename and item.filename not in ('.', '..') and not item.is_dir(), 'GIS_ARCHIVE_PATH')
                    require((item.external_attr >> 16) & 0o170000 != 0o120000, 'GIS_ARCHIVE_SYMLINK')
                    require(item.filename.casefold() not in seen, 'GIS_ARCHIVE_DUPLICATE')
                    seen.add(item.filename.casefold())
                    suffix = name.suffix.lower()
                    require(suffix in ({'.shp', '.shx', '.dbf', '.prj', '.cpg'} if fmt == 'SHP' else {'.kml'}), 'GIS_ARCHIVE_TYPE')
                    total += item.file_size
                    require(total <= MAX_BYTES and item.file_size <= MAX_BYTES and item.file_size / max(item.compress_size, 1) <= 100, 'GIS_ARCHIVE_EXPANSION_LIMIT')
                    content = archive.read(item)
                    (base / item.filename).write_bytes(content)
            candidates = list(base.glob('*.shp' if fmt == 'SHP' else '*.kml'))
            require(len(candidates) == 1, 'GIS_ARCHIVE_LAYER_AMBIGUOUS')
            path = candidates[0]
            if fmt == 'SHP':
                require(path.with_suffix('.dbf').exists() and path.with_suffix('.shx').exists(), 'GIS_SHP_BUNDLE_INCOMPLETE')
                if opts.get('encoding'):
                    require(opts['encoding'] in ('UTF-8', 'CP1251', 'CP1252', 'ISO-8859-1'), 'GIS_SHP_ENCODING_UNKNOWN')
                    gdal.SetConfigOption('SHAPE_ENCODING', opts['encoding'])
                else:
                    cpg = path.with_suffix('.cpg')
                    require(cpg.exists() and cpg.read_text().strip().upper() in ('UTF-8', '65001', 'CP1251', '1251', 'CP1252', '1252', 'ISO-8859-1'), 'GIS_SHP_ENCODING_REQUIRED')
        kml_2d = False
        if fmt in ('KML', 'KMZ'):
            root = parse_kml(path.read_bytes())
            coordinate_nodes = [n for n in root.iter() if n.tag.split('}')[-1] == 'coordinates']
            kml_2d = bool(coordinate_nodes) and all(len(token.split(',')) == 2 for n in coordinate_nodes for token in (n.text or '').split())
        if fmt in ('WKT', 'WKB'):
            crs = srs(opts.get('sourceCrs'))
            geom = ogr.CreateGeometryFromWkt(raw.decode('utf-8')) if fmt == 'WKT' else ogr.CreateGeometryFromWkb(raw)
            layers.append('geometry')
            add(geom, {}, '0', 'geometry', crs)
        elif fmt == 'CSV':
            crs = srs(opts.get('sourceCrs'))
            mapping = opts.get('csv', {})
            require(mapping.get('mode') in ('POINTS', 'VERTICES') and mapping.get('x') and mapping.get('y') and mapping['x'] != mapping['y'], 'GIS_CSV_MAPPING_REQUIRED')
            reader = csv.DictReader(io.StringIO(raw.decode('utf-8-sig'), newline=''))
            fields = reader.fieldnames or []
            require(len(fields) == len(set(fields)), 'GIS_CSV_AMBIGUOUS_COLUMNS')
            require(mapping['x'] in fields and mapping['y'] in fields, 'GIS_CSV_MAPPING_REQUIRED')
            rows = list(reader)
            require(0 < len(rows) <= 5000, 'GIS_CSV_ROW_LIMIT')
            require(all(None not in row for row in rows), 'GIS_CSV_UNMAPPED_COLUMNS')
            layers.append('coordinates')
            points = []
            for index, row in enumerate(rows):
                x, y = float(row[mapping['x']]), float(row[mapping['y']])
                require(math.isfinite(x) and math.isfinite(y), 'GIS_INVALID_COORDINATES')
                points.append((x, y))
                if mapping['mode'] == 'POINTS':
                    point = ogr.Geometry(ogr.wkbPoint)
                    point.AddPoint_2D(x, y)
                    add(point, row, str(index), 'coordinates', crs)
            if mapping['mode'] == 'VERTICES':
                require(len(points) >= 4 and points[0] == points[-1], 'GIS_UNCLOSED_RING')
                ring, polygon = ogr.Geometry(ogr.wkbLinearRing), ogr.Geometry(ogr.wkbPolygon)
                for x, y in points:
                    ring.AddPoint_2D(x, y)
                polygon.AddGeometry(ring)
                add(polygon, {'rows': rows}, '0', 'coordinates', crs)
        else:
            drivers = {'GeoJSON': 'GeoJSON', 'KML': 'KML', 'KMZ': 'KML', 'GPKG': 'GPKG', 'SHP': 'ESRI Shapefile'}
            require(fmt in drivers, 'GIS_FORMAT_UNSUPPORTED')
            if fmt == 'GeoJSON':
                obj = json.loads(raw)
                require('crs' not in obj, 'GIS_GEOJSON_RFC7946_REQUIRED')
                require(opts.get('sourceCrs', 'EPSG:4326') == 'EPSG:4326', 'GIS_GEOJSON_CRS')
            dataset = gdal.OpenEx(str(path), gdal.OF_VECTOR | gdal.OF_READONLY, allowed_drivers=[drivers[fmt]])
            require(dataset is not None and dataset.GetLayerCount() <= 32, 'GIS_DATASET_INVALID')
            layers = [dataset.GetLayerByIndex(i).GetName() for i in range(dataset.GetLayerCount())]
            require(len(layers) == 1 or opts.get('layer') in layers, 'GIS_LAYER_MAPPING_REQUIRED')
            selected = opts.get('layer') or (layers[0] if layers else None)
            require(selected in layers, 'GIS_LAYER_NOT_FOUND')
            layer = dataset.GetLayerByName(selected)
            detected = layer.GetSpatialRef()
            if fmt == 'GeoJSON':
                crs = target
            elif opts.get('sourceCrs'):
                crs = srs(opts['sourceCrs'])
                if detected:
                    detected.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
                    require(bool(detected.IsSame(crs)), 'GIS_CRS_MAPPING_CONFLICT')
            else:
                require(detected is not None, 'GIS_CRS_UNKNOWN')
                crs = detected.Clone()
                crs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
            for feature in layer:
                props = json.loads(feature.ExportToJson())['properties']
                require('\ufffd' not in json.dumps(props, ensure_ascii=False), 'GIS_ENCODING_INVALID')
                geom = feature.GetGeometryRef()
                add(geom.Clone() if geom else None, props, str(feature.GetFID()), selected, crs)
        require(len(features) > 0, 'GIS_EMPTY_IMPORT')
        output = {'features': features, 'layers': layers, 'parserVersion': f'GDAL/{gdal.VersionInfo("RELEASE_NAME")}'}
        encoded = json.dumps(output, allow_nan=False, ensure_ascii=False)
        require(len(encoded.encode()) <= MAX_BYTES, 'GIS_PARSED_SIZE_LIMIT')
        print(encoded)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never expose parser diagnostics containing source properties or local paths.
        code = str(error) if isinstance(error, ValueError) and str(error).startswith('GIS_') else 'GIS_PARSE_REJECTED'
        print(code, file=sys.stderr)
        sys.exit(1)
