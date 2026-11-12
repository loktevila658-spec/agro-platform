import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/sync.dart';
import 'package:agroplatform_mobile/features/qr/qr_payload.dart';
import 'package:agroplatform_mobile/features/qr/qr_repository.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'Android MLKit decodes a real generated QR; unresolved survives native encrypted reopen',
    (tester) async {
      const identity = WorkspaceIdentity(
        'qr-native-tenant',
        'qr-native-user',
        'qr-native',
      );
      var workspace = await Workspace.open(identity);
      final ref = QrIdentity('019a7430-0000-7000-8000-000000000001');
      var repository = QrRepository(
        workspace,
        (_, _, _) async => throw const SyncFailure('TRANSPORT_UNAVAILABLE'),
      );
      final scanner = MobileScannerController(
        autoStart: false,
        formats: [BarcodeFormat.qrCode],
      );
      final file = File('${workspace.directory.path}/qr-fixture.png');
      try {
        // White quiet zone is required; decode goes through the real Android plugin.
        final recorder = ui.PictureRecorder();
        final canvas = Canvas(recorder);
        canvas.drawColor(Colors.white, BlendMode.src);
        canvas.translate(40, 40);
        QrPainter(
          data: ref.payload,
          version: QrVersions.auto,
        ).paint(canvas, const Size(688, 688));
        final picture = recorder.endRecording();
        final image = await picture.toImage(768, 768);
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        await file.writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
        picture.dispose();
        final capture = await scanner.analyzeImage(
          file.path,
          formats: [BarcodeFormat.qrCode],
        );
        expect(
          capture?.barcodes.any((barcode) => barcode.rawValue == ref.payload),
          isTrue,
        );
        expect((await repository.resolve(ref.payload)).status, 'PENDING');
        repository.close();
        await workspace.close();
        workspace = await Workspace.open(identity);
        expect(
          await workspace.db.rows('SELECT * FROM qr_unresolved'),
          hasLength(1),
        );
        repository = QrRepository(
          workspace,
          (_, _, _) async => {
            'version': 1,
            'entityType': 'Material',
            'entityId': ref.entityId,
            'status': 'RESOLVED',
            'active': true,
            'name': 'Native fixture',
            'code': 'M1',
          },
        );
        await repository.retry();
        expect((await repository.resolve(ref.payload)).cached, isTrue);
        expect(await workspace.db.rows('SELECT * FROM qr_unresolved'), isEmpty);
        // Actual camera permission is not a prerequisite for this image/manual flow.
      } finally {
        await scanner.dispose();
        repository.close();
        await workspace.wipeShared();
      }
    },
  );
}
