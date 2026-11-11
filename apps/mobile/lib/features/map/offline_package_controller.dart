import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../../persistence.dart';
import '../tasks/task_repository.dart';
import '../tasks/task_commands.dart' show taskGrantFromJson;
import 'offline_package.dart';
import 'offline_package_store.dart';
import 'map_source.dart';
import 'maplibre_offline_regions.dart';

class OfflinePackageController extends ChangeNotifier {
  OfflinePackageController(
    this.workspace, {
    required this.verify,
    required this.regions,
    this.gateway,
    this.tasks,
    this.onQueued,
    this.sourceAccess = const MapSourceAccess(),
  }) : store = OfflinePackageStore(workspace);
  final Workspace workspace;
  final OfflineGrantVerifier verify;
  final OfflineRegions regions;
  final MapGateway? gateway;
  final TaskRepository? tasks;
  final VoidCallback? onQueued;
  final MapSourceAccess sourceAccess;
  final OfflinePackageStore store;
  PackageSnapshot view = const PackageSnapshot();
  List<OfflineGisCandidate> candidates = [];
  List<OfflineGisSource> sources = [];
  List<TaskView> mapTasks = [];
  String? choiceError, commandState, nextAfter, notice;
  bool busy = false, _closed = false;
  Timer? _timer;
  Future<void> _serial = Future<void>.value();
  String? _nativeError;
  int _downloadEpoch = 0;
  Future<void> _run(Future<void> Function() action) {
    final result = _serial.then((_) async {
      if (!_closed) await action();
    });
    _serial = result.catchError((Object _) {});
    return result;
  }

  void _changed() {
    if (!_closed) notifyListeners();
  }

  Future<void> reconcile({List<double>? bounds}) => _run(() async {
    if (bounds == null) await store.reconcile();
    view = await store.snapshot(bounds: bounds);
    if (view.manifest?.source != null) {
      sourceAccess.validate(view.manifest!.source!);
    }
    final states = await workspace.db.rows(
      "SELECT status FROM sync_outbox WHERE aggregate_type='OfflineGisPackage' AND status<>'confirmed' ORDER BY device_seq DESC LIMIT 1",
    );
    commandState = states.isEmpty ? null : states.single['status'] as String;
    final targets = view.centers.expand((f) => [f.targetId, f.fieldId]).toSet();
    mapTasks = (await tasks?.list() ?? <TaskView>[])
        .where((t) => targets.contains(t.task.definition.targetId))
        .toList();
    _changed();
  });
  Future<void> loadChoices() async {
    final g = gateway;
    if (g == null) return;
    try {
      sources = await g.sources();
      for (final s in sources) {
        sourceAccess.validate(s);
      }
      final page = await g.fields();
      candidates = page.items;
      nextAfter = page.nextAfter;
      choiceError = null;
    } catch (_) {
      choiceError =
          'Не удалось получить разрешённые области. Повторите при подключении.';
    }
    _changed();
  }

  Future<void> moreChoices() async {
    final g = gateway, after = nextAfter;
    if (g == null || after == null) return;
    try {
      final page = await g.fields(after: after);
      final byId = {
        for (final f in candidates) f.id: f,
        for (final f in page.items) f.id: f,
      };
      candidates = byId.values.toList();
      if (page.nextAfter == after) throw StateError('INVALID_FIELD_PAGE');
      nextAfter = page.nextAfter;
      choiceError = null;
    } catch (_) {
      choiceError =
          'Не удалось получить следующую страницу. Повторите при подключении.';
    }
    _changed();
  }

  Future<OfflineGrant?> grant(String action) async {
    final id = await store.packageId;
    final scope = (await workspace.db.rows(
      'SELECT scope_version FROM local_workspace WHERE id=1',
    )).single['scope_version'];
    final now = DateTime.now().toUtc();
    for (final row in await workspace.db.rows(
      'SELECT snapshot_json FROM permission_snapshot',
    )) {
      final g = taskGrantFromJson(row['snapshot_json'] as String);
      if (g.tenantId == workspace.identity.tenantId &&
          g.userId == workspace.identity.userId &&
          g.scopeVersion == scope &&
          g.risk == 'O1' &&
          !now.isBefore(g.issuedAt) &&
          now.isBefore(g.expiresAt) &&
          g.allowedCommands.contains('OfflineGis.$action') &&
          g.allowedOwners.contains('OfflineGisPackage:$id') &&
          await verify(g)) {
        return g;
      }
    }
    return null;
  }

