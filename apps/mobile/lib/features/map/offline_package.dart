import '../../generated/contracts.dart';
export '../../generated/contracts.dart'
    show
        OfflineGisManifest,
        OfflineGisSelection,
        OfflineGisTarget,
        OfflineGisField,
        OfflineGisSource,
        OfflineGisCandidate;

enum PackageState {
  waiting,
  vectorsReady,
  downloading,
  paused,
  ready,
  stale,
  unavailable,
  error,
}

class FieldCenter {
  const FieldCenter(
    this.id,
    this.targetId,
    this.fieldId,
    this.name,
    this.coordinates,
  );
  final String id, targetId, fieldId, name;
  final List<double>? coordinates;
}

class PackageSnapshot {
  const PackageSnapshot({
    this.manifest,
    this.fields = const [],
    this.centers = const [],
    this.regionId,
    this.signature,
    this.basemapReady = false,
    this.bytes = 0,
    this.progress = 0,
    this.paused = false,
    this.error,
    this.visible = false,
  });
  final OfflineGisManifest? manifest;
  final List<OfflineGisField> fields;
  final List<FieldCenter> centers;
  final int? regionId;
  final String? signature, error;
  final bool basemapReady, paused, visible;
  final int bytes;
  final double progress;
  PackageState get state {
    if (!visible || manifest == null) return PackageState.unavailable;
    if (error != null) return PackageState.error;
    if (paused) return PackageState.paused;
    if (manifest!.sourceChanged) return PackageState.stale;
    if (basemapReady) return PackageState.ready;
    if (regionId != null) return PackageState.downloading;
    return PackageState.vectorsReady;
  }
}

void validatePackage(OfflineGisManifest m) {
  if (m.version < 1 ||
      m.id != m.deviceId ||
      m.entries.toSet().length != m.entries.length ||
      m.entries.length > 1000 ||
      DateTime.tryParse(m.createdAt) == null ||
      DateTime.tryParse(m.lastValidatedAt) == null)
    throw StateError('INVALID_OFFLINE_PACKAGE');
  validateSelection(m.selection);
}

void validateSelection(OfflineGisSelection s) {
  final b = s.bounds;
  if (b.length != 4 ||
      b.any((v) => !v.isFinite) ||
      b[0].abs() > 180 ||
      b[2].abs() > 180 ||
      b[1].abs() > 90 ||
      b[3].abs() > 90 ||
      b[1] >= b[3] ||
      b[0] == b[2] ||
      s.targets.isEmpty ||
      s.targets.length > 1000 ||
      s.targets.map((t) => t.id).toSet().length != s.targets.length ||
      s.targets.any((t) => !{'FIELD', 'FIELD_SEASON'}.contains(t.kind)) ||
      s.minZoom < 0 ||
      s.maxZoom > 24 ||
      s.minZoom > s.maxZoom)
    throw ArgumentError('INVALID_MAP_SELECTION');
  final width = b[2] > b[0] ? b[2] - b[0] : 360 - b[0] + b[2];
  if (width * (b[3] - b[1]) > 3600) throw ArgumentError('MAP_REGION_TOO_LARGE');
}
