import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/generated/contracts.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/features/scouting/scouting_commands.dart';
import 'package:agroplatform_mobile/features/scouting/scouting_repository.dart';

import 'support.dart';

const field = '019a0000-0000-7000-8000-000000000034',
    org = '019a0000-0000-7000-8000-000000000035';
const identity = WorkspaceIdentity(
  'scouting-tenant',
  'scouting-user',
  'scouting-workspace',
);
const captureContext = ScoutingContext(
  fieldId: field,
  fieldRevisionId: org,
  fieldSeasonId: field,
  organizationId: org,
  revisionId: org,
  seasonId: org,
  seasonRevisionId: org,
);
ScoutingObservationData fixture({String note = 'Сухая почва'}) =>
    ScoutingObservationData(
      organizationId: org,
      fieldSeasonId: field,
      observationType: 'SOIL',
      note: note,
      anomaly: true,
      sourceType: 'USER_MOBILE',
    );
OfflineGrant grant() => OfflineGrant(
  id: 'scouting-fixture-grant',
  tenantId: identity.tenantId,
  userId: identity.userId,
  scopeVersion: 1,
  issuedAt: DateTime.utc(2020),
  expiresAt: DateTime.utc(2100),
  allowedCommands: {'Scouting.Capture'},
  allowedOwners: {'ScoutingCapture:$field'},
  risk: 'O1',
  signedEnvelope: 'test-only-signature',
);
Future<void> seed(Workspace w) async {
  await w.db.customStatement('INSERT INTO entity_cache VALUES(?,?,?,?)', [
    'ScoutingCapture',
    field,
    jsonEncode(captureContext.toJson()),
    0,
  ]);
  final g = grant();
  await w.db.customStatement('INSERT INTO permission_snapshot VALUES(?,?)', [
    g.id,
    g.json,
  ]);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('manual observation validates and queues without hardware; revoked grants deny', () async {
    expect(() => scoutingDraft(fixture(note: '')), throwsStateError);
    final root = await Directory.systemTemp.createTemp('scouting-repo-'),
        w = await Workspace.open(
          identity,
          root: root,
          secrets: MemorySecrets(),
        );
    try {
      await seed(w);
      final r = ScoutingRepository(w, verify: (_) async => true),
          id = await r.capture(fixture());
      expect((await r.queue.get(id))!.expectedVersion, 0);
      expect((await r.intents()).single.data['location'], isNull);
      expect((await r.intents()).single.status, 'pending');
      expect(
        (await w.db.rows(
          "SELECT * FROM entity_cache WHERE entity_type='Observation'",
        )).isEmpty,
        true,
      );
      final denied = ScoutingRepository(w, verify: (_) async => false);
      await expectLater(denied.capture(fixture()), throwsStateError);
    } finally {
      await w.close();
      await root.delete(recursive: true);
    }
  });
  test(
    'context refresh validates all references before replacing cached scope',
    () async {
      final root = await Directory.systemTemp.createTemp('scouting-context-'),
          w = await Workspace.open(
            identity,
            root: root,
            secrets: MemorySecrets(),
          );
      try {
        await seed(w);
        final r = ScoutingRepository(
          w,
          verify: (_) async => true,
          loadContexts: () async => [],
        );
        await r.refreshContexts();
        expect(await r.contexts(), isEmpty);
        await expectLater(r.capture(fixture()), throwsStateError);
      } finally {
        await w.close();
        await root.delete(recursive: true);
      }
    },
  );
}
