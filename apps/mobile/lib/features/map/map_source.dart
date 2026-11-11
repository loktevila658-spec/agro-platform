import '../../generated/contracts.dart';

class MapSourceAccess {
  const MapSourceAccess({this.allowLoopbackForTests = false});
  final bool allowLoopbackForTests;
  void validate(OfflineGisSource source) {
    final u = Uri.parse(source.styleUrl);
    final testLoopback =
        allowLoopbackForTests &&
        u.scheme == 'http' &&
        {'127.0.0.1', 'localhost'}.contains(u.host);
    if ((u.scheme != 'https' && !testLoopback) ||
        u.host.isEmpty ||
        u.userInfo.isNotEmpty ||
        u.hasQuery ||
        u.hasFragment ||
        !source.offlineAllowed ||
        !source.publicBasemap ||
        source.termsRef.isEmpty ||
        source.styleVersion.isEmpty ||
        source.sourceVersion.isEmpty ||
        source.minZoom < 0 ||
        source.maxZoom > 24 ||
        source.minZoom > source.maxZoom)
      throw StateError('MAP_SOURCE_NOT_AUTHORIZED');
  }
}

class MapGateway {
  MapGateway(this.read);
  final Future<Map<String, Object?>> Function(String path) read;
  Future<List<OfflineGisSource>> sources() async =>
      OfflineGisSources.fromJson(await read('/v1/offline-gis/sources')).sources;
  Future<OfflineGisCandidates> fields({
    String? after,
  }) async => OfflineGisCandidates.fromJson(
    await read(
      '/v1/offline-gis/fields${after == null ? '' : '?after=${Uri.encodeQueryComponent(after)}'}',
    ),
  );
}