  Future<bool> validate(CommandDraft draft, OfflineGrant permission) async {
    if (draft.aggregateType != 'OfflineGisPackage' ||
        draft.aggregateId != await store.packageId ||
        !{
          'OfflineGis.Select',
          'OfflineGis.Refresh',
        }.contains(draft.commandType)) {
      return false;
    }
    final pending = await workspace.db.rows(
      "SELECT 1 FROM sync_outbox WHERE aggregate_type='OfflineGisPackage' AND status IN ('pending','sending','retryWait') LIMIT 1",
    );
    if (pending.isNotEmpty) return false;
    if (draft.expectedVersion != await currentVersion()) return false;
    try {
      final payload = jsonDecode(draft.payloadJson) as Map<String, Object?>;
      if (draft.commandType == 'OfflineGis.Select') {
        final s = OfflineGisSelection.fromJson(payload);
        validateSelection(s);
        if (payload.keys.any(
          (k) => !{
            'targets',
            'bounds',
            'minZoom',
            'maxZoom',
            'sourceId',
          }.contains(k),
        )) {
          return false;
        }
      } else if (payload.isNotEmpty) {
        return false;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<int> currentVersion() async {
    final id = await store.packageId;
    final cached = await workspace.db.rows(
      "SELECT server_version FROM entity_cache WHERE entity_type='OfflineGisPackage' AND entity_id=?",
      [id],
    );
    var version = cached.isEmpty ? 0 : cached.single['server_version'] as int;
    final receipts = await workspace.db.rows(
      "SELECT r.result_json FROM sync_command_result r JOIN sync_outbox q ON q.local_command_id=r.local_command_id WHERE q.aggregate_type='OfflineGisPackage' AND q.aggregate_id=?",
      [id],
    );
    for (final row in receipts) {
      final result = jsonDecode(row['result_json'] as String) as Map;
      final canonical = result['canonical'];
      if (canonical is Map &&
          canonical['version'] is int &&
          (canonical['version'] as int) > version) {
        version = canonical['version'] as int;
      }
    }
    return version;
  }

  Future<void> select(OfflineGisSelection selection) async {
    validateSelection(selection);
    await _queue('Select', selection.toJson());
  }

  Future<void> refresh() async => _queue('Refresh', {});
  Future<void> _queue(String action, Map<String, Object?> payload) async {
    final permission = await grant(action);
    if (permission == null) throw StateError('OFFLINE_PERMISSION_DENIED');
    final id = await store.packageId;
    final draft = CommandDraft.create(
      aggregateType: 'OfflineGisPackage',
      aggregateId: id,
      commandType: 'OfflineGis.$action',
      expectedVersion: await currentVersion(),
      observedAt: DateTime.now().toUtc(),
      payload: payload,
      provenance: {
        'source': 'manual',
        'workspaceId': workspace.identity.workspaceId,
      },
    );
    await workspace
        .commands(verify: verify, validate: validate)
        .enqueue(draft, permission);
    onQueued?.call();
    _changed();
  }

  Future<int> _create(OfflineGisManifest manifest) {
    final epoch = ++_downloadEpoch;
    _nativeError = null;
    return regions.create(
      manifest,
      onError: (error) {
        if (!_closed && epoch == _downloadEpoch) _nativeError = error;
      },
    );
  }

  Future<void> download() => _run(() async {
    final m = view.manifest;
    if (m == null || !view.visible) throw StateError('MAP_SYNC_INCOMPLETE');
    if (m.source == null) throw StateError('BASEMAP_UNAVAILABLE');
    sourceAccess.validate(m.source!);
    busy = true;
    _changed();
    try {
      _nativeError = null;
      await workspace.markExternalAssets();
      final signature = OfflinePackageStore.sourceSignature(m);
      int id;
      if (view.regionId != null && view.signature == signature) {
        id = view.regionId!;
        final current = await regions.status(id);
        if (!current.complete) {
          try {
            await regions.resume(id);
          } on PlatformException catch (error) {
            if (error.code != 'ResumeRegionError') rethrow;
            // Pinned Android0.27.1 cannot reattach a native observer after
            // process restart. Its supported restart preserves the definition;
            // a partial public basemap may need resources downloaded again.
            notice =
                'После перезапуска часть подложки может загрузиться повторно.';
            id = await _create(m);
          }
        }
      } else {
        await regions.reset();
        id = await _create(m);
      }
      await store.nativeProgress(
        signature: signature,
        regionId: id,
        progress: 0,
        bytes: 0,
        complete: false,
      );
      view = await store.snapshot();
      await _poll();
    } finally {
      busy = false;
      _changed();
    }
  });
  Future<void> _poll() async {
    final id = view.regionId, m = view.manifest;
    if (id == null || m == null) return;
    try {
      final s = await regions.status(id);
      await store.nativeProgress(
        signature: OfflinePackageStore.sourceSignature(m),
        regionId: id,
        progress: s.fraction,
        bytes: s.bytes,
        complete: s.complete,
        error: _nativeError,
      );
      view = await store.snapshot();
      if (_nativeError != null) await regions.pause(id);
      _changed();
      if (!s.complete && !view.paused && _nativeError == null && !_closed) {
        _timer?.cancel();
        _timer = Timer(
          const Duration(seconds: 1),
          () => unawaited(_run(_poll)),
        );
      }
    } catch (_) {
      await store.nativeProgress(
        signature: OfflinePackageStore.sourceSignature(m),
        regionId: id,
        progress: view.progress,
        bytes: view.bytes,
        complete: false,
        error: 'MAP_STORAGE_OR_DOWNLOAD_FAILED',
      );
      view = await store.snapshot();
      _changed();
    }
  }

  Future<void> pause() => _run(() async {
    final id = view.regionId, m = view.manifest;
    if (id == null || m == null) return;
    _timer?.cancel();
    await regions.pause(id);
    final s = await regions.status(id);
    await store.nativeProgress(
      signature: OfflinePackageStore.sourceSignature(m),
      regionId: id,
      progress: s.fraction,
      bytes: s.bytes,
      complete: s.complete,
      paused: true,
    );
    view = await store.snapshot();
    _changed();
  });
  Future<void> close() async {
    if (_closed) return;
    _closed = true;
    _timer?.cancel();
    await _serial;
    final id = view.regionId;
    try {
      if (id != null && !view.basemapReady) await regions.pause(id);
    } finally {
      view = const PackageSnapshot();
      mapTasks = [];
      candidates = [];
      sources = [];
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _closed = true;
    _timer?.cancel();
    super.dispose();
  }
}
