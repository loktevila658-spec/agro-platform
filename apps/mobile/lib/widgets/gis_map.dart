import 'package:flutter/material.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

// No provider, credentials, network requests or invented geometry in the base.
const gisBaseStyle = '''
{"version":8,"sources":{},"layers":[{"id":"background","type":"background","paint":{"background-color":"#edf1e9"}}]}
''';

class GisMapPage extends StatefulWidget {
  const GisMapPage({super.key});

  @override
  State<GisMapPage> createState() => _GisMapPageState();
}

class _GisMapPageState extends State<GisMapPage> {
  bool loaded = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Карта')),
      body: Stack(
        children: [
          MapLibreMap(
            styleString: gisBaseStyle,
            initialCameraPosition: const CameraPosition(
              target: LatLng(0, 0),
              zoom: 1,
            ),
            onStyleLoadedCallback: () {
              if (mounted) setState(() => loaded = true);
            },
            // No location permission is requested by this foundation renderer.
            myLocationEnabled: false,
          ),
          Positioned(
            left: 16,
            right: 16,
            bottom: 32,
            child: Semantics(
              liveRegion: true,
              child: Material(
                color: Theme.of(context).colorScheme.surface,
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
          ),
        ],
      ),
    );
  }
}
