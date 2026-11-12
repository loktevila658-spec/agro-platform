import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

class QrCamera extends StatefulWidget {
  const QrCamera({super.key, required this.onScan});
  final ValueChanged<String> onScan;
  @override
  State<QrCamera> createState() => _QrCameraState();
}

class _QrCameraState extends State<QrCamera> {
  final controller = MobileScannerController(
    formats: [BarcodeFormat.qrCode],
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  bool accepted = false;
  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MobileScanner(
    controller: controller,
    errorBuilder: (context, error) => const Center(
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Text(
          'Камера недоступна. Закройте сканер и введите код вручную.',
        ),
      ),
    ),
    onDetect: (capture) {
      for (final barcode in capture.barcodes) {
        final value = barcode.rawValue;
        if (!accepted && value != null) {
          accepted = true;
          widget.onScan(value);
          break;
        }
      }
    },
  );
}
