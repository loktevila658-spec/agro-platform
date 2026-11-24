import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/generated/contracts.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/features/agronomy/actual_operation_repository.dart';
import 'package:agroplatform_mobile/features/agronomy/actual_operations_page.dart';

import 'actual_operation_repository_test.dart' as f;
import 'support.dart';

class CachedActualRepository extends ActualOperationRepository {
  CachedActualRepository(super.workspace) : super(verify: (_) async => true);
  List<ActualOperationIntent> values = [];
  @override
  Future<List<ActualCaptureContext>> contexts() async => [f.actualContext];
  @override
  Future<List<ActualOperationIntent>> intents() async => values;
}

void main() {
  testWidgets(
    'capture form retains invalid entry and gives recovery guidance',
    (tester) async {
      late Directory root;
      late Workspace w;
      late CachedActualRepository r;
      await tester.runAsync(() async {
        root = await Directory.systemTemp.createTemp('actual-form-');
        w = await Workspace.open(
          f.actualIdentity,
          root: root,
          secrets: MemorySecrets(),
        );
        r = CachedActualRepository(w);
      });
      try {
        await tester.pumpWidget(
          MaterialApp(
            home: ActualCaptureForm(repository: r, contexts: [f.actualContext]),
          ),
        );
        await tester.pumpAndSettle();
        await tester.scrollUntilVisible(
          find.text('Сохранить на устройстве'),
          400,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.tap(find.text('Сохранить на устройстве'));
        await tester.pumpAndSettle();
        expect(find.textContaining('Проверьте поле'), findsOneWidget);
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox());
        await tester.runAsync(() async {
          await w.close();
          await root.delete(recursive: true);
        });
      }
    },
  );
  testWidgets(
    'retained conflict has a visible state and no confirmation claim',
    (tester) async {
      late Directory root;
      late Workspace w;
      late CachedActualRepository r;
      await tester.runAsync(() async {
        root = await Directory.systemTemp.createTemp('actual-state-');
        w = await Workspace.open(
          f.actualIdentity,
          root: root,
          secrets: MemorySecrets(),
        );
        r = CachedActualRepository(w);
        r.values = [
          const ActualOperationIntent('fixture', 'conflict', {
            'fieldSeasonId': f.actualField,
            'actualQuantity': '1.25',
            'unit': 'fixture',
          }, null),
        ];
      });
      try {
        await tester.pumpWidget(
          MaterialApp(home: ActualOperationsPage(repository: r)),
        );
        await tester.pumpAndSettle();
        expect(
          find.textContaining('Требуется проверка · исходные данные сохранены'),
          findsOneWidget,
        );
        expect(find.text('Записать факт'), findsOneWidget);
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox());
        await tester.runAsync(() async {
          await w.close();
          await root.delete(recursive: true);
        });
      }
    },
  );
}
