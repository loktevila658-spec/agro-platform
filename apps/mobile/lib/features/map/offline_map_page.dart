import 'dart:async';

import 'package:flutter/material.dart';

import '../../widgets/gis_map.dart';
import '../tasks/tasks_page.dart';
import 'offline_package.dart';
import 'offline_package_controller.dart';

class OfflineMapPage extends StatefulWidget {
  const OfflineMapPage({
    super.key,
    required this.controller,
    this.initialize = true,
    this.mapBuilder,
  });
  final OfflinePackageController controller;
  final bool initialize;
  final Widget Function(PackageSnapshot, ValueChanged<List<double>>)?
  mapBuilder;
  @override
  State<OfflineMapPage> createState() => _OfflineMapPageState();
}

class _OfflineMapPageState extends State<OfflineMapPage> {
  String? error;
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(changed);
    if (widget.initialize) {
      unawaited(
        run(() async {
          await widget.controller.reconcile();
          await widget.controller.loadChoices();
        }),
      );
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(changed);
    super.dispose();
  }

  void changed() {
    if (mounted) setState(() {});
  }

  Future<void> run(Future<void> Function() action) async {
    try {
      await action();
      if (mounted) setState(() => error = null);
    } catch (_) {
      if (mounted) {
        setState(
          () => error = 'Действие не выполнено. Проверьте разрешения, связь и свободное место; исходная команда сохранена в очереди.',
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller, s = c.view, m = s.manifest;
    const labels = {
      PackageState.waiting: 'Ожидается синхронизация',
      PackageState.vectorsReady: 'Поля сохранены · подложка не загружена',
      PackageState.downloading: 'Загрузка подложки',
      PackageState.paused: 'Загрузка приостановлена',
      PackageState.ready: 'Карта доступна без сети',
      PackageState.stale:
          'Есть новая версия источника · показаны закреплённые данные',
      PackageState.unavailable: 'Выберите область для офлайн-работы',
      PackageState.error: 'Загрузка не завершена · можно повторить',
    };
    void viewport(List<double> bounds) =>
        unawaited(run(() => c.reconcile(bounds: bounds)));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Офлайн-карта'),
        actions: [
          IconButton(
            tooltip: 'Выбрать область',
            onPressed: () => Navigator.of(context).push<void>(
              MaterialPageRoute(
                builder: (_) => _RegionSelection(controller: c),
              ),
            ),
            icon: const Icon(Icons.tune),
          ),
          IconButton(
            tooltip: 'Обновить данные',
            onPressed: m == null ? null : () => run(c.refresh),
            icon: const Icon(Icons.sync),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child:
                widget.mapBuilder?.call(s, viewport) ??
                GisMapCanvas(
                  key: ValueKey(
                    !s.visible
                        ? 'unavailable'
                        : s.basemapReady
                        ? m?.contentHash
                        : 'vectors',
                  ),
                  style: s.basemapReady && m?.source != null
                      ? m!.source!.styleUrl
                      : gisBaseStyle,
                  fields: s.fields,
                  centers: s.centers,
                  bounds: m?.selection.bounds,
                  onViewport: viewport,
                ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      labels[s.state]!,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  if (m != null) ...[
                    const SizedBox(height: 6),
                    Text(
                      'Полей: ${s.centers.length} · версия ${m.version} · ${(s.bytes / 1048576).toStringAsFixed(1)} МБ',
                    ),
                    Text('Проверено: ${m.lastValidatedAt}'),
                    if (m.source != null) Text(m.source!.attribution),
                    if (s.regionId != null && !s.basemapReady)
                      LinearProgressIndicator(value: s.progress),
                  ],
                  if (error != null || c.choiceError != null || s.error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        error ?? c.choiceError ?? 'Подложка не завершена. Повторите загрузку при подключении.',
                      ),
                    ),
                  if (c.notice != null) Text(c.notice!),
                  if (c.commandState != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        {
                              'conflict': 'Область изменилась на сервере. Выберите её заново; прежний запрос сохранён.',
                              'rejected': 'Разрешение изменилось. Выберите разрешённые поля заново.',
                            }[c.commandState] ??
                            'Запрос области ожидает синхронизации.',
                      ),
                    ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      FilledButton.icon(
                        onPressed: c.busy || m?.source == null
                            ? null
                            : () => run(c.download),
                        icon: const Icon(Icons.download),
                        label: Text(
                          s.paused || s.regionId != null
                              ? 'Продолжить'
                              : 'Скачать подложку',
                        ),
                      ),
                      if (s.regionId != null && !s.basemapReady && !s.paused)
                        OutlinedButton(
                          onPressed: () => run(c.pause),
                          child: const Text('Пауза'),
                        ),
                      if (c.tasks != null)
                        TextButton.icon(
                          onPressed: () => Navigator.of(context).push<void>(
                            MaterialPageRoute(
                              builder: (_) => TasksPage(
                                repository: c.tasks!,
                                onQueued: c.onQueued,
                              ),
                            ),
                          ),
                          icon: const Icon(Icons.assignment_outlined),
                          label: Text(
                            'Все задания · в области ${c.mapTasks.length}',
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RegionSelection extends StatefulWidget {
  const _RegionSelection({required this.controller});
  final OfflinePackageController controller;
  @override
  State<_RegionSelection> createState() => _RegionSelectionState();
}

class _RegionSelectionState extends State<_RegionSelection> {
  final selected = <String>{};
  late final List<TextEditingController> bounds;
  String? source, error;
  RangeValues zoom = const RangeValues(0, 2);
  bool saving = false;
  @override
  void initState() {
    super.initState();
    final s = widget.controller.view.manifest?.selection;
    selected.addAll(s?.targets.map((t) => t.id) ?? []);
    source = s?.sourceId;
    bounds = List.generate(
      4,
      (i) =>
          TextEditingController(text: s == null ? '' : s.bounds[i].toString()),
    );
    if (s != null) {
      zoom = RangeValues(s.minZoom.toDouble(), s.maxZoom.toDouble());
    }
    unawaited(
      widget.controller.loadChoices().then((_) {
        if (mounted) setState(() {});
      }),
    );
  }

  @override
  void dispose() {
    for (final c in bounds) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> save() async {
    setState(() => saving = true);
    try {
      final c = widget.controller;
      final targets = c.candidates
          .where((f) => selected.contains(f.id))
          .map((f) => OfflineGisTarget(id: f.id, kind: f.kind))
          .toList();
      final selection = OfflineGisSelection(
        targets: targets,
        bounds: bounds
            .map((t) => double.parse(t.text.replaceAll(',', '.')))
            .toList(),
        minZoom: zoom.start.round(),
        maxZoom: zoom.end.round(),
        sourceId: source,
      );
      await c.select(selection);
      if (mounted) Navigator.of(context).pop();
    } catch (_) {
      if (mounted) {
        setState(
          () => error =
              'Проверьте область, масштаб и разрешение на офлайн-работу.',
        );
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    return Scaffold(
      appBar: AppBar(title: const Text('Область без сети')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Выберите разрешённые поля и границы области. Команда сохранится в общей очереди; данные появятся после синхронизации.',
          ),
          const SizedBox(height: 16),
          for (var i = 0; i < 4; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: TextField(
                controller: bounds[i],
                keyboardType: const TextInputType.numberWithOptions(
                  signed: true,
                  decimal: true,
                ),
                decoration: InputDecoration(
                  labelText: [
                    'Западная долгота',
                    'Южная широта',
                    'Восточная долгота',
                    'Северная широта',
                  ][i],
                  border: const OutlineInputBorder(),
                ),
              ),
            ),
          DropdownButtonFormField<String>(
            initialValue: source,
            decoration: const InputDecoration(labelText: 'Подложка'),
            items: [
              const DropdownMenuItem<String>(
                value: null,
                child: Text('Без подложки · только поля'),
              ),
              ...c.sources.map(
                (s) => DropdownMenuItem(value: s.id, child: Text(s.label)),
              ),
            ],
            onChanged: (v) => setState(() => source = v),
          ),
          const SizedBox(height: 12),
          Text('Масштаб: ${zoom.start.round()}–${zoom.end.round()}'),
          RangeSlider(
            values: zoom,
            min: 0,
            max: 24,
            divisions: 24,
            onChanged: (v) => setState(() => zoom = v),
          ),
          if (c.candidates.isEmpty)
            Text(
              c.choiceError ??
                  'Нет разрешённых полей. Получите список при подключении.',
            ),
          for (final f in c.candidates)
            CheckboxListTile(
              title: Text(f.name),
              subtitle: Text(
                f.kind == 'FIELD_SEASON' ? 'Поле в сезоне' : 'Поле',
              ),
              value: selected.contains(f.id),
              onChanged: (v) => setState(() {
                if (v == true) {
                  selected.add(f.id);
                } else {
                  selected.remove(f.id);
                }
              }),
            ),
          if (c.nextAfter != null)
            TextButton(
              onPressed: () async {
                await c.moreChoices();
                if (mounted) setState(() {});
              },
              child: const Text('Ещё поля'),
            ),
          if (selected.any((id) => !c.candidates.any((f) => f.id == id)))
            const Text(
              'Часть выбранных полей отсутствует на текущей странице. Загрузите следующие поля или снимите выбор.',
            ),
          TextButton(
            onPressed: selected.isEmpty ? null : () => setState(selected.clear),
            child: const Text('Снять выбор'),
          ),
          if (error != null) Text(error!),
          const SizedBox(height: 12),
          FilledButton(
            onPressed:
                saving ||
                    selected.isEmpty ||
                    selected.any((id) => !c.candidates.any((f) => f.id == id))
                ? null
                : save,
            child: Text(saving ? 'Сохранение…' : 'Сохранить область'),
          ),
        ],
      ),
    );
  }
}
