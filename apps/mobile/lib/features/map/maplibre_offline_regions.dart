import 'package:maplibre_gl/maplibre_gl.dart' as ml;

import 'offline_package.dart';
import 'map_source.dart';

class RegionProgress {
  const RegionProgress(this.fraction, this.bytes, this.complete);
  final double fraction;
  final int bytes;
  final bool complete;
}

abstract interface class OfflineRegions {
  Future<int> create(
    OfflineGisManifest manifest, {
    void Function(String)? onError,
  });
  Future<RegionProgress> status(int id);
  Future<void> pause(int id);
  Future<void> resume(int id);
  Future<void> delete(int id);
  Future<void> reset();
}

class MapLibreOfflineRegions implements OfflineRegions {
  MapLibreOfflineRegions({this.access = const MapSourceAccess()});
  final MapSourceAccess access;
  Object? lastError;
  @override
  Future<int> create(
    OfflineGisManifest m, {
    void Function(String)? onError,
  }) async {
    lastError = null;
    final source = m.source;
    if (source == null) throw StateError('BASEMAP_UNAVAILABLE');
    access.validate(source);
    validatePackage(m);
    final b = m.selection.bounds;
    final region = await ml.downloadOfflineRegion(
      ml.OfflineRegionDefinition(
        bounds: ml.LatLngBounds(
          southwest: ml.LatLng(b[1].toDouble(), b[0].toDouble()),
          northeast: ml.LatLng(b[3].toDouble(), b[2].toDouble()),
        ),
        mapStyleUrl: source.styleUrl,
        minZoom: m.selection.minZoom.toDouble(),
        maxZoom: m.selection.maxZoom.toDouble(),
      ),
      metadata: const {},
      onEvent: (event) {
        if (event is ml.Error) {
          lastError = event.cause;
          onError?.call('MAP_DOWNLOAD_FAILED');
        }
      },
    );
    return region.id;
  }

  @override
  Future<RegionProgress> status(int id) async {
    final s = await ml.getOfflineRegionStatus(id);
    return RegionProgress(
      s.requiredResourceCount > 0
          ? (s.completedResourceCount / s.requiredResourceCount).clamp(0.0, 1.0)
          : 0,
      s.completedResourceSize,
      s.isComplete,
    );
  }

  @override
  Future<void> pause(int id) => ml.pauseOfflineRegionDownload(id);
  @override
  Future<void> resume(int id) => ml.resumeOfflineRegionDownload(id);
  @override
  Future<void> delete(int id) async {
    await ml.deleteOfflineRegion(id);
  }

  @override
  Future<void> reset() => ml.resetOfflineDatabase();
}
