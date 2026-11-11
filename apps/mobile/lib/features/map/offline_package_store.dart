import 'dart:convert';

import 'package:crypto/crypto.dart';

import '../../persistence.dart';
import 'offline_package.dart';

class OfflinePackageStore {
  OfflinePackageStore(this.workspace);
  final Workspace workspace;
  Future<String> get packageId async =>
      (await workspace.db.rows('SELECT device_id FROM local_device WHERE id=1'))
              .single['device_id']
          as String;
  static String sourceSignature(OfflineGisManifest m) => sha256
      .convert(
        utf8.encode(
          jsonEncode({
            'source': m.source?.toJson(),
            'bounds': m.selection.bounds,
            'minZoom': m.selection.minZoom,
            'maxZoom': m.selection.maxZoom,
          }),
        ),
      )
      .toString();
  Future<void> reconcile() async {
    workspace.ensureOpen();
    final db = workspace.db, id = await packageId;
    await db.write(() async {
      final scope =
          (await db.rows(
                'SELECT scope_version FROM local_workspace WHERE id=1',
              )).single['scope_version']
              as int;
      await db.customStatement(
        'INSERT OR IGNORE INTO offline_package_state(id,scope_version) VALUES(?,?)',
        [id, scope],
      );
      final rows = await db.rows(
        "SELECT projection_json FROM entity_cache WHERE entity_type='OfflineGisPackage' AND entity_id=?",
        [id],
      );
      if (rows.isEmpty) {
        await db.customStatement(
          'UPDATE offline_package_state SET visible=0 WHERE id=?',
          [id],
        );
        return;
      }
      final m = OfflineGisManifest.fromJson(
        jsonDecode(rows.single['projection_json'] as String)
            as Map<String, Object?>,
      );
      validatePackage(m);
      if (m.tenantId != workspace.identity.tenantId ||
          m.userId != workspace.identity.userId ||
          m.deviceId != id) {
        throw StateError('MAP_WORKSPACE_MISMATCH');
      }
      final count = (await db.rows(
        "SELECT count(*) n FROM entity_cache WHERE entity_type='OfflineGisField' AND entity_id IN (SELECT value FROM json_each(?)) AND json_extract(projection_json,'\$.packageId')=? AND json_extract(projection_json,'\$.bundleVersion')=?",
        [jsonEncode(m.entries), id, m.version],
      )).single['n'];
      if (count != m.entries.length) {
        final prior = (await db.rows(
          'SELECT * FROM offline_package_state WHERE id=?',
          [id],
        )).single;
        var usable = false;
        if (prior['scope_version'] == scope && prior['manifest_json'] != null) {
          final active = OfflineGisManifest.fromJson(
            jsonDecode(prior['manifest_json'] as String)
                as Map<String, Object?>,
          );
          final retained = (await db.rows(
            "SELECT count(*) n FROM entity_cache WHERE entity_type='OfflineGisField' AND entity_id IN (SELECT value FROM json_each(?))",
            [jsonEncode(active.entries)],
          )).single['n'];
          usable = retained == active.entries.length;
        }
        await db.customStatement(
          'UPDATE offline_package_state SET visible=?,error=? WHERE id=?',
          [
            usable ? 1 : 0,
            usable ? 'MAP_UPDATE_INCOMPLETE' : 'MAP_SYNC_INCOMPLETE',
            id,
          ],
        );
        return;
      }
      await db.customStatement(
        '''INSERT OR REPLACE INTO offline_package_field SELECT ?,?,entity_id,projection_json,json_extract(projection_json,'\$.bounds[0]'),json_extract(projection_json,'\$.bounds[1]'),json_extract(projection_json,'\$.bounds[2]'),json_extract(projection_json,'\$.bounds[3]'),json_extract(projection_json,'\$.center'),json_extract(projection_json,'\$.name'),json_extract(projection_json,'\$.targetId'),json_extract(projection_json,'\$.fieldId') FROM entity_cache WHERE entity_type='OfflineGisField' AND entity_id IN (SELECT value FROM json_each(?))''',
        [id, m.version, jsonEncode(m.entries)],
      );
      await db.customStatement(
        'UPDATE offline_package_state SET scope_version=?,manifest_json=?,active_version=?,visible=1,error=CASE WHEN error IN (\'MAP_SYNC_INCOMPLETE\',\'MAP_UPDATE_INCOMPLETE\') THEN NULL ELSE error END WHERE id=?',
        [scope, jsonEncode(m.toJson()), m.version, id],
      );
      await db.customStatement(
        'DELETE FROM offline_package_field WHERE package_id=? AND version<>?',
        [id, m.version],
      );
    });
  }

