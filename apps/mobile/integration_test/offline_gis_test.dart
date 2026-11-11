import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:maplibre_gl/maplibre_gl.dart' as ml;
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/features/map/map_source.dart';
import 'package:agroplatform_mobile/features/map/maplibre_offline_regions.dart';
import 'package:agroplatform_mobile/features/map/offline_package_store.dart';
import 'package:agroplatform_mobile/widgets/gis_map.dart';

import '../test/offline_package_test.dart' as f;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'actual native tile download/pause/persist/resume, offline pixels/vector render and shared wipe',
    (tester) async {
      final recorder = ui.PictureRecorder();
      final canvas = ui.Canvas(recorder);
      canvas.drawRect(
        const ui.Rect.fromLTWH(0, 0, 512, 512),
        ui.Paint()..color = const ui.Color(0xffe84030),
      );
      final image = await recorder.endRecording().toImage(512, 512);
      final png = (await image.toByteData(format: ui.ImageByteFormat.png))!
          .buffer
          .asUint8List();
      image.dispose();
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final url = 'http://127.0.0.1:${server.port}';
      final tileGate = Completer<void>();
      var tileRequests = 0, requests = 0, serverClosed = false;
      server.listen((request) async {
        requests++;
        try {
          if (request.uri.path == '/style.json') {
            request.response.headers.contentType = ContentType.json;
            request.response.write(
              jsonEncode({
                'version': 8,
                'sources': {
                  'test-raster': {
                    'type': 'raster',
                    'tiles': ['$url/tile/{z}/{x}/{y}.png'],
                    // Native uses a 512px world at map zoom0; 256px would
                    // request source zoom1, outside this fixture's maxzoom0.
                    'tileSize': 512,
                    'minzoom': 0,
                    'maxzoom': 0,
                  },
                },
                'layers': [
                  {
                    'id': 'test-raster-layer',
                    'type': 'raster',
                    'source': 'test-raster',
                  },
                ],
              }),
            );
          } else {
            tileRequests++;
            await tileGate.future;
            request.response.headers.contentType = ContentType('image', 'png');
            request.response.add(png);
          }
          await request.response.close();
        } catch (_) {
          /* expected cancelled connection after native pause */
        }
      });
      final identity = WorkspaceIdentity(
        f.mapIdentity.tenantId,
        f.mapIdentity.userId,
        'native-map-${DateTime.now().microsecondsSinceEpoch}',
      );
      var w = await Workspace.open(
        identity,
        authenticatedDeviceId: f.mapDevice,
      );
      final regions = MapLibreOfflineRegions(
        access: const MapSourceAccess(allowLoopbackForTests: true),
      );
      try {
        final source = f.publicSource(url: '$url/style.json');
        final client = HttpClient();
        try {
          final response = await (await client.getUrl(
            Uri.parse('$url/style.json'),
          )).close();
          expect(response.statusCode, 200);
          final style =
              jsonDecode(await response.transform(utf8.decoder).join()) as Map;
          expect(style['version'], 8);
        } finally {
          client.close(force: true);
        }

        await f.seedMap(w, source: source);
        var store = OfflinePackageStore(w);
        await store.reconcile();
        await w.markExternalAssets();
        final m = (await store.snapshot()).manifest!;
        var id = await regions.create(m);
        for (var attempt = 0; attempt < 200 && tileRequests == 0; attempt++) {
          await Future<void>.delayed(const Duration(milliseconds: 30));
        }
        expect(
          tileRequests,
          greaterThan(0),
          reason:
              'Native error: ${regions.lastError}; total fixture requests=$requests; native status=${(await regions.status(id)).fraction}',
        );
        await regions.pause(id);
        expect((await regions.status(id)).complete, isFalse);
        await store.nativeProgress(
          signature: OfflinePackageStore.sourceSignature(m),
          regionId: id,
          progress: 0,
          bytes: 0,
          complete: false,
          paused: true,
        );
        await w.close();
        w = await Workspace.open(identity, authenticatedDeviceId: f.mapDevice);
        store = OfflinePackageStore(w);
        expect((await store.snapshot()).regionId, id);
        expect((await store.snapshot()).paused, isTrue);
        expect((await ml.getListOfRegions()).any((r) => r.id == id), isTrue);
        await regions.resume(id);
        await regions.pause(id);
        // Exercise the actual supported persisted-definition reconstruction too.
        id = await regions.create(m);
        tileGate.complete();
        await regions.resume(id);
        RegionProgress progress = await regions.status(id);
        for (var attempt = 0; attempt < 400 && !progress.complete; attempt++) {
          await Future<void>.delayed(const Duration(milliseconds: 50));
          progress = await regions.status(id);
        }
        expect(progress.complete, isTrue);
        expect(progress.bytes, greaterThan(0));
        await store.nativeProgress(
          signature: OfflinePackageStore.sourceSignature(m),
          regionId: id,
          progress: progress.fraction,
          bytes: progress.bytes,
          complete: true,
        );
        expect((await store.snapshot()).basemapReady, isTrue);
        await server.close(force: true);
        serverClosed = true;
        final stoppedRequests = requests;
        await ml.setOffline(true);
        ml.MapLibreMapController? map;
        var loaded = false;
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: ml.MapLibreMap(
                styleString: source.styleUrl,
                initialCameraPosition: const ml.CameraPosition(
                  target: ml.LatLng(0, 0),
                  zoom: 0,
                ),
                onMapCreated: (value) => map = value,
                onStyleLoadedCallback: () => loaded = true,
              ),
            ),
          ),
        );
        for (var attempt = 0; attempt < 100 && !loaded; attempt++) {
          await tester.pump(const Duration(milliseconds: 100));
        }
        expect(loaded, isTrue);
        expect(map, isNotNull);
        var rendered = false;
        for (var attempt = 0; attempt < 50 && !rendered; attempt++) {
          await tester.pump(const Duration(milliseconds: 100));
          final bytes = await map!.takeSnapshot(width: 128, height: 128);
          final codec = await ui.instantiateImageCodec(bytes);
          final frame = await codec.getNextFrame();
          final rgba = (await frame.image.toByteData(
            format: ui.ImageByteFormat.rawRgba,
          ))!;
          final offset =
              ((frame.image.height ~/ 2) * frame.image.width +
                  frame.image.width ~/ 2) *
              4;
          rendered =
              (rgba.getUint8(offset) - 232).abs() < 6 &&
              (rgba.getUint8(offset + 1) - 64).abs() < 6 &&
              (rgba.getUint8(offset + 2) - 48).abs() < 6;
          frame.image.dispose();
          codec.dispose();
        }
        expect(
          rendered,
          isTrue,
          reason: 'cached native raster pixels must render after actual fixture server shutdown',
        );
        expect(requests, stoppedRequests);
        await map!.addGeoJsonSource(
          'private-fields',
          fieldFeatures([f.field()]),
        );
        await map!.addFillLayer(
          'private-fields',
          'private-fields-fill',
          const ml.FillLayerProperties(fillColor: '#315e36'),
        );
        await map!.moveCamera(
          ml.CameraUpdate.newLatLngZoom(const ml.LatLng(50.05, 30.05), 12),
        );
        await tester.pump(const Duration(seconds: 1));
        final point = await map!.toScreenLocation(
          const ml.LatLng(50.05, 30.05),
        );
        final features = await map!.queryRenderedFeatures(
          math.Point<double>(point.x.toDouble(), point.y.toDouble()),
          ['private-fields-fill'],
          null,
        );
        expect(features, isNotEmpty);
        final nativePath = await ml.getOfflineDatabasePath();
        expect(nativePath, isNotNull);
        final nativeBytes = await File(nativePath!).readAsBytes();
        expect(
          utf8.decode(nativeBytes, allowMalformed: true),
          isNot(contains(f.field().name)),
        );
        expect(
          (await ml.getListOfRegions()).every((r) => r.metadata.isEmpty),
          isTrue,
        );
        await tester.pumpWidget(const SizedBox());
        await tester.pump();
        await w.wipeShared(externalCleanup: regions.reset);
        expect(await ml.getListOfRegions(), isEmpty);
        expect(await w.directory.exists(), isFalse);
      } finally {
        if (!tileGate.isCompleted) tileGate.complete();
        if (!serverClosed) await server.close(force: true);
        await ml.setOffline(false);
        await w.close();
        await regions.reset();
      }
    },
  );
}
