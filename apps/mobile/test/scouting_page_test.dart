import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/features/scouting/scouting_repository.dart';
import 'package:agroplatform_mobile/features/scouting/scouting_page.dart';
import 'package:agroplatform_mobile/features/scouting/scouting_capture.dart';

import 'scouting_repository_test.dart' as f;
import 'support.dart';

void main() {
  testWidgets(
    'manual form retains note after GPS denial and shows recoverable error',
    (tester) async {
      late Directory root;
      late Workspace w;
      await tester.runAsync(() async {
        root = await Directory.systemTemp.createTemp('scouting-ui-');
        w = await Workspace.open(
          f.identity,
          root: root,
          secrets: MemorySecrets(),
        );
      });
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
            ScoutingCapture.channel,
            (call) async => throw PlatformException(code: 'PERMISSION_DENIED'),
          );
      try {
        await tester.pumpWidget(
          MaterialApp(
            home: ScoutingFormPage(
              repository: ScoutingRepository(w, verify: (_) async => true),
              contexts: const [f.captureContext],
              capture: const ScoutingCapture(),
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextField), 'Ручное наблюдение');
        await tester.scrollUntilVisible(
          find.text('Добавить GPS'),
          250,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.tap(find.text('Добавить GPS'));
        await tester.pumpAndSettle();
        expect(
          find.textContaining('Можно сохранить текст без GPS'),
          findsOneWidget,
        );
        expect(find.text('Ручное наблюдение'), findsOneWidget);
        expect(tester.takeException(), isNull);
      } finally {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(ScoutingCapture.channel, null);
        await tester.pumpWidget(const SizedBox());
        await tester.runAsync(() async {
          await w.close();
          await root.delete(recursive: true);
        });
      }
    },
  );
}