  Future<PackageSnapshot> snapshot({List<double>? bounds}) async {
    workspace.ensureOpen();
    final db = workspace.db, id = await packageId;
    final rows = await db.rows(
      'SELECT p.*,w.scope_version current_scope FROM offline_package_state p CROSS JOIN local_workspace w WHERE p.id=?',
      [id],
    );
    if (rows.isEmpty) return const PackageSnapshot();
    final p = rows.single;
    if (p['visible'] != 1 ||
        p['scope_version'] != p['current_scope'] ||
        p['manifest_json'] == null) {
      return const PackageSnapshot();
    }
    // A scope reset or PURGE cannot resurrect the pinned snapshot.
    final cached = await db.rows(
      "SELECT entity_id FROM entity_cache WHERE entity_type='OfflineGisPackage' AND entity_id=?",
      [id],
    );
    if (cached.isEmpty) return const PackageSnapshot();
    final m = OfflineGisManifest.fromJson(
      jsonDecode(p['manifest_json'] as String) as Map<String, Object?>,
    );
    final allowed = (await db.rows(
      "SELECT count(*) n FROM entity_cache WHERE entity_type='OfflineGisField' AND entity_id IN (SELECT value FROM json_each(?))",
      [jsonEncode(m.entries)],
    )).single['n'];
    if (allowed != m.entries.length) return const PackageSnapshot();
    final b = bounds ?? m.selection.bounds;
    final fields = await db.rows(
      '''SELECT projection_json FROM offline_package_field WHERE package_id=? AND version=? AND (min_x IS NULL OR (max_y>=? AND min_y<=? AND ((?<=? AND max_x>=? AND min_x<=?) OR (?>? AND (max_x>=? OR min_x<=?))))) ORDER BY id LIMIT 100''',
      [
        id,
        m.version,
        b[1],
        b[3],
        b[0],
        b[2],
        b[0],
        b[2],
        b[0],
        b[2],
        b[0],
        b[2],
      ],
    );
    final centers = await db.rows(
      'SELECT id,target_id,field_id,name,center_json FROM offline_package_field WHERE package_id=? AND version=? ORDER BY id',
      [id, m.version],
    );
    return PackageSnapshot(
      manifest: m,
      fields: fields
          .map(
            (r) => OfflineGisField.fromJson(
              jsonDecode(r['projection_json'] as String)
                  as Map<String, Object?>,
            ),
          )
          .toList(),
      centers: centers
          .map(
            (r) => FieldCenter(
              r['id'] as String,
              r['target_id'] as String,
              r['field_id'] as String,
              r['name'] as String,
              r['center_json'] == null
                  ? null
                  : (jsonDecode(r['center_json'] as String) as List)
                        .map((v) => (v as num).toDouble())
                        .toList(),
            ),
          )
          .toList(),
      regionId: p['native_id'] as int?,
      signature: p['native_signature'] as String?,
      basemapReady:
          p['native_complete'] == 1 &&
          p['native_signature'] == sourceSignature(m),
      bytes: p['bytes'] as int,
      progress: (p['progress'] as num).toDouble(),
      paused: p['paused'] == 1,
      error: p['error'] as String?,
      visible: true,
    );
  }

  Future<void> clearNative() async {
    final id = await packageId;
    await workspace.db.customStatement(
      'UPDATE offline_package_state SET native_id=NULL,native_signature=NULL,native_complete=0,progress=0,bytes=0 WHERE id=?',
      [id],
    );
  }

  Future<void> nativeProgress({
    required String signature,
    required int regionId,
    required double progress,
    required int bytes,
    required bool complete,
    bool paused = false,
    String? error,
  }) async {
    final id = await packageId;
    await workspace.db.write(() async {
      final rows = await workspace.db.rows(
        'SELECT manifest_json FROM offline_package_state WHERE id=?',
        [id],
      );
      if (rows.isEmpty || rows.single['manifest_json'] == null) return;
      final m = OfflineGisManifest.fromJson(
        jsonDecode(rows.single['manifest_json'] as String)
            as Map<String, Object?>,
      );
      if (sourceSignature(m) != signature) return;
      await workspace.db.customStatement(
        'UPDATE offline_package_state SET native_id=?,native_signature=?,progress=?,bytes=?,native_complete=?,paused=?,error=? WHERE id=?',
        [
          regionId,
          signature,
          progress.clamp(0, 1),
          bytes,
          complete ? 1 : 0,
          paused ? 1 : 0,
          error,
          id,
        ],
      );
    });
  }
}
