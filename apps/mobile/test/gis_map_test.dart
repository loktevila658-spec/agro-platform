import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/widgets/gis_map.dart';

import 'offline_package_test.dart' as f;

void main() {
  test('base MapLibre style uses no network or fabricated field data', () {
    final style = jsonDecode(gisBaseStyle) as Map<String, dynamic>;
    expect(style['version'], 8);
    expect(style['sources'], isEmpty);
    expect(style['glyphs'], isNull);
    expect(style['sprite'], isNull);
    final layers = style['layers'] as List<dynamic>;
    expect(layers.single['type'], 'background');
  });
  test(
    'render boundary caps polygons while preserving pinned revision/target IDs',
    () {
      final data = fieldFeatures(List.generate(1000, (_) => f.field()));
      expect(data['features'], hasLength(100));
      final first = (data['features'] as List).first as Map;
      expect(first['properties']['revisionId'], 'test-revision-1');
      expect(first['properties']['targetId'], f.mapField);
    },
  );
}
