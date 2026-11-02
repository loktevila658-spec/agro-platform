import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/widgets/gis_map.dart';

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
}
