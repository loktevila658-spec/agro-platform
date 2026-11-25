import 'package:flutter/material.dart';

import '../../generated/contracts.dart';
import 'scouting_capture.dart';
import 'scouting_repository.dart';

class ScoutingPage extends StatefulWidget {
  const ScoutingPage({
    super.key,
    required this.repository,
    this.capture = const ScoutingCapture(),
    this.onQueued,
  });
  final ScoutingRepository repository;
  final ScoutingCapture capture;
  final VoidCallback? onQueued;
  @override
  State<ScoutingPage> createState() => _ScoutingPageState();
}

class _ScoutingPageState extends State<ScoutingPage> {
  List<ScoutingContext> contexts = [];
  List<ScoutingIntent> intents = [];
  bool busy = true;
  String? error;
  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<void> reload({bool online = false}) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (online) {
        await widget.repository.refreshContexts();
      }
      final c = await widget.repository.contexts(),
          i = await widget.repository.intents();
      if (mounted) {
        setState(() {
          contexts = c;
          intents = i;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => error = 'Не удалось обновить данные. Сохранённые записи доступны без связи.',
        );
      }
    } finally {
      if (mounted) {
        setState(() => busy = false);
      }
    }
  }

  Future<void> create() async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ScoutingFormPage(
          repository: widget.repository,
          contexts: contexts,
          capture: widget.capture,
        ),
      ),
    );
    if (saved == true) {
      widget.onQueued?.call();
      await reload();
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Наблюдения полей'),
      actions: [
        IconButton(
          tooltip: 'Обновить с локального сервера',
          onPressed: busy ? null : () => reload(online: true),
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    floatingActionButton: contexts.isEmpty
        ? null
        : FloatingActionButton.extended(
            onPressed: busy ? null : create,
            icon: const Icon(Icons.add),
            label: const Text('Наблюдение'),
          ),
    body: busy
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            children: [
              if (error != null) Text(error!, semanticsLabel: error),
              if (contexts.isEmpty)
                const Text(
                  'Нет сохранённых полей и сезонов. Обновите доступные поля при связи с локальным сервером.',
                ),
              if (intents.isEmpty && contexts.isNotEmpty)
                const Text(
                  'Запишите состояние поля. GPS, фото и голос можно добавить по желанию.',
                ),
              for (final i in intents)
                ListTile(
                  leading: Icon(
                    i.attention
                        ? Icons.error_outline
                        : i.status == 'confirmed'
                        ? Icons.check_circle_outline
                        : Icons.schedule,
                  ),
                  title: Text(i.data['note'] as String? ?? ''),
                  subtitle: Text(
                    i.status == 'confirmed'
                        ? 'Принято сервером'
                        : i.attention
                        ? 'Требует внимания: ${i.result?['code'] ?? i.status}'
                        : 'Сохранено на устройстве · ожидает синхронизации',
                  ),
                  onTap: () => showDialog<void>(
                    context: context,
                    builder: (c) => AlertDialog(
                      title: const Text('Наблюдение'),
                      content: SingleChildScrollView(
                        child: Text(
                          '${i.data['note']}\nПоле/сезон: ${i.data['fieldSeasonId']}\n${i.data['location'] == null ? 'GPS не добавлен' : 'GPS сохранён с точностью и временем'}\nФото и голос загружаются отдельно. Исходная запись сохранена.',
                        ),
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(c),
                          child: const Text('Закрыть'),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
  );
}

class ScoutingFormPage extends StatefulWidget {
  const ScoutingFormPage({
    super.key,
    required this.repository,
    required this.contexts,
    required this.capture,
  });
  final ScoutingRepository repository;
  final List<ScoutingContext> contexts;
  final ScoutingCapture capture;
  @override
  State<ScoutingFormPage> createState() => _ScoutingFormPageState();
}

class _ScoutingFormPageState extends State<ScoutingFormPage> {
  final note = TextEditingController();
  ScoutingContext? selected;
  String type = 'GENERAL';
  bool anomaly = false, busy = false, recording = false;
  String? error;
  ScoutingLocation? location;
  final media = <String>[];
  @override
  void initState() {
    super.initState();
    selected = widget.contexts.isEmpty ? null : widget.contexts.first;
  }

  @override
  void dispose() {
    note.dispose();
    super.dispose();
  }

  Future<void> action(Future<void> Function() fn) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await fn();
    } catch (_) {
      if (mounted) {
        setState(
          () => error = 'Действие недоступно или разрешение не выдано. Можно сохранить текст без GPS, фото и голоса.',
        );
      }
    } finally {
      if (mounted) {
        setState(() => busy = false);
      }
    }
  }

  Future<void> addMedia(String kind) async {
    final value = await widget.capture.media(kind);
    if (value != null) {
      final id = await widget.capture.stage(
        widget.repository.workspace,
        value,
        selected!.fieldSeasonId,
      );
      if (mounted) {
        setState(() => media.add(id));
      }
    }
  }

  Future<void> save() async {
    final s = selected;
    if (s == null) {
      return;
    }
    await widget.repository.capture(
      ScoutingObservationData(
        organizationId: s.organizationId,
        fieldSeasonId: s.fieldSeasonId,
        observationType: type,
        note: note.text,
        anomaly: anomaly,
        sourceType: 'USER_MOBILE',
        location: location,
      ),
      attachmentIds: media,
    );
    if (mounted) {
      Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Новое наблюдение')),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        DropdownButtonFormField<ScoutingContext>(
          initialValue: selected,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Поле и сезон'),
          items: [
            for (final c in widget.contexts)
              DropdownMenuItem(
                value: c,
                child: Text(
                  '${c.fieldId} / ${c.seasonId}',
                  overflow: TextOverflow.ellipsis,
                ),
              ),
          ],
          onChanged: busy || media.isNotEmpty
              ? null
              : (v) => setState(() => selected = v),
        ),
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
          initialValue: type,
          decoration: const InputDecoration(labelText: 'Тип наблюдения'),
          items: const [
            DropdownMenuItem(value: 'GENERAL', child: Text('Общее')),
            DropdownMenuItem(value: 'SOIL', child: Text('Почва')),
            DropdownMenuItem(value: 'EMERGENCE', child: Text('Всходы')),
            DropdownMenuItem(value: 'WEED', child: Text('Сорняки')),
            DropdownMenuItem(value: 'PEST', child: Text('Вредители')),
            DropdownMenuItem(
              value: 'DISEASE',
              child: Text('Признаки повреждения'),
            ),
          ],
          onChanged: busy ? null : (v) => setState(() => type = v!),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: note,
          maxLength: 4000,
          minLines: 3,
          maxLines: 8,
          decoration: const InputDecoration(
            labelText: 'Что вы наблюдаете',
            helperText: 'Опишите признаки. Наблюдение не является диагнозом.',
          ),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Требуется последующая проверка'),
          subtitle: const Text('Задача создаётся отдельной явной командой.'),
          value: anomaly,
          onChanged: busy ? null : (v) => setState(() => anomaly = v),
        ),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: busy
                  ? null
                  : () => action(() async {
                      final l = await widget.capture.location();
                      if (mounted) {
                        setState(() => location = l);
                      }
                    }),
              icon: const Icon(Icons.my_location),
              label: const Text('Добавить GPS'),
            ),
            OutlinedButton.icon(
              onPressed: busy || selected == null
                  ? null
                  : () => action(() => addMedia('PHOTO')),
              icon: const Icon(Icons.camera_alt_outlined),
              label: const Text('Фото'),
            ),
            OutlinedButton.icon(
              onPressed: busy || selected == null
                  ? null
                  : () => action(() => addMedia('PHOTO_IMPORT')),
              icon: const Icon(Icons.image_outlined),
              label: const Text('Выбрать фото'),
            ),
            OutlinedButton.icon(
              onPressed: busy || selected == null
                  ? null
                  : () => action(() async {
                      if (recording) {
                        final value = await ScoutingCapture.channel
                            .invokeMapMethod<String, Object?>('recordStop');
                        recording = false;
                        if (value != null) {
                          final id = await widget.capture.stage(
                            widget.repository.workspace,
                            value,
                            selected!.fieldSeasonId,
                          );
                          if (mounted) {
                            setState(() => media.add(id));
                          }
                        }
                      } else {
                        await ScoutingCapture.channel.invokeMethod<void>(
                          'recordStart',
                        );
                        if (mounted) {
                          setState(() => recording = true);
                        }
                      }
                    }),
              icon: Icon(recording ? Icons.stop : Icons.mic_none),
              label: Text(recording ? 'Остановить запись' : 'Записать голос'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Text(
          location == null
              ? 'GPS не добавлен'
              : 'GPS: ±${location!.accuracyMetres} м · ${location!.provider}',
        ),
        Text(
          'Вложений: ${media.length}. Загружаются независимо от наблюдения.',
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(
              error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        const SizedBox(height: 24),
        FilledButton(
          onPressed: busy || recording || selected == null
              ? null
              : () => action(save),
          child: Text(busy ? 'Сохранение…' : 'Сохранить на устройстве'),
        ),
      ],
    ),
  );
}
