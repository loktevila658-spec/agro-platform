import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/sync.dart';
import 'package:agroplatform_mobile/features/qr/qr_payload.dart';
import 'package:agroplatform_mobile/features/qr/qr_repository.dart';

import 'support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('unresolved survives restart; authorized retry, scope reset and denial clear cached projection', () async {
    final root = await Directory.systemTemp.createTemp('qr-repository');
    final secrets = MemorySecrets();
    const identity = WorkspaceIdentity('qr-tenant', 'qr-user', 'qr-workspace');
    const id = '019a7430-0000-7000-8000-000000000001';
    var workspace = await Workspace.open(
      identity,
      root: root,
      secrets: secrets,
    );
    var online = false, denied = false, requests = 0;
    Future<Map<String, Object?>> request(
      String path,
      Map<String, Object?> body,
      Map<String, String> headers,
    ) async {
      requests++;
      if (denied) throw const SyncFailure('HTTP_403', status: 403);
      if (!online) throw const SyncFailure('TRANSPORT_UNAVAILABLE');
      return {
        'version': 1,
        'entityType': 'Material',
        'entityId': id,
        'status': 'RESOLVED',
        'active': true,
        'name': 'Fixture material',
        'code': 'M1',
      };
    }

    var repository = QrRepository(workspace, request);
    final payload = repository.encodeLocal(id);
    expect((await repository.resolve(payload)).status, 'PENDING');
    expect(
      await workspace.db.rows('SELECT * FROM qr_unresolved'),
      hasLength(1),
    );
    repository.close();
    await workspace.close();
    workspace = await Workspace.open(identity, root: root, secrets: secrets);
    repository = QrRepository(workspace, request);
    try {
      online = true;
      await repository.retry();
      expect(await workspace.db.rows('SELECT * FROM qr_unresolved'), isEmpty);
      final count = requests;
      expect((await repository.resolve(payload)).cached, isTrue);
      expect(requests, count);
      final other = await Workspace.open(
        const WorkspaceIdentity('other', 'qr-user', 'qr-workspace'),
        root: root,
        secrets: secrets,
      );
      expect(await other.db.rows('SELECT * FROM qr_cache'), isEmpty);
      await other.close();
      await PullStore(workspace.db).bootstrap(
        const SyncBootstrapResponse(
          authorityMode: 'LOCAL_PRIMARY',
          schemaVersion: 1,
          scopeVersion: 2,
          initialCursor: 'reset',
          grants: [],
        ),
      );
      expect(await workspace.db.rows('SELECT * FROM qr_cache'), isEmpty);
      denied = true;
      expect(
        (await repository.resolve(payload, refresh: true)).status,
        'DENIED',
      );
      expect(await workspace.db.rows('SELECT * FROM qr_cache'), isEmpty);
      expect(
        (await workspace.db.rows('SELECT state FROM qr_unresolved'))
            .single['state'],
        'DENIED',
      );
      await expectLater(
        repository.resolve('https://unsafe.invalid'),
        throwsFormatException,
      );
      expect(QrIdentity.decode(payload).entityId, id);
      await workspace.db.customStatement(
        "INSERT INTO entity_cache VALUES('Material',?,?,1)",
        [id, '{"active":true,"name":"Old synced","code":"OLD"}'],
      );
      expect(
        (await repository.resolve(payload)).status,
        'DENIED',
        reason: 'known denial must not fall back to stale sync data',
      );
      var available = false;
      final arriving = QrRepository(
        workspace,
        (path, body, headers) async => available
            ? {
                'version': 1,
                'entityType': 'Material',
                'entityId': id,
                'status': 'RESOLVED',
                'active': true,
                'name': 'Arrived',
                'code': 'NEW',
              }
            : {
                'version': 1,
                'entityType': 'Material',
                'entityId': id,
                'status': 'UNAVAILABLE',
              },
      );
      expect(
        (await arriving.resolve(payload, refresh: true)).status,
        'UNAVAILABLE',
      );
      expect(
        (await arriving.resolve(payload)).status,
        'UNAVAILABLE',
        reason: 'known unavailable cannot display old sync projection',
      );
      available = true;
      await arriving.retry();
      expect((await arriving.resolve(payload)).name, 'Arrived');
      arriving.close();
      final gate = Completer<void>(), entered = Completer<void>();
      final racing = QrRepository(workspace, (path, body, headers) async {
        entered.complete();
        await gate.future;
        return {
          'version': 1,
          'entityType': 'Material',
          'entityId': id,
          'status': 'RESOLVED',
          'active': true,
          'name': 'Stale',
          'code': 'STALE',
        };
      });
      final pending = racing.resolve(payload, refresh: true);
      await entered.future;
      await PullStore(workspace.db).bootstrap(
        const SyncBootstrapResponse(
          authorityMode: 'LOCAL_PRIMARY',
          schemaVersion: 1,
          scopeVersion: 3,
          initialCursor: 'reset3',
          grants: [],
        ),
      );
      gate.complete();
      await expectLater(pending, throwsStateError);
      expect(await workspace.db.rows('SELECT * FROM qr_cache'), isEmpty);
      racing.close();
      final keys = <String>[];
      final issuance = QrRepository(workspace, (path, body, headers) async {
        keys.add(headers['Idempotency-Key']!);
        return {'version': 1, 'payload': payload};
      });
      await issuance.create(id);
      await issuance.create(id);
      expect(keys.toSet(), hasLength(1));
      issuance.close();
    } finally {
      repository.close();
      await workspace.close();
      await root.delete(recursive: true);
    }
  });
}
