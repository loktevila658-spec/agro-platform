import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/sync.dart';

import 'support.dart';

class FixtureAuthority implements SyncTransport {
  final receipts = <String, SyncResult>{};
  final fingerprints = <String, String>{};
  final received = <SyncCommand>[];
  final acked = <String>[];
  bool loseResponse = false,
      partial = false,
      deny = false,
      conflict = false,
      reset = false;
  int bootstrapCount = 0, effects = 0;
  @override
  Future<SyncRegisterResponse> register(SyncRegisterRequest r) async =>
      SyncRegisterResponse(
        deviceId: r.deviceId,
        authorityMode: 'LOCAL_PRIMARY',
        schemaVersion: 1,
        scopeVersion: 1,
      );
  @override
  Future<SyncBootstrapResponse> bootstrap(SyncBootstrapRequest r) async {
    bootstrapCount++;
    return const SyncBootstrapResponse(
      authorityMode: 'LOCAL_PRIMARY',
      schemaVersion: 1,
      scopeVersion: 1,
      initialCursor: 'cursor-0',
      grants: [],
    );
  }

  @override
  Future<SyncPushResponse> push(SyncPushRequest request) async {
    expect(request.commands.length, lessThanOrEqualTo(50));
    expect(
      utf8.encode(jsonEncode(request.toJson())).length,
      lessThanOrEqualTo(1048576),
    );
    final results = <SyncResult>[];
    for (final c in request.commands) {
      received.add(c);
      if (received.length % 5000 == 0) {
        // ignore: avoid_print
        print('sync fixture received ${received.length} commands');
      }
      final fingerprint = canonicalJson(jsonDecode(jsonEncode(c.toJson())));
      if (fingerprints.containsKey(c.localCommandId)) {
        expect(fingerprint, fingerprints[c.localCommandId]);
      }
      fingerprints[c.localCommandId] = fingerprint;
      if (!receipts.containsKey(c.localCommandId)) {
        if (!deny && !conflict) effects++;
        receipts[c.localCommandId] = SyncResult(
          localCommandId: c.localCommandId,
          status: deny
              ? 'REJECTED'
              : conflict
              ? 'CONFLICT'
              : 'ACCEPTED',
          code: deny
              ? 'PERMISSION_CHANGED_OFFLINE'
              : conflict
              ? 'VERSION_CONFLICT'
              : null,
          canonical: conflict ? {'version': 8} : {'version': c.baseVersion},
          aggregateVersion: 8,
          receivedAt: '2026-10-24T01:00:00Z',
          localIntent: conflict ? c : null,
        );
      }
      results.add(receipts[c.localCommandId]!);
      if (partial) {
        partial = false;
        break;
      }
    }
    if (loseResponse) {
      loseResponse = false;
      throw const SyncFailure('TRANSPORT_UNAVAILABLE');
    }
    return SyncPushResponse(
      results: results,
      serverTime: '2026-10-24T01:00:00Z',
    );
  }

  @override
  Future<SyncPullResponse> pull(SyncPullRequest request) async {
    if (reset) {
      reset = false;
      return SyncPullResponse(
        changes: [],
        nextCursor: request.cursor,
        hasMore: false,
        resetRequired: true,
        code: 'CURSOR_EXPIRED',
      );
    }
    return SyncPullResponse(
      changes: [],
      nextCursor: request.cursor,
      hasMore: false,
      resetRequired: false,
    );
  }

  @override
  Future<void> ack(SyncAckRequest r) async {
    acked.add(r.cursor);
  }
}

