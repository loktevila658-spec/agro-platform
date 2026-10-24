import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';

import 'support.dart';

void main() {
  test('50k pending commands, 100k operational rows and 20k provisional entities survive reopen', () async {
    final root = await Directory.systemTemp.createTemp('mobile-capacity');
    final secrets = MemorySecrets();
    const identity = WorkspaceIdentity('capacity-tenant', 'user', 'workspace');
    var ws = await Workspace.open(identity, root: root, secrets: secrets);
    await ws
        .commands(verify: (_) async => true, validate: (_, _) async => true)
        .enqueue(fixtureDraft(), testGrant(identity));
    await ws.db.write(() async {
      await ws.db.customStatement(
        '''WITH RECURSIVE numbers(n) AS (SELECT 2 UNION ALL SELECT n+1 FROM numbers WHERE n<50000)
        INSERT INTO sync_outbox(local_command_id,idempotency_key,device_seq,aggregate_type,aggregate_id,expected_version,
        command_type,command_version,observed_at,created_at,payload_json,provenance_json,fingerprint,auth_snapshot_id,status)
        SELECT 'capacity-'||n,'capacity-'||n,n,'Fixture','entity-'||n,7,'RecordFixture',1,
        '2026-10-01T00:00:00Z','2026-10-01T00:00:00Z','{}','{}','fixture-'||n,'signed-fixture','pending' FROM numbers''',
      );
      await ws.db.customStatement(
        "INSERT INTO local_audit(command_id,event,at) SELECT local_command_id,'PROVISIONAL_CREATED',created_at FROM sync_outbox WHERE device_seq>1",
      );
      await ws.db.customStatement(
        "INSERT INTO provisional_projection(command_id,owner_ref,projection_json) SELECT local_command_id,'Fixture:'||aggregate_id,'{}' FROM sync_outbox WHERE device_seq BETWEEN 2 AND 20000",
      );
      await ws.db.customStatement('UPDATE local_device SET device_seq=50000');
    });
    await ws.close();
    ws = await Workspace.open(identity, root: root, secrets: secrets);
    expect(await ws.commands(verify: (_) async => false).count(), 50000);
    expect(
      (await ws.db.rows('SELECT count(*) AS n FROM local_audit')).single['n'],
      50000,
    );
    expect(
      (await ws.db.rows('SELECT count(*) AS n FROM provisional_projection'))
          .single['n'],
      20000,
    );
    final plan = await ws.db.rows(
      "EXPLAIN QUERY PLAN SELECT * FROM sync_outbox WHERE status='pending' AND next_retry_at<=0 ORDER BY device_seq LIMIT 1",
    );
    expect(plan.toString(), contains('outbox_ready'));
    expect((await ws.db.rows('PRAGMA quick_check')).single.values.single, 'ok');
    await ws.close();
    await root.delete(recursive: true);
  }, timeout: const Timeout(Duration(minutes: 2)));
}
