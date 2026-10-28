import '../persistence/database.dart';
import '../persistence/models.dart';
import 'protocol.dart';

class PullStore {
  PullStore(this.db);
  final LocalDatabase db;
  Future<String?> cursor() async =>
      (await db.rows("SELECT cursor FROM sync_cursor WHERE stream='main'"))
              .firstOrNull?['cursor']
          as String?;
  Future<void> bootstrap(SyncBootstrapResponse manifest) async {
    if (manifest.authorityMode != 'LOCAL_PRIMARY' ||
        manifest.schemaVersion != 1) {
      throw StateError('AUTHORITY_MODE_MISMATCH');
    }
    await db.write(() async {
      // Cache reset never deletes outbox, provisional projections, receipts,
      // attachment bytes/ACKs, evidence or immutable permission snapshots.
      await db.customStatement('DELETE FROM entity_cache');
      await db.customStatement('DELETE FROM entity_sync_meta');
      await db.customStatement('DELETE FROM sync_cursor');
      await db.customStatement("INSERT INTO sync_cursor VALUES('main',?,0,?)", [
        manifest.initialCursor,
        manifest.scopeVersion,
      ]);
      await db.customStatement(
        'UPDATE local_workspace SET scope_version=?,last_bootstrap_at=? WHERE id=1',
        [manifest.scopeVersion, DateTime.now().toUtc().toIso8601String()],
      );
    });
  }

  Future<void> apply(
    String expectedCursor,
    SyncPullResponse page, {
    Future<void> Function()? beforeCommit,
  }) async {
    if (page.resetRequired ||
        page.nextCursor.isEmpty ||
        page.changes.length > 500) {
      throw StateError('RESET_REQUIRED');
    }
    await db.write(() async {
      final current = (await db.rows(
        "SELECT * FROM sync_cursor WHERE stream='main'",
      )).single;
      if (current['cursor'] != expectedCursor) {
        throw StateError('STALE_PULL_PAGE');
      }
      var last = current['last_seq'] as int;
      for (final c in page.changes) {
        final seq = int.parse(c.seq);
        if (seq <= last || !{'UPSERT', 'PURGE'}.contains(c.op)) {
          throw StateError('INVALID_PULL_PAGE');
        }
        last = seq;
        if (c.op == 'PURGE') {
          await db.customStatement(
            'DELETE FROM entity_cache WHERE entity_type=? AND entity_id=?',
            [c.entityType, c.entityId],
          );
        } else {
          await db.customStatement(
            'INSERT INTO entity_cache VALUES(?,?,?,?) ON CONFLICT(entity_type,entity_id) DO UPDATE SET projection_json=excluded.projection_json,server_version=excluded.server_version',
            [
              c.entityType,
              c.entityId,
              canonicalJson(c.projection),
              c.entityVersion,
            ],
          );
        }
        await db.customStatement(
          'INSERT INTO entity_sync_meta VALUES(?,?,?) ON CONFLICT(entity_type,entity_id) DO UPDATE SET last_seq=excluded.last_seq',
          [c.entityType, c.entityId, seq],
        );
      }
      await db.customStatement(
        "UPDATE sync_cursor SET cursor=?,last_seq=? WHERE stream='main'",
        [page.nextCursor, last],
      );
      await beforeCommit?.call();
    });
  }
}