void main() {
  late Directory root;
  late Workspace ws;
  late CommandQueue queue;
  late MemorySecrets secrets;
  const identity = WorkspaceIdentity('tenant', 'user', 'workspace');
  setUp(() async {
    root = await Directory.systemTemp.createTemp('sync-test');
    secrets = MemorySecrets();
    ws = await Workspace.open(identity, root: root, secrets: secrets);
    queue = ws.commands(
      verify: (_) async => true,
      validate: (_, _) async => true,
    );
  });
  tearDown(() async {
    await ws.close();
    await root.delete(recursive: true);
  });
  test('real HTTP generated DTO serialization, Retry-After and redirect refusal preserve authority', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final uri = Uri.parse('http://127.0.0.1:${server.port}');
    final transport = AuthorityHttpTransport(
      authority: uri,
      accessToken: () async => 'fixture-session',
    );
    var mode = 200;
    final subscription = server.listen((request) async {
      final body = await utf8.decoder.bind(request).join();
      expect(request.headers.value('authorization'), 'Bearer fixture-session');
      request.response.statusCode = mode;
      if (mode == 302) {
        request.response.headers.set(
          'location',
          'https://cloud.invalid/v1/sync/push',
        );
      } else if (mode == 429) {
        request.response.headers.set('retry-after', '45');
        request.response.write('{}');
      } else {
        final payload = jsonDecode(body) as Map<String, dynamic>;
        expect(payload['commands'], hasLength(1));
        expect(payload['commands'][0]['payload'], {
          'nested': {
            'values': [1, 2],
          },
        });
        request.response.headers.contentType = ContentType.json;
        request.response.write(
          jsonEncode({'results': [], 'serverTime': '2026-10-01T00:00:00Z'}),
        );
      }
      await request.response.close();
    });
    const request = SyncPushRequest(
      deviceId: 'fixture',
      scopeVersion: 1,
      schemaVersion: 1,
      commands: [
        SyncCommand(
          localCommandId: 'stable',
          idempotencyKey: 'stable',
          deviceSeq: 1,
          aggregate: SyncAggregate(type: 'Fixture', id: 'one'),
          baseVersion: 7,
          type: 'RecordFixture',
          commandVersion: 1,
          observedAt: '2026-10-01T00:00:00Z',
          offlineAuthId: 'signed',
          payload: {
            'nested': {
              'values': [1, 2],
            },
          },
          provenance: {'source': 'original'},
          attachments: [],
        ),
      ],
    );
    try {
      await transport.push(request);
      mode = 429;
      await expectLater(
        transport.push(request),
        throwsA(
          isA<SyncFailure>().having(
            (e) => e.retryAfter,
            'retry-after',
            const Duration(seconds: 45),
          ),
        ),
      );
      mode = 302;
      await expectLater(
        transport.push(request),
        throwsA(isA<SyncFailure>().having((e) => e.status, 'redirect', 302)),
      );
    } finally {
      transport.close();
      await subscription.cancel();
      await server.close(force: true);
    }
  });
  test('lost response, restart and duplicate retry retain IDs/version/provenance exactly once', () async {
    final authority = FixtureAuthority()..loseResponse = true;
    final draft = fixtureDraft();
    await queue.enqueue(draft, testGrant(identity));
    final engine = SyncEngine(ws, queue, authority, jitter: () => 0.5);
    await engine.run();
    expect((await queue.get(draft.commandId))!.state, CommandState.retryWait);
    expect(authority.effects, 1);
    await ws.close();
    ws = await Workspace.open(identity, root: root, secrets: secrets);
    queue = ws.commands(verify: (_) async => true);
    await SyncEngine(ws, queue, authority).run(connectivityRestored: true);
    expect(authority.effects, 1);
    expect((await queue.get(draft.commandId))!.state, CommandState.confirmed);
    expect(authority.received.map((c) => c.localCommandId).toSet(), {
      draft.commandId,
    });
    expect(
      authority.received.every(
        (c) => c.baseVersion == 7 && c.idempotencyKey == draft.commandId,
      ),
      true,
    );
  });
  test('partial batch confirms only received results, preserves remainder, then reconnects', () async {
    final authority = FixtureAuthority()..partial = true;
    final a = await queue.enqueue(fixtureDraft(), testGrant(identity));
    final b = await queue.enqueue(fixtureDraft(), testGrant(identity));
    final engine = SyncEngine(ws, queue, authority);
    await engine.run();
    expect((await queue.get(a.commandId))!.state, CommandState.confirmed);
    expect((await queue.get(b.commandId))!.state, CommandState.retryWait);
    await engine.run(connectivityRestored: true);
    expect(authority.effects, 2);
    expect((await queue.get(b.commandId))!.state, CommandState.confirmed);
  });
  test('conflict and permission revoke retain original evidence and terminal receipts', () async {
    final authority = FixtureAuthority()..conflict = true;
    final a = await queue.enqueue(fixtureDraft(), testGrant(identity));
    await SyncEngine(ws, queue, authority).run();
    expect((await queue.get(a.commandId))!.state, CommandState.conflict);
    authority.conflict = false;
    authority.deny = true;
    final b = await queue.enqueue(fixtureDraft(), testGrant(identity));
    await SyncEngine(ws, queue, authority).run();
    expect((await queue.get(b.commandId))!.state, CommandState.rejected);
    expect(authority.effects, 0);
    expect(await queue.count(), 2);
    expect(await ws.db.rows('SELECT * FROM sync_command_result'), hasLength(2));
  });
  test('pull failure rolls back page and cursor; retry, purge and reset preserve pending', () async {
    final store = PullStore(ws.db);
    final authority = FixtureAuthority();
    await store.bootstrap(
      await authority.bootstrap(
        const SyncBootstrapRequest(deviceId: 'fixture', schemaVersion: 1),
      ),
    );
    final draft = fixtureDraft();
    await queue.enqueue(draft, testGrant(identity));
    const change = SyncChange(
      seq: '1',
      entityType: 'Fixture',
      entityId: 'one',
      entityVersion: 8,
      op: 'UPSERT',
      projection: {'value': 'canonical'},
    );
    const page = SyncPullResponse(
      changes: [change],
      nextCursor: 'cursor-1',
      hasMore: false,
      resetRequired: false,
    );
    await expectLater(
      store.apply(
        'cursor-0',
        page,
        beforeCommit: () async => throw StateError('crash'),
      ),
      throwsStateError,
    );
    expect(await store.cursor(), 'cursor-0');
    expect(await ws.db.rows('SELECT * FROM entity_cache'), isEmpty);
    await store.apply('cursor-0', page);
    await ws.close();
    ws = await Workspace.open(identity, root: root, secrets: secrets);
    final reopened = PullStore(ws.db);
    expect(await reopened.cursor(), 'cursor-1');
    await expectLater(reopened.apply('cursor-0', page), throwsStateError);
    await reopened.apply(
      'cursor-1',
      const SyncPullResponse(
        changes: [
          SyncChange(
            seq: '2',
            entityType: 'Fixture',
            entityId: 'one',
            op: 'PURGE',
            projection: {},
          ),
        ],
        nextCursor: 'cursor-2',
        hasMore: false,
        resetRequired: false,
      ),
    );
    expect(await ws.db.rows('SELECT * FROM entity_cache'), isEmpty);
    await reopened.bootstrap(
      await authority.bootstrap(
        const SyncBootstrapRequest(deviceId: 'fixture', schemaVersion: 1),
      ),
    );
    expect(
      await ws.commands(verify: (_) async => false).get(draft.commandId),
      isNotNull,
    );
  });
  test(
    'server cursor reset never clears outbox and backoff respects Retry-After',
    () async {
      final authority = FixtureAuthority()..reset = true;
      final engine = SyncEngine(ws, queue, authority, jitter: () => 0.5);
      expect(engine.backoff(1), const Duration(seconds: 5));
      expect(engine.backoff(100), const Duration(minutes: 30));
      expect(
        engine.backoff(1, retryAfter: const Duration(minutes: 2)),
        const Duration(minutes: 2),
      );
      await engine.run();
      expect(authority.bootstrapCount, 2);
    },
  );
}
