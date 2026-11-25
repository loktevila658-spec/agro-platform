import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/features/scouting/scouting_repository.dart';

import 'scouting_repository_test.dart' as f;
import 'support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('encrypted restart and response-loss retry preserve exact observation and device sequence', () async {
    final root = await Directory.systemTemp.createTemp('scouting-restart-'),
        secrets = MemorySecrets();
    var w = await Workspace.open(f.identity, root: root, secrets: secrets);
    try {
      await f.seed(w);
      var r = ScoutingRepository(w, verify: (_) async => true);
      final id = await r.capture(f.fixture()), first = (await r.queue.claim())!;
      await r.queue.retry(
        id,
        first.leaseToken!,
        nextRetryAt: DateTime.utc(2020),
      );
      await w.close();
      w = await Workspace.open(f.identity, root: root, secrets: secrets);
      r = ScoutingRepository(w, verify: (_) async => true);
      final retry = (await r.queue.claim())!;
      expect(retry.commandId, id);
      expect(retry.deviceSeq, first.deviceSeq);
      expect(retry.data['payload_json'], first.data['payload_json']);
      await r.queue.recordServerResult(
        id,
        retry.leaseToken!,
        state: CommandState.confirmed,
        result: {
          'status': 'ACCEPTED',
          'canonical': {'id': id},
        },
        serverReceivedAt: DateTime.utc(2026, 11, 25),
        canonicalVersion: 1,
      );
      expect((await r.intents()).single.status, 'confirmed');
      expect(await r.queue.claim(), isNull);
    } finally {
      await w.close();
      await root.delete(recursive: true);
    }
  });
  test('optional encrypted photo is separate; conflict/rejection retain observation intent', () async {
    final root = await Directory.systemTemp.createTemp('scouting-media-'),
        w = await Workspace.open(
          f.identity,
          root: root,
          secrets: MemorySecrets(),
        );
    try {
      await f.seed(w);
      final photo = File('${root.path}/fixture.jpg');
      await photo.writeAsBytes([0xff, 0xd8, 0xff, 1, 2, 3]);
      final aid = await w.attachments.stage(
            photo,
            ownerRef: 'ScoutingCapture:${f.field}',
            evidenceType: 'PHOTO',
            mime: 'image/jpeg',
            requiredEvidence: false,
          ),
          r = ScoutingRepository(w, verify: (_) async => true),
          id = await r.capture(f.fixture(), attachmentIds: [aid]),
          claim = (await r.queue.claim())!;
      expect(claim.commandId, id);
      expect((await w.attachments.get(aid))!['required_evidence'], 0);
      await r.queue.recordServerResult(
        id,
        claim.leaseToken!,
        state: CommandState.conflict,
        result: {'code': 'VERSION_CONFLICT'},
        serverReceivedAt: DateTime.utc(2026, 11, 25),
      );
      expect((await r.intents()).single.attention, true);
      expect((await r.intents()).single.data['note'], f.fixture().note);
      expect(await r.queue.claim(), isNull);
      await w.db.customStatement(
        "DELETE FROM entity_cache WHERE entity_type='ScoutingCapture'",
      );
      expect(await r.intents(), isEmpty);
    } finally {
      await w.close();
      await root.delete(recursive: true);
    }
  });
}
