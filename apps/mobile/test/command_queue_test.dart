import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';

import 'support.dart';

void main() {
  late Directory root;
  late Workspace ws;
  const identity = WorkspaceIdentity('tenant', 'user', 'workspace');
  setUp(() async {
    root = await Directory.systemTemp.createTemp('mobile-commands');
    ws = await Workspace.open(identity, root: root, secrets: MemorySecrets());
  });
  tearDown(() async {
    await ws.close();
    await root.delete(recursive: true);
  });

  test(
    'deny by default, forged/expired/future/wrong-scope grants never enqueue',
    () async {
      final draft = fixtureDraft();
      await expectLater(
        ws
            .commands(verify: (_) async => false)
            .enqueue(draft, testGrant(identity)),
        throwsStateError,
      );
      await expectLater(
        ws
            .commands(verify: (_) async => true)
            .enqueue(draft, testGrant(identity)),
        throwsStateError,
      );
      final queue = ws.commands(
        verify: (_) async => true,
        validate: (_, _) async => true,
      );
      await expectLater(
        queue.enqueue(
          draft,
          testGrant(identity, expiresAt: DateTime.utc(2026, 1)),
        ),
        throwsStateError,
      );
      await expectLater(
        queue.enqueue(
          draft,
          testGrant(const WorkspaceIdentity('foreign', 'user', 'workspace')),
        ),
        throwsStateError,
      );
      await expectLater(
        queue.enqueue(draft, testGrant(identity), now: DateTime.utc(2019)),
        throwsStateError,
      );
      await ws.db.customStatement('UPDATE local_workspace SET scope_version=2');
      await expectLater(
        queue.enqueue(draft, testGrant(identity)),
        throwsStateError,
      );
      expect(await queue.count(), 0);
      expect(await ws.db.rows('SELECT * FROM permission_snapshot'), isEmpty);
    },
  );

  test('authority-required or resource-denied grants cannot enter the provisional queue', () async {
    final queue = ws.commands(
      verify: (_) async => true,
      validate: (_, _) async => true,
    );
    OfflineGrant grant(String risk, Set<String> owners) => OfflineGrant(
      id: 'policy-fixture',
      tenantId: identity.tenantId,
      userId: identity.userId,
      scopeVersion: 1,
      issuedAt: DateTime.utc(2020),
      expiresAt: DateTime.utc(2100),
      allowedCommands: {'RecordFixture'},
      allowedOwners: owners,
      risk: risk,
      signedEnvelope: 'signed-fixture',
    );
    await expectLater(
      queue.enqueue(fixtureDraft(), grant('O3', {'Fixture:entity'})),
      throwsStateError,
    );
    await expectLater(
      queue.enqueue(fixtureDraft(), grant('O1', {'Fixture:other'})),
      throwsStateError,
    );
    expect(await queue.count(), 0);
  });

  test('same ID is immutable, concurrent enqueue deduplicates and device sequence is monotonic', () async {
    final queue = ws.commands(
      verify: (_) async => true,
      validate: (_, _) async => true,
    );
    final draft = fixtureDraft();
    final saved = await Future.wait(
      List.generate(10, (_) => queue.enqueue(draft, testGrant(identity))),
    );
    expect(saved.map((v) => v.commandId).toSet(), {draft.commandId});
    expect(await queue.count(), 1);
    final changed = CommandDraft(
      commandId: draft.commandId,
      aggregateType: draft.aggregateType,
      aggregateId: draft.aggregateId,
      commandType: draft.commandType,
      expectedVersion: 7,
      observedAt: draft.observedAt,
      payload: {'value': 'tampered'},
    );
    await expectLater(
      queue.enqueue(changed, testGrant(identity)),
      throwsStateError,
    );
    final next = await queue.enqueue(
      fixtureDraft(value: 'next'),
      testGrant(identity),
    );
    expect(next.deviceSeq, saved.first.deviceSeq + 1);
    expect(await ws.db.rows('SELECT * FROM local_audit'), hasLength(2));
  });

  test('projection failure rolls back command, snapshot, sequence and provenance together', () async {
    final queue = ws.commands(
      verify: (_) async => true,
      validate: (_, _) async => true,
    );
    await ws.db.customStatement(
      "CREATE TRIGGER fail_projection BEFORE INSERT ON provisional_projection BEGIN SELECT RAISE(ABORT,'fixture failure'); END",
    );
    await expectLater(
      queue.enqueue(fixtureDraft(), testGrant(identity)),
      throwsA(anything),
    );
    for (final table in [
      'sync_outbox',
      'permission_snapshot',
      'local_audit',
      'provisional_projection',
    ]) {
      expect(await ws.db.rows('SELECT * FROM $table'), isEmpty);
    }
    expect(
      (await ws.db.rows('SELECT device_seq FROM local_device'))
          .single['device_seq'],
      0,
    );
  });

  test(
    'disk full never reports success or partially advances sequence',
    () async {
      final queue = ws.commands(
        verify: (_) async => true,
        validate: (_, _) async => true,
      );
      final kept = await queue.enqueue(fixtureDraft(), testGrant(identity));
      final pages =
          (await ws.db.rows('PRAGMA page_count')).single.values.single as int;
      await ws.db.customStatement('PRAGMA max_page_count=$pages');
      await expectLater(
        queue.enqueue(
          fixtureDraft(value: List.filled(1024 * 1024, 'X').join()),
          testGrant(identity),
        ),
        throwsA(anything),
      );
      expect(await queue.count(), 1);
      expect((await queue.get(kept.commandId))!.state, CommandState.pending);
      expect(
        (await ws.db.rows('SELECT device_seq FROM local_device'))
            .single['device_seq'],
        1,
      );
    },
  );

  test(
    'lease, retry, terminal receipt and stale-worker guards preserve intent',
    () async {
      final queue = ws.commands(
        verify: (_) async => true,
        validate: (_, _) async => true,
      );
      final draft = fixtureDraft();
      await queue.enqueue(draft, testGrant(identity));
      final at = DateTime.utc(2026, 10, 24);
      final leases = await Future.wait([
        queue.claim(now: at),
        queue.claim(now: at),
      ]);
      expect(leases.whereType<QueuedCommand>(), hasLength(1));
      final first = leases.whereType<QueuedCommand>().single;
      await queue.retry(
        first.commandId,
        first.leaseToken!,
        nextRetryAt: at.add(const Duration(minutes: 5)),
      );
      expect(await queue.claim(now: at), null);
      final second = (await queue.claim(
        now: at.add(const Duration(minutes: 6)),
      ))!;
      await expectLater(
        queue.retry(first.commandId, first.leaseToken!, nextRetryAt: at),
        throwsStateError,
      );
      final received = DateTime.utc(2026, 10, 24, 1);
      await queue.recordServerResult(
        second.commandId,
        second.leaseToken!,
        state: CommandState.confirmed,
        result: {'canonical': 'accepted'},
        serverReceivedAt: received,
        canonicalVersion: 8,
      );
      // Lost receipt replay is idempotent. Contradictory server results never overwrite history.
      await queue.recordServerResult(
        second.commandId,
        second.leaseToken!,
        state: CommandState.confirmed,
        result: {'canonical': 'accepted'},
        serverReceivedAt: received,
        canonicalVersion: 8,
      );
      await expectLater(
        queue.recordServerResult(
          second.commandId,
          second.leaseToken!,
          state: CommandState.rejected,
          result: {},
          serverReceivedAt: received,
        ),
        throwsStateError,
      );
      expect(await queue.claim(now: at.add(const Duration(days: 14))), null);
      expect((await queue.get(draft.commandId))!.view, QueueViewState.synced);
      expect(
        await ws.db.rows('SELECT * FROM sync_command_result'),
        hasLength(1),
      );
      expect(
        await ws.db.rows('SELECT * FROM provisional_projection'),
        hasLength(1),
      );
    },
  );

  test('conflict/rejection/actionRequired remain durable, visible and never auto-retry', () async {
    final queue = ws.commands(
      verify: (_) async => true,
      validate: (_, _) async => true,
    );
    for (final state in [
      CommandState.conflict,
      CommandState.rejected,
      CommandState.actionRequired,
    ]) {
      final command = await queue.enqueue(fixtureDraft(), testGrant(identity));
      final leased = (await queue.claim())!;
      await queue.recordServerResult(
        command.commandId,
        leased.leaseToken!,
        state: state,
        result: {'reason': 'fixture', 'localIntentPreserved': true},
        serverReceivedAt: DateTime.utc(2026, 10, 24),
      );
    }
    expect(await queue.claim(), null);
    expect(await queue.count(), 3);
    final counts = await queue.counts();
    expect(
      [counts.pending, counts.synced, counts.conflict, counts.failed],
      [0, 0, 1, 2],
    );
    expect(await ws.db.rows('SELECT * FROM sync_command_result'), hasLength(3));
  });
}
