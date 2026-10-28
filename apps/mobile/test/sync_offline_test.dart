import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/sync.dart';

import 'support.dart';
import 'sync_engine_test.dart' show FixtureAuthority;

void main() {
  test('14 days no WAN: preprovisioned intent survives restart and LAN renewal; expired O1 grant denies', () async {
    final root = await Directory.systemTemp.createTemp('sync-14days');
    final secrets = MemorySecrets();
    const identity = WorkspaceIdentity('tenant', 'user', '14days');
    final start = DateTime.utc(2026, 10, 1);
    var ws = await Workspace.open(identity, root: root, secrets: secrets);
    final authority = FixtureAuthority();
    final ids = <String>{};
    for (var day = 0; day < 14; day++) {
      final now = start.add(Duration(days: day));
      final issued = start.add(Duration(days: day < 7 ? 0 : 7));
      final grant = OfflineGrant(
        id: 'LAN-renewed-${day < 7 ? 0 : 7}',
        tenantId: identity.tenantId,
        userId: identity.userId,
        scopeVersion: 1,
        issuedAt: issued,
        expiresAt: issued.add(const Duration(days: 7)),
        allowedCommands: {'RecordFixture'},
        allowedOwners: {'Fixture:entity'},
        risk: 'O1',
        signedEnvelope: 'fixture-authority-policy',
      );
      final queue = ws.commands(
        verify: (_) async => true,
        validate: (_, _) async => true,
      );
      for (var event = 0; event < 20; event++) {
        final draft = fixtureDraft(value: 'day-$day-event-$event');
        ids.add(draft.commandId);
        await queue.enqueue(draft, grant, now: now);
      }
      await ws.close();
      ws = await Workspace.open(identity, root: root, secrets: secrets);
      expect(
        await ws.commands(verify: (_) async => false).count(),
        (day + 1) * 20,
      );
    }
    // Device-only 7 days, then local LAN policy renewal; external WAN absent all
    // fourteen days. Test verifier is explicit; production uses pinned Ed25519.
    final expired = OfflineGrant(
      id: 'expired',
      tenantId: identity.tenantId,
      userId: identity.userId,
      scopeVersion: 1,
      issuedAt: start,
      expiresAt: start.add(const Duration(days: 7)),
      allowedCommands: {'RecordFixture'},
      allowedOwners: {'Fixture:entity'},
      risk: 'O1',
      signedEnvelope: 'fixture',
    );
    final queue = ws.commands(
      verify: (_) async => true,
      validate: (_, _) async => true,
    );
    await expectLater(
      queue.enqueue(
        fixtureDraft(),
        expired,
        now: start.add(const Duration(days: 14)),
      ),
      throwsStateError,
    );
    final engine = SyncEngine(
      ws,
      queue,
      authority,
      clock: () => start.add(const Duration(days: 14)),
    );
    await engine.run(maxBatches: 10);
    expect(authority.effects, 280);
    expect(authority.receipts.keys.toSet(), ids);
    expect((await queue.counts()).pending, 0);
    await ws.close();
    await root.delete(recursive: true);
  });
  test('14-day capacity: 50k queued intents / 100k operational rows / 20k entities recover and converge', () async {
    final root = await Directory.systemTemp.createTemp('sync-50k');
    final secrets = MemorySecrets();
    const identity = WorkspaceIdentity('tenant', 'user', 'capacity');
    var ws = await Workspace.open(identity, root: root, secrets: secrets);
    final queue = ws.commands(
      verify: (_) async => true,
      validate: (_, _) async => true,
    );
    await queue.enqueue(
      fixtureDraft(),
      testGrant(identity),
      now: DateTime.utc(2026, 10, 1),
    );
    await ws.db.write(() async {
      await ws.db.customStatement(
        "WITH RECURSIVE n(v) AS (SELECT 2 UNION ALL SELECT v+1 FROM n WHERE v<50000) INSERT INTO sync_outbox(local_command_id,idempotency_key,device_seq,aggregate_type,aggregate_id,expected_version,command_type,command_version,observed_at,created_at,payload_json,provenance_json,fingerprint,auth_snapshot_id,status) SELECT '019a0000-0000-7000-8000-'||printf('%012x',v),'019a0000-0000-7000-8000-'||printf('%012x',v),v,'Fixture','entity',7,'RecordFixture',1,'2026-10-01T00:00:00Z','2026-10-01T00:00:00Z','{}','{}','capacity-'||v,'signed-fixture','pending' FROM n",
      );
      await ws.db.customStatement(
        "INSERT INTO local_audit(command_id,event,at) SELECT local_command_id,'PROVISIONAL_CREATED',created_at FROM sync_outbox WHERE device_seq>1",
      );
      await ws.db.customStatement(
        "INSERT INTO entity_cache SELECT 'Fixture',aggregate_id||device_seq,'{}',7 FROM sync_outbox WHERE device_seq<=20000",
      );
      await ws.db.customStatement('UPDATE local_device SET device_seq=50000');
    });
    await ws.close();
    ws = await Workspace.open(identity, root: root, secrets: secrets);
    final recovered = ws.commands(verify: (_) async => false);
    expect(await recovered.count(), 50000);
    expect(
      (await ws.db.rows('SELECT count(*) n FROM entity_cache')).single['n'],
      20000,
    );
    // Preserve pre-provisioned cache: this represents the existing bootstrap.
    await ws.db.customStatement(
      "INSERT INTO sync_cursor VALUES('main','cursor-0',0,1)",
    );
    final authority = FixtureAuthority();
    final elapsed = Stopwatch()..start();
    final engine = SyncEngine(
      ws,
      recovered,
      authority,
      clock: () => DateTime.utc(2026, 10, 15),
    );
    await engine.run(maxBatches: 1001);
    elapsed.stop();
    expect(authority.effects, 50000);
    expect((await recovered.counts()).pending, 0);
    expect(await recovered.count(), 50000);
    expect(
      elapsed.elapsed.inMilliseconds,
      lessThan(1800000),
      reason: 'NFR-SYNC-004 <=30min lightweight LAN engineering fixture',
    );
    // ignore: avoid_print
    print(
      'WP49-020 14-day/50k convergence: ${elapsed.elapsedMilliseconds}ms; 100k operational rows; 20k cached entities; zero lost IDs',
    );
    await ws.close();
    await root.delete(recursive: true);
  }, timeout: const Timeout(Duration(minutes: 30)));
}
