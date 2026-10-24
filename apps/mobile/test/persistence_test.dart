import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';

import 'support.dart';

void main() {
  test(
    'encrypted queue survives restart with immutable intent and lease recovery',
    () async {
      final root = await Directory.systemTemp.createTemp('mobile-restart');
      final secrets = MemorySecrets();
      final identity = WorkspaceIdentity('tenant', 'user', 'workspace');
      var workspace = await Workspace.open(
        identity,
        root: root,
        secrets: secrets,
      );
      final draft = CommandDraft.create(
        aggregateType: 'Fixture',
        aggregateId: 'entity',
        commandType: 'RecordFixture',
        expectedVersion: 7,
        observedAt: DateTime.utc(2026, 10, 1),
        payload: {'value': 'offline'},
      );
      final queue = workspace.commands(
        verify: (_) async => true,
        validate: (_, _) async => true,
      );
      final grant = testGrant(identity);
      final saved = await queue.enqueue(draft, grant);
      expect(saved.idempotencyKey, draft.commandId);
      final leased = await queue.claim(now: DateTime.utc(2026, 10, 24));
      expect(leased!.commandId, draft.commandId);
      await workspace.close();
      workspace = await Workspace.open(identity, root: root, secrets: secrets);
      final restored = workspace.commands(
        verify: (_) async => true,
        validate: (_, _) async => true,
      );
      final retry = await restored.claim(now: DateTime.utc(2026, 10, 24, 1));
      expect(retry!.commandId, saved.commandId);
      expect(retry.expectedVersion, 7);
      expect(retry.observedAt, draft.observedAt);
      expect(retry.deviceSeq, saved.deviceSeq);
      expect(retry.attempts, 2);
      expect(await restored.enqueue(draft, grant), isA<QueuedCommand>());
      expect(await restored.count(), 1);
      await workspace.close();
      await root.delete(recursive: true);
    },
  );
}
