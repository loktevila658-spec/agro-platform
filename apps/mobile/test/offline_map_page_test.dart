import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/features/map/offline_package_controller.dart';
import 'package:agroplatform_mobile/features/map/offline_map_page.dart';

import 'support.dart';
import 'offline_package_test.dart' as f;
import 'offline_package_sync_test.dart' show TestRegions;

void main() {
  testWidgets(
    'actual pinned metadata has explicit missing basemap and accessible region controls',
    (tester) async {
      late Directory root;
      late Workspace w;
      late OfflinePackageController c;
      await tester.runAsync(() async {
        root = await Directory.systemTemp.createTemp('map-widget');
        w = await Workspace.open(
          f.mapIdentity,
          root: root,
          secrets: MemorySecrets(),
          authenticatedDeviceId: f.mapDevice,
        );
        await f.seedMap(w);
        c = OfflinePackageController(
          w,
          verify: (_) async => true,
          regions: TestRegions(),
        );
        await c.reconcile();
      });
      try {
        await tester.pumpWidget(
          MaterialApp(
            home: OfflineMapPage(
              controller: c,
              initialize: false,
              mapBuilder: (_, _) => const SizedBox(),
            ),
          ),
        );
        await tester.pump();
        expect(
          find.text('Поля сохранены · подложка не загружена'),
          findsOneWidget,
        );
        expect(find.textContaining('версия 1'), findsOneWidget);
        expect(find.byTooltip('Выбрать область'), findsOneWidget);
        expect(
          tester
              .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Скачать подложку'),
              )
              .onPressed,
          isNull,
        );
      } finally {
        await tester.pumpWidget(const SizedBox());
        await tester.runAsync(() async {
          await c.close();
          c.dispose();
          await w.close();
          await root.delete(recursive: true);
        });
      }
    },
  );
}
