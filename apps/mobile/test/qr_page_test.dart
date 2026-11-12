import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/sync.dart';
import 'package:agroplatform_mobile/features/qr/qr_page.dart';
import 'package:agroplatform_mobile/features/qr/qr_payload.dart';
import 'package:agroplatform_mobile/features/qr/qr_repository.dart';

import 'support.dart';

void main() {
  testWidgets('manual QR works without camera or WAN; errors are explicit', (
    tester,
  ) async {
    final root = await Directory.systemTemp.createTemp('qr-widget');
    final workspace = await Workspace.open(
      const WorkspaceIdentity('tenant', 'user', 'qr-widget'),
      root: root,
      secrets: MemorySecrets(),
    );
    final repository = QrRepository(
      workspace,
      (_, _, _) async => throw const SyncFailure('TRANSPORT_UNAVAILABLE'),
    );
    try {
      await tester.pumpWidget(
        MaterialApp(home: QrPage(repository: repository)),
      );
      expect(find.text('Сканировать QR'), findsOneWidget);
      await tester.enterText(
        find.byType(TextField).first,
        QrIdentity('019a7430-0000-7000-8000-000000000001').payload,
      );
      await tester.tap(find.text('Найти'));
      await tester.pumpAndSettle();
      expect(find.text('Сохранено для повторного поиска'), findsOneWidget);
      expect(
        await workspace.db.rows('SELECT * FROM qr_unresolved'),
        hasLength(1),
      );
      await tester.enterText(find.byType(TextField).first, 'invalid');
      await tester.tap(find.text('Найти'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Не удалось прочитать'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    } finally {
      repository.close();
      await workspace.close();
      await root.delete(recursive: true);
    }
  });
}
