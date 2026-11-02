import 'package:agroplatform_mobile/widgets/gis_map.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('native MapLibre local style loads without a provider', (
    tester,
  ) async {
    await tester.pumpWidget(const MaterialApp(home: GisMapPage()));
    expect(find.byType(MapLibreMap), findsOneWidget);
    for (var attempt = 0; attempt < 100; attempt++) {
      await tester.pump(const Duration(milliseconds: 200));
      if (find
          .text('Нет подключённых слоёв. Подложка не подключена.')
          .evaluate()
          .isNotEmpty) {
        break;
      }
    }
    expect(
      find.text('Нет подключённых слоёв. Подложка не подключена.'),
      findsOneWidget,
    );
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    await tester.pump();
    expect(find.byType(MapLibreMap), findsNothing);
  });
}
