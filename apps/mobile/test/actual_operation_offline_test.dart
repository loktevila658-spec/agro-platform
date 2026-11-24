import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/features/agronomy/actual_operation_repository.dart';

import 'actual_operation_repository_test.dart' as f;
import 'support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('encrypted actual restart and response-loss retry retain exact command identity and intent', () async {
    final root = await Directory.systemTemp.createTemp('actual-restart-'),
        secrets = MemorySecrets();
    var w = await Workspace.open(
      f.actualIdentity,
      root: root,
      secrets: secrets,
    );
    try {
      await f.seedActual(w);
      var r = ActualOperationRepository(w, verify: (_) async => true);
      final id = await r.capture(f.actualFixture()),
          first = (await r.queue.claim())!;
      await r.queue.retry(
        id,
        first.leaseToken!,
        nextRetryAt: DateTime.utc(2020),
      );
      await w.close();
      w = await Workspace.open(f.actualIdentity, root: root, secrets: secrets);
      r = ActualOperationRepository(w, verify: (_) async => true);
      final retry = (await r.queue.claim())!;
      expect(retry.commandId, id);
      expect(retry.data['payload_json'], first.data['payload_json']);
      expect(retry.deviceSeq, first.deviceSeq);
      await r.queue.recordServerResult(
        id,
        retry.leaseToken!,
        state: CommandState.confirmed,
        result: {
          'status': 'ACCEPTED',
          'canonical': {'id': id, 'state': 'CAPTURED'},
        },
        serverReceivedAt: DateTime.utc(2026, 11, 18),
        canonicalVersion: 1,
      );
      expect((await r.intents()).single.status, 'confirmed');
      expect(await r.queue.claim(), isNull);
    } finally {
      await w.close();
      await root.delete(recursive: true);
    }
  });
  test('conflict/rejection retains original values and blocks automatic retry; scope purge hides owner data', () async {
    final root = await Directory.systemTemp.createTemp('actual-conflict-'),
        w = await Workspace.open(
          f.actualIdentity,
          root: root,
          secrets: MemorySecrets(),
        );
    try {
      await f.seedActual(w);
      final r = ActualOperationRepository(w, verify: (_) async => true);
      for (final state in [
        CommandState.conflict,
        CommandState.rejected,
        CommandState.actionRequired,
      ]) {
        final id = await r.capture(f.actualFixture()),
            claim = (await r.queue.claim())!;
        await r.queue.recordServerResult(
          id,
          claim.leaseToken!,
          state: state,
          result: {
            'code': 'VERSION_CONFLICT',
            'localIntent': claim.data['payload_json'],
          },
          serverReceivedAt: DateTime.utc(2026, 11, 18),
        );
        expect(await r.queue.claim(), isNull);
      }
      final intents = await r.intents();
      expect(intents.length, 3);
      expect(
        intents.every((r) => r.attention && r.data['actualQuantity'] == '1.25'),
        true,
      );
      await w.db.customStatement(
        "DELETE FROM entity_cache WHERE entity_type='AgronomyCapture'",
      );
      expect(await r.intents(), isEmpty);
      expect(await r.queue.count(), 3);
    } finally {
      await w.close();
      await root.delete(recursive: true);
    }
  });
}
