import 'package:flutter/material.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../features/map/offline_package.dart';

const gisBaseStyle =
    '''{"version":8,"sources":{},"layers":[{"id":"background","type":"background","paint":{"background-color":"#edf1e9"}}]}''';
Map<String, dynamic> fieldFeatures(List<OfflineGisField> fields) => {
  'type': 'FeatureCollection',
  'features': fields
      .take(100)
      .where((f) => f.geometry != null)
      .map(
        (f) => {
          'type': 'Feature',
          'id': f.id,
          'geometry': f.geometry,
          'properties': {
            'name': f.name,
            'targetId': f.targetId,
            'revisionId': f.ownerRevisionId,
          },
        },
      )
      .toList(),
};
Map<String, dynamic> fieldCenters(List<FieldCenter> centers) => {
  'type': 'FeatureCollection',
  'features': centers
      .where((f) => f.coordinates != null)
      .map(
        (f) => {
          'type': 'Feature',
          'id': f.id,
          'geometry': {'type': 'Point', 'coordinates': f.coordinates},
          'properties': {'name': f.name},
        },
      )
      .toList(),
};

class GisMapCanvas extends StatefulWidget {
  const GisMapCanvas({
    super.key,
    this.style = gisBaseStyle,
    this.fields = const [],
    this.centers = const [],
    this.bounds,
    this.onViewport,
    this.onLoaded,
  });
  final String style;
  final List<OfflineGisField> fields;
  final List<FieldCenter> centers;
  final List<num>? bounds;
  final ValueChanged<List<double>>? onViewport;
  final VoidCallback? onLoaded;
  @override
  State<GisMapCanvas> createState() => _GisMapCanvasState();
}

class _GisMapCanvasState extends State<GisMapCanvas> {
  MapLibreMapController? controller;
  bool loaded = false;
  String? error;
  @override
  void didUpdateWidget(covariant GisMapCanvas old) {
    super.didUpdateWidget(old);
    if (loaded) update();
  }

  Future<void> update() async {
    try {
      await controller?.setGeoJsonSource(
        'offline-fields',
        fieldFeatures(widget.fields),
      );
      await controller?.setGeoJsonSource(
        'field-centers',
        fieldCenters(widget.centers),
      );
    } catch (_) {
      if (mounted) {
        setState(
          () => error =
              'Не удалось показать сохранённые поля. Откройте карту повторно.',
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final b = widget.bounds;
    final target = b == null
        ? const LatLng(0, 0)
        : LatLng(
            (b[1] + b[3]) / 2,
            b[0] <= b[2]
                ? (b[0] + b[2]) / 2
                : ((b[0] + b[2] + 360) / 2 + 180) % 360 - 180,
          );
    return Stack(
      children: [
        MapLibreMap(
          styleString: widget.style,
          initialCameraPosition: CameraPosition(
            target: target,
            zoom: b == null ? 1 : 10,
          ),
          myLocationEnabled: false,
          onMapCreated: (c) => controller = c,
          onStyleLoadedCallback: () async {
            try {
              final c = controller;
              if (c == null) return;
              await c.addGeoJsonSource(
                'offline-fields',
                fieldFeatures(widget.fields),
              );
              await c.addFillLayer(
                'offline-fields',
                'offline-fields-fill',
                const FillLayerProperties(
                  fillColor: '#315e36',
                  fillOpacity: 0.22,
                ),
              );
              await c.addLineLayer(
                'offline-fields',
                'offline-fields-outline',
                const LineLayerProperties(lineColor: '#204d29', lineWidth: 2),
              );
              await c.addSource(
                'field-centers',
                GeojsonSourceProperties(
                  data: fieldCenters(widget.centers),
                  cluster: true,
                ),
              );
              await c.addCircleLayer(
                'field-centers',
                'field-center-points',
                const CircleLayerProperties(
                  circleColor: '#87551e',
                  circleRadius: 6,
                  circleStrokeColor: '#ffffff',
                  circleStrokeWidth: 2,
                ),
              );
              if (mounted) {
                setState(() => loaded = true);
                widget.onLoaded?.call();
              }
            } catch (_) {
              if (mounted) {
                setState(
                  () => error = 'Карта недоступна. Сохранённые задания остаются в списке.',
                );
              }
            }
          },
          onCameraIdle: () async {
            try {
              final b = await controller?.getVisibleRegion();
              if (mounted && b != null) {
                widget.onViewport?.call([
                  b.southwest.longitude,
                  b.southwest.latitude,
                  b.northeast.longitude,
                  b.northeast.latitude,
                ]);
              }
            } catch (_) {}
          },
        ),
        if (error != null || !loaded)
          Positioned(
            left: 16,
            right: 16,
            bottom: 16,
            child: Material(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Text(error ?? 'Загрузка карты…'),
              ),
            ),
          ),
      ],
    );
  }
}

class GisMapPage extends StatefulWidget {
  const GisMapPage({super.key});
  @override
  State<GisMapPage> createState() => _GisMapPageState();
}

class _GisMapPageState extends State<GisMapPage> {
  bool loaded = false;
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Карта')),
    body: Stack(
      children: [
        GisMapCanvas(
          onLoaded: () {
            if (mounted) setState(() => loaded = true);
          },
        ),
        Positioned(
          left: 16,
          right: 16,
          bottom: 32,
          child: Material(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                loaded
                    ? 'Нет подключённых слоёв. Подложка не подключена.'
                    : 'Загрузка карты…',
              ),
            ),
          ),
        ),
      ],
    ),
  );
}
