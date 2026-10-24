import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:agroplatform_mobile/persistence.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'Android native cipher + OS keystore survive reopen and shared wipe',
    (tester) async {
      const identity = WorkspaceIdentity(
        'android-fixture-tenant',
        'android-fixture-user',
        'integration',
      );
      var workspace = await Workspace.open(identity);
      final draft = CommandDraft.create(
        aggregateType: 'Fixture',
        aggregateId: 'entity',
        commandType: 'RecordFixture',
        expectedVersion: 2,
        observedAt: DateTime.utc(2026, 10, 1),
        payload: {'source': 'android-offline'},
      );
      final grant = OfflineGrant(
        id: 'integration-grant',
        tenantId: identity.tenantId,
        userId: identity.userId,
        scopeVersion: 1,
        issuedAt: DateTime.utc(2020),
        expiresAt: DateTime.utc(2100),
        allowedCommands: {'RecordFixture'},
        allowedOwners: {'Fixture:entity'},
        risk: 'O1',
        signedEnvelope: 'verified-test-fixture',
      );
      // The fixture verifier is not part of production bootstrap authorization.
      final queue = workspace.commands(
        verify: (_) async => true,
        validate: (_, _) async => true,
      );
      await queue.enqueue(draft, grant);
      final source = await File('${workspace.directory.path}/fixture.pdf')
          .writeAsBytes([37, 80, 68, 70, 45, 49]);
      final id = await workspace.attachments.stage(
        source,
        ownerRef: 'Fixture:entity',
        evidenceType: 'fixture',
        mime: 'application/pdf',
      );
      await source.delete();
      final before = workspace.directory.path;
      await workspace.close();
      workspace = await Workspace.open(identity);
      expect(workspace.directory.path, before);
      expect(
        (await workspace
                .commands(verify: (_) async => false)
                .get(draft.commandId))!
            .state,
        CommandState.pending,
      );
      expect(await workspace.attachments.readPart(id, 1, isWifi: true), [
        37,
        80,
        68,
        70,
        45,
        49,
      ]);
      final samples = <int>[];
      for (var i = 0; i < 100; i++) {
        final timer = Stopwatch()..start();
        await workspace
            .commands(verify: (_) async => true, validate: (_, _) async => true)
            .enqueue(
              CommandDraft.create(
                aggregateType: 'Fixture',
                aggregateId: 'entity',
                commandType: 'RecordFixture',
                expectedVersion: 2,
                observedAt: DateTime.utc(2026, 10, 1),
                payload: {'sample': i},
              ),
              grant,
            );
        samples.add(timer.elapsedMilliseconds);
      }
      samples.sort();
      // DOC20 NFR-MOB-003: measured on the Android CI emulator (not a certified
      // physical device); release hardware benchmarking remains a release gate.
      expect(samples[94], lessThanOrEqualTo(250));
      // ignore: avoid_print
      print('NFR-MOB-003 Android emulator local enqueue p95=${samples[94]}ms');
      final timer = Stopwatch()..start();
      await workspace.wipeShared();
      expect(timer.elapsedMilliseconds, lessThan(30000));
      expect(await Directory(before).exists(), false);
    },
  );
}
