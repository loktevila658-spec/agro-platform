import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/generated/contracts.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/features/agronomy/actual_operation_commands.dart';
import 'package:agroplatform_mobile/features/agronomy/actual_operation_repository.dart';

import 'support.dart';

const actualField = '019a0000-0000-7000-8000-000000000033',
    actualOrg = '019a0000-0000-7000-8000-000000000034';
const actualIdentity = WorkspaceIdentity(
  'actual-tenant',
  'actual-user',
  'actual-workspace',
);
const actualContext = ActualCaptureContext(
  fieldSeasonId: actualField,
  organizationId: actualOrg,
  revisionId: actualOrg,
);
ActualCapture actualFixture({String quantity = '1.25'}) => ActualCapture(
  organizationId: actualOrg,
  fieldSeasonId: actualField,
  operationTypeId: actualOrg,
  startedAt: '2026-11-18T00:00:00Z',
  completedAt: '2026-11-18T01:00:00Z',
  actualQuantity: quantity,
  unit: 'fixture',
  executors: [actualOrg],
  materials: [
    const ActualMaterial(materialId: actualOrg, quantity: '1', unit: 'fixture'),
  ],
  labor: [
    const ActualLabor(employeeId: actualOrg, quantity: '2.5', unit: 'fixture'),
  ],
  sourceType: 'USER_MOBILE',
);
OfflineGrant actualGrant({
  DateTime? expiresAt,
  String? tenantId,
  int scopeVersion = 1,
}) => OfflineGrant(
  id: 'actual-fixture-grant',
  tenantId: tenantId ?? actualIdentity.tenantId,
  userId: actualIdentity.userId,
  scopeVersion: scopeVersion,
  issuedAt: DateTime.utc(2020),
  expiresAt: expiresAt ?? DateTime.utc(2100),
  allowedCommands: {'ActualOperation.Capture'},
  allowedOwners: {'AgronomyCapture:$actualField'},
  risk: 'O1',
  signedEnvelope: 'test-only-signature',
);
Future<void> seedActual(Workspace w, {OfflineGrant? grant}) async {
  await w.db.customStatement('INSERT INTO entity_cache VALUES(?,?,?,?)', [
    'AgronomyCapture',
    actualField,
    jsonEncode(actualContext.toJson()),
    0,
  ]);
  final g = grant ?? actualGrant();
  await w.db.customStatement('INSERT INTO permission_snapshot VALUES(?,?)', [
    g.id,
    g.json,
  ]);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('typed actual capture validates before durable queue and never writes canonical facts', () async {
    expect(
      () => actualCaptureDraft(actualFixture(quantity: '-1')),
      throwsStateError,
    );
    expect(
      () => actualCaptureDraft(actualFixture(quantity: '1.1234567')),
      throwsStateError,
    );
    final root = await Directory.systemTemp.createTemp('actual-repository-'),
        w = await Workspace.open(
          actualIdentity,
          root: root,
          secrets: MemorySecrets(),
        );
    try {
      await seedActual(w);
      final r = ActualOperationRepository(w, verify: (_) async => true),
          id = await r.capture(actualFixture());
      final q = (await r.queue.get(id))!;
      expect(q.data['aggregate_id'], actualField);
      expect(q.expectedVersion, 0);
      expect((await r.intents()).single.status, 'pending');
      expect(
        (await w.db.rows(
          "SELECT * FROM entity_cache WHERE entity_type='ActualOperation'",
        )).isEmpty,
        true,
      );
      await expectLater(
        ActualOperationRepository(
          w,
          verify: (_) async => false,
        ).capture(actualFixture()),
        throwsStateError,
      );
    } finally {
      await w.close();
      await root.delete(recursive: true);
    }
  });
  test(
    'expired cross-tenant and stale-scope grants deny without queue effects',
    () async {
      for (final g in [
        actualGrant(expiresAt: DateTime.utc(2020)),
        actualGrant(tenantId: 'other'),
        actualGrant(scopeVersion: 2),
      ]) {
        final root = await Directory.systemTemp.createTemp('actual-denied-'),
            w = await Workspace.open(
              actualIdentity,
              root: root,
              secrets: MemorySecrets(),
            );
        try {
          await seedActual(w, grant: g);
          final r = ActualOperationRepository(w, verify: (_) async => true);
          await expectLater(r.capture(actualFixture()), throwsStateError);
          expect(await r.queue.count(), 0);
        } finally {
          await w.close();
          await root.delete(recursive: true);
        }
      }
    },
  );
  test(
    'context refresh revokes derived context without changing unrelated cache',
    () async {
      final root = await Directory.systemTemp.createTemp('actual-context-'),
          w = await Workspace.open(
            actualIdentity,
            root: root,
            secrets: MemorySecrets(),
          );
      try {
        await seedActual(w);
        await w.db.customStatement('INSERT INTO entity_cache VALUES(?,?,?,?)', [
          'Fixture',
          'one',
          '{}',
          1,
        ]);
        final r = ActualOperationRepository(
          w,
          verify: (_) async => true,
          loadContexts: () async => [],
        );
        await r.refreshContexts();
        expect(await r.contexts(), isEmpty);
        expect(
          (await w.db.rows(
            "SELECT * FROM entity_cache WHERE entity_type='Fixture'",
          )).length,
          1,
        );
        await expectLater(r.capture(actualFixture()), throwsStateError);
      } finally {
        await w.close();
        await root.delete(recursive: true);
      }
    },
  );
}
