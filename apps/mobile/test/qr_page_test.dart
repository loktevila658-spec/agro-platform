import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/sync.dart';
import 'package:agroplatform_mobile/features/qr/qr_page.dart';
import 'package:agroplatform_mobile/features/qr/qr_payload.dart';
import 'package:agroplatform_mobile/features/qr/qr_repository.dart';

import 'support.dart';

// The widget clock is fake; encrypted Drift isolate I/O runs in runAsync.
// This adapter controls scheduling only and executes the real QR repository.
class ScheduledQrRepository extends QrRepository {
  ScheduledQrRepository(super.workspace, super.request);
  Future<void> Function()? work;
  @override
  Future<QrView> resolve(String raw, {bool refresh = false}) {
    final completion = Completer<QrView>();
    work = () async {
      try {
        completion.complete(await super.resolve(raw, refresh: refresh));
      } catch (error, stack) {
        completion.completeError(error, stack);
      }
    };
    return completion.future;
  }

  Future<void> flush() async {
    final operation = work!;
    work = null;
    await operation();
  }
}

void main() {
  testWidgets('manual QR works without camera or WAN; errors are explicit', (
    tester,
  ) async {
    late Directory root;
    late Workspace workspace;
    late ScheduledQrRepository repository;
    await tester.runAsync(() async {
      root = await Directory.systemTemp.createTemp('qr-widget');
      workspace = await Workspace.open(
        const WorkspaceIdentity('tenant', 'user', 'qr-widget'),
        root: root,
        secrets: MemorySecrets(),
      );
      repository = ScheduledQrRepository(
        workspace,
        (_, _, _) async => throw const SyncFailure('TRANSPORT_UNAVAILABLE'),
      );
    });
    const method = MethodChannel(
      'dev.steenbakker.mobile_scanner/scanner/method',
    );
    const events = MethodChannel(
      'dev.steenbakker.mobile_scanner/scanner/event',
    );
    const orientation = MethodChannel(
      'dev.steenbakker.mobile_scanner/scanner/deviceOrientation',
    );
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(method, (call) async {
      if (call.method == 'state') return 0;
      if (call.method == 'request') return false;
      return null;
    });
    messenger.setMockMethodCallHandler(events, (_) async => null);
    messenger.setMockMethodCallHandler(orientation, (_) async => null);
    try {
      await tester.pumpWidget(
        MaterialApp(home: QrPage(repository: repository)),
      );
      expect(find.text('Сканировать QR'), findsOneWidget);
      await tester.tap(find.text('Сканировать QR'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Камера недоступна'), findsOneWidget);
      await tester.tap(find.text('Закрыть сканер'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byType(TextField).first,
        QrIdentity('019a7430-0000-7000-8000-000000000001').payload,
      );
      await tester.tap(find.text('Найти'));
      await tester.runAsync(repository.flush);
      await tester.pumpAndSettle();
      expect(find.text('Сохранено для повторного поиска'), findsOneWidget);
      await tester.runAsync(() async {
        expect(
          await workspace.db.rows('SELECT * FROM qr_unresolved'),
          hasLength(1),
        );
      });
      await tester.enterText(find.byType(TextField).first, 'invalid');
      await tester.tap(find.text('Найти'));
      await tester.runAsync(repository.flush);
      await tester.pumpAndSettle();
      expect(find.textContaining('Не удалось прочитать'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
    } finally {
      messenger.setMockMethodCallHandler(method, null);
      messenger.setMockMethodCallHandler(events, null);
      messenger.setMockMethodCallHandler(orientation, null);
      repository.close();
      await tester.runAsync(() async {
        await workspace.close();
        await root.delete(recursive: true);
      });
    }
  });
}
