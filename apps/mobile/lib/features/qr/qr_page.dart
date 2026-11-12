import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'qr_camera.dart';
import 'qr_repository.dart';

class QrPage extends StatefulWidget {
  const QrPage({super.key, required this.repository});
  final QrRepository repository;
  @override
  State<QrPage> createState() => _QrPageState();
}

class _QrPageState extends State<QrPage> {
  final input = TextEditingController();
  final materialId = TextEditingController();
  QrView? result;
  String? payload, error;
  bool busy = false, camera = false;
  @override
  void dispose() {
    input.dispose();
    materialId.dispose();
    super.dispose();
  }

  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
      result = null;
      payload = null;
    });
    try {
      await action();
    } catch (_) {
      if (mounted)
        setState(
          () => error = 'Не удалось прочитать или разрешить код. Проверьте формат, подключение и доступ.',
        );
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> resolve(String value, {bool refresh = false}) => run(() async {
    final view = await widget.repository.resolve(value, refresh: refresh);
    if (mounted) setState(() => result = view);
  });
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('QR · Материалы')),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text(
          'Найти материал',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 8),
        const Text(
          'Сканируйте внутренний QR или вставьте код. Сначала откроется предварительный просмотр.',
        ),
        const SizedBox(height: 24),
        if (camera) ...[
          SizedBox(
            height: 260,
            child: QrCamera(
              onScan: (value) {
                setState(() {
                  camera = false;
                  input.text = value;
                });
                resolve(value);
              },
            ),
          ),
          TextButton(
            onPressed: () => setState(() => camera = false),
            child: const Text('Закрыть сканер'),
          ),
        ] else
          OutlinedButton.icon(
            onPressed: busy ? null : () => setState(() => camera = true),
            icon: const Icon(Icons.qr_code_scanner),
            label: const Text('Сканировать QR'),
          ),
        const SizedBox(height: 16),
        TextField(
          controller: input,
          enabled: !busy,
          maxLength: 512,
          decoration: const InputDecoration(
            labelText: 'Код QR',
            hintText: 'agro://v1/Material/…',
            border: OutlineInputBorder(),
          ),
          onSubmitted: resolve,
        ),
        FilledButton(
          onPressed: busy ? null : () => resolve(input.text),
          child: const Text('Найти'),
        ),
        if (busy)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator()),
          ),
        if (error != null)
          Semantics(
            liveRegion: true,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Text(error!),
            ),
          ),
        if (result != null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(switch (result!.status) {
                  'RESOLVED' => result!.name ?? 'Материал',
                  'PENDING' => 'Сохранено для повторного поиска',
                  'DENIED' => 'Доступ запрещён',
                  _ => 'Материал недоступен',
                }, style: Theme.of(context).textTheme.titleLarge),
                if (result!.code != null) Text(result!.code!),
                Text(result!.identity.entityId),
                if (result!.cached)
                  const Text(
                    'Локальная копия. Текущий доступ проверяется сервером при обновлении.',
                  ),
                if (result!.status == 'PENDING')
                  const Text(
                    'Код сохранён на устройстве. Поиск повторится после подключения.',
                  ),
                TextButton(
                  onPressed: busy
                      ? null
                      : () => resolve(input.text, refresh: true),
                  child: const Text('Проверить на сервере'),
                ),
              ],
            ),
          ),
        const Divider(height: 48),
        Text('QR для материала', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        const Text(
          'Укажите существующий UUID материала. Выпуск проверяет доступ и сохраняет provenance на сервере.',
        ),
        const SizedBox(height: 16),
        TextField(
          controller: materialId,
          enabled: !busy,
          decoration: const InputDecoration(
            labelText: 'UUID материала',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 16),
        OutlinedButton(
          onPressed: busy
              ? null
              : () => run(() async {
                  final value = await widget.repository.create(materialId.text);
                  if (mounted) setState(() => payload = value);
                }),
          child: const Text('Создать QR'),
        ),
        if (payload != null) ...[
          const SizedBox(height: 24),
          Center(
            child: Semantics(
              label: 'QR материала',
              child: QrImageView(
                data: payload!,
                size: 240,
                backgroundColor: Colors.white,
              ),
            ),
          ),
          SelectableText(payload!),
        ],
      ],
    ),
  );
}
