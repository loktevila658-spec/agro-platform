import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/features/map/offline_package.dart';
import 'package:agroplatform_mobile/features/map/map_source.dart';

const mapIdentity = WorkspaceIdentity(
  'map-tenant',
  'map-user',
  'map-workspace',
);
const mapDevice = '019a4d83-0000-7000-8000-000000000111';
const mapField = '019a4d83-0000-7000-8000-000000000222';
const projectionId = '019a4d83-0000-7000-8000-000000000333';
OfflineGisSource publicSource({
  String url = 'https://fixture.invalid/style.json',
}) => OfflineGisSource(
  id: 'test-only-public',
  label: 'Test licensed fixture',
  styleUrl: url,
  styleVersion: 'v1',
  sourceVersion: 'v1',
  attribution: 'Test fixture',
  termsRef: 'test-license',
  offlineAllowed: true,
  publicBasemap: true,
  minZoom: 0,
  maxZoom: 12,
);
OfflineGisSelection selected({String? sourceId}) => OfflineGisSelection(
  targets: const [OfflineGisTarget(id: mapField, kind: 'FIELD')],
  bounds: [30, 50, 30.2, 50.2],
  minZoom: 0,
  maxZoom: 0,
  sourceId: sourceId,
);
OfflineGisManifest manifest({int version = 1, OfflineGisSource? source}) =>
    OfflineGisManifest(
      id: mapDevice,
      version: version,
      tenantId: mapIdentity.tenantId,
      userId: mapIdentity.userId,
      deviceId: mapDevice,
      selection: selected(sourceId: source?.id),
      createdAt: '2026-11-04T00:00:00Z',
      lastValidatedAt: '2026-11-04T01:00:00Z',
      entries: [projectionId],
      renderProfile: {'version': 'test-v1', 'toleranceDegrees': 0.00001},
      source: source,
      sourceChanged: false,
      contentHash: 'test-hash-$version',
    );
OfflineGisField field({
  int version = 1,
  String name = 'Actual cached fixture',
}) => OfflineGisField(
  id: projectionId,
  packageId: mapDevice,
  bundleVersion: version,
  targetId: mapField,
  kind: 'FIELD',
  fieldId: mapField,
  name: name,
  organizationId: 'test-org',
  ownerRevisionId: 'test-revision-$version',
  fieldRevisionId: 'test-revision-$version',
  ownerVersion: '$version',
  geometryVersionId: 'pinned-geometry',
  geometry: {
    'type': 'Polygon',
    'coordinates': [
      [
        [30.0, 50.0],
        [30.1, 50.0],
        [30.1, 50.1],
        [30.0, 50.1],
        [30.0, 50.0],
      ],
    ],
  },
  bounds: [30, 50, 30.1, 50.1],
  center: [30.05, 50.05],
  sourceChanged: false,
  provenance: {'source': 'manual', 'revision': 'original'},
);
Future<void> seedMap(
  Workspace w, {
  int version = 1,
  OfflineGisSource? source,
  bool complete = true,
}) async {
  await w.db.customStatement(
    'INSERT OR REPLACE INTO entity_cache VALUES(?,?,?,?)',
    [
      'OfflineGisPackage',
      mapDevice,
      jsonEncode(manifest(version: version, source: source).toJson()),
      version,
    ],
  );
  if (complete) {
    await w.db.customStatement(
      'INSERT OR REPLACE INTO entity_cache VALUES(?,?,?,?)',
      [
        'OfflineGisField',
        projectionId,
        jsonEncode(field(version: version).toJson()),
        version,
      ],
    );
  }
}

OfflineGrant mapGrant(Workspace w) => OfflineGrant(
  id: 'test-map-grant',
  tenantId: w.identity.tenantId,
  userId: w.identity.userId,
  scopeVersion: 1,
  issuedAt: DateTime.utc(2020),
  expiresAt: DateTime.utc(2100),
  allowedCommands: {'OfflineGis.Select', 'OfflineGis.Refresh'},
  allowedOwners: {'OfflineGisPackage:$mapDevice'},
  risk: 'O1',
  signedEnvelope: 'test-only-signature',
);
Future<void> seedMapGrant(Workspace w) async {
  final g = mapGrant(w);
  await w.db.customStatement('INSERT INTO permission_snapshot VALUES(?,?)', [
    g.id,
    g.json,
  ]);
}

void main() {
  test(
    'region and source compatibility reject malformed/unauthorized metadata',
    () {
      validatePackage(manifest());
      expect(
        () => validateSelection(
          OfflineGisSelection(
            targets: selected().targets,
            bounds: [0, 0, 0, 1],
            minZoom: 0,
            maxZoom: 1,
          ),
        ),
        throwsArgumentError,
      );
      expect(
        () => const MapSourceAccess().validate(
          publicSource(url: 'https://user:password@fixture.invalid/style'),
        ),
        throwsStateError,
      );
      expect(
        () => const MapSourceAccess().validate(
          publicSource(url: 'http://127.0.0.1/style'),
        ),
        throwsStateError,
      );
      const MapSourceAccess(allowLoopbackForTests: true)
          .validate(publicSource(url: 'http://127.0.0.1/style'));
    },
  );
  test('vectors alone never claim completed native basemap', () {
    expect(
      PackageSnapshot(manifest: manifest(), visible: true).state,
      PackageState.vectorsReady,
    );
    expect(
      PackageSnapshot(
        manifest: manifest(),
        visible: true,
        basemapReady: true,
      ).state,
      PackageState.ready,
    );
  });
}
