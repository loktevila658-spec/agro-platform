import 'package:flutter/material.dart';

import '../../generated/contracts.dart';
import 'actual_operation_repository.dart';

class ActualOperationsPage extends StatefulWidget {
  const ActualOperationsPage({
    super.key,
    required this.repository,
    this.onQueued,
  });
  final ActualOperationRepository repository;
  final VoidCallback? onQueued;
  @override
  State<ActualOperationsPage> createState() => _ActualOperationsPageState();
}

class _ActualOperationsPageState extends State<ActualOperationsPage> {
  List<ActualCaptureContext> contexts = [];
  List<ActualOperationIntent> intents = [];
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
      if (online) await widget.repository.refreshContexts();
      final c = await widget.repository.contexts(),
          i = await widget.repository.intents();
      if (mounted)
        setState(() {
          contexts = c;
          intents = i;
        });
    } catch (_) {
      if (mounted)
        setState(
          () => error = 'Не удалось обновить данные. Повторите при связи с локальным сервером.',
        );
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> capture() async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ActualCaptureForm(
          repository: widget.repository,
          contexts: contexts,
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
      title: const Text('Выполненные операции'),
      actions: [
        IconButton(
          tooltip: 'Обновить с сервера',
          onPressed: busy ? null : () => reload(online: true),
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    floatingActionButton: contexts.isEmpty
        ? null
        : FloatingActionButton.extended(
            onPressed: busy ? null : capture,
            icon: const Icon(Icons.add),
            label: const Text('Записать факт'),
          ),
    body: busy
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            children: [
              if (error != null)
                Text(
                  error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              if (contexts.isEmpty)
                const Text(
                  'Нет загруженных полей. Обновите данные и разрешения при связи с локальным сервером.',
                ),
              if (contexts.isNotEmpty && intents.isEmpty)
                const Text(
                  'Пока нет записей. Факт можно сохранить без связи после загрузки разрешений.',
                ),
              for (final i in intents)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                    i.data['taskId'] == null
                        ? 'Операция ${i.data['actualQuantity']} ${i.data['unit']}'
                        : 'Факт по заданию',
                  ),
                  subtitle: Text(
                    '${i.data['fieldSeasonId']}\n${i.attention
                        ? 'Требуется проверка · исходные данные сохранены'
                        : i.status == 'confirmed'
                        ? 'Передано на сервер · ожидает проверки'
                        : 'Сохранено на устройстве · ожидает отправки'}',
                  ),
                  trailing: Icon(
                    i.attention
                        ? Icons.error_outline
                        : i.status == 'confirmed'
                        ? Icons.cloud_done_outlined
                        : Icons.cloud_upload_outlined,
                  ),
                  onTap: () => Navigator.of(context).push<void>(
                    MaterialPageRoute(
                      builder: (_) => Scaffold(
                        appBar: AppBar(title: const Text('Сохранённый факт')),
                        body: ListView(
                          padding: const EdgeInsets.all(16),
                          children: [
                            for (final e in i.data.entries)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 12),
                                child: SelectableText(
                                  '${actualLabel(e.key)}: ${e.value}',
                                ),
                              ),
                            if (i.attention)
                              const Text(
                                'Исходные значения сохранены. Обратитесь к агроному для проверки и корректировки.',
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
  );
}

String actualLabel(String k) =>
    const {
      'fieldSeasonId': 'Поле и сезон',
      'organizationId': 'Организация',
      'operationTypeId': 'Вид операции',
      'taskId': 'Задание',
      'startedAt': 'Начало',
      'completedAt': 'Окончание',
      'actualQuantity': 'Фактический объём',
      'unit': 'Единица',
      'materials': 'Материалы',
      'labor': 'Труд',
      'executors': 'Исполнители',
      'sourceType': 'Источник',
      'comment': 'Комментарий',
    }[k] ??
    k;

class ActualCaptureForm extends StatefulWidget {
  const ActualCaptureForm({
    super.key,
    required this.repository,
    required this.contexts,
  });
  final ActualOperationRepository repository;
  final List<ActualCaptureContext> contexts;
  @override
  State<ActualCaptureForm> createState() => _ActualCaptureFormState();
}

class _Resource {
  final reference = TextEditingController(),
      quantity = TextEditingController(),
      unit = TextEditingController();
  void dispose() {
    reference.dispose();
    quantity.dispose();
    unit.dispose();
  }
}

class _ActualCaptureFormState extends State<ActualCaptureForm> {
  final fields = {
    for (final k in [
      'task',
      'operation',
      'start',
      'end',
      'quantity',
      'unit',
      'executors',
      'comment',
      'map',
      'revision',
      'planned',
    ])
      k: TextEditingController(),
  };
  final materials = <_Resource>[], labor = <_Resource>[];
  ActualCaptureContext? selected;
  bool linked = false, busy = false;
  String? error;
  @override
  void dispose() {
    for (final c in fields.values) {
      c.dispose();
    }
    for (final r in [...materials, ...labor]) {
      r.dispose();
    }
    super.dispose();
  }

  Widget field(
    String k,
    String label, {
    String? helper,
    bool numeric = false,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: TextField(
      controller: fields[k],
      enabled: !busy,
      keyboardType: numeric
          ? const TextInputType.numberWithOptions(decimal: true)
          : TextInputType.text,
      decoration: InputDecoration(labelText: label, helperText: helper),
    ),
  );
  Future<void> save() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final c = selected;
      if (c == null) throw StateError('CONTEXT_REQUIRED');
      String v(String k) => fields[k]!.text.trim();
      if (!linked &&
          [
            'start',
            'end',
          ].any((k) => !RegExp(r'(Z|[+-][0-9]{2}:[0-9]{2})$').hasMatch(v(k))))
        throw StateError('TIMEZONE_REQUIRED');
      final p = [v('map'), v('revision'), v('planned')];
      final d = ActualCapture(
        organizationId: c.organizationId,
        fieldSeasonId: c.fieldSeasonId,
        sourceType: 'USER_MOBILE',
        taskId: linked ? v('task') : null,
        operationTypeId: linked ? null : v('operation'),
        startedAt: linked
            ? null
            : DateTime.parse(v('start')).toUtc().toIso8601String(),
        completedAt: linked
            ? null
            : DateTime.parse(v('end')).toUtc().toIso8601String(),
        actualQuantity: linked ? null : v('quantity'),
        unit: linked ? null : v('unit'),
        executors: linked
            ? null
            : v('executors').split(',').map((s) => s.trim()).toList(),
        materials: materials
            .map(
              (r) => ActualMaterial(
                materialId: r.reference.text.trim(),
                quantity: r.quantity.text.trim(),
                unit: r.unit.text.trim(),
              ),
            )
            .toList(),
        labor: labor
            .map(
              (r) => ActualLabor(
                employeeId: r.reference.text.trim(),
                quantity: r.quantity.text.trim(),
                unit: r.unit.text.trim(),
              ),
            )
            .toList(),
        comment: v('comment').isEmpty ? null : v('comment'),
        plannedOperation: p.every((s) => s.isEmpty)
            ? null
            : ActualPlannedOperation(
                mapId: p[0],
                revisionId: p[1],
                operationId: p[2],
              ),
      );
      await widget.repository.capture(d);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted)
        setState(
          () => error = e.toString().contains('OFFLINE_PERMISSION_DENIED')
              ? 'Нет действующего разрешения. Обновите разрешения на локальном сервере. Введённые значения сохранены в форме.'
              : 'Проверьте поле, ссылки, время с часовым поясом, объём и единицы. Введённые значения сохранены в форме.',
        );
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget resources(String title, List<_Resource> rows, String label) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(title, style: Theme.of(context).textTheme.titleMedium),
      for (final r in rows)
        Padding(
          padding: const EdgeInsets.only(top: 12, bottom: 16),
          child: Column(
            children: [
              TextField(
                controller: r.reference,
                enabled: !busy,
                decoration: InputDecoration(labelText: label),
              ),
              TextField(
                controller: r.quantity,
                enabled: !busy,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Фактическое количество',
                ),
              ),
              TextField(
                controller: r.unit,
                enabled: !busy,
                decoration: const InputDecoration(labelText: 'Код единицы'),
              ),
              TextButton(
                onPressed: busy
                    ? null
                    : () {
                        setState(() => rows.remove(r));
                        r.dispose();
                      },
                child: const Text('Убрать строку'),
              ),
            ],
          ),
        ),
      TextButton.icon(
        onPressed: busy || rows.length >= 100
            ? null
            : () => setState(() => rows.add(_Resource())),
        icon: const Icon(Icons.add),
        label: Text('Добавить: $title'),
      ),
    ],
  );
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Новый факт')),
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        DropdownButtonFormField<String>(
          initialValue: selected?.fieldSeasonId,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Поле и сезон'),
          items: widget.contexts
              .map(
                (c) => DropdownMenuItem(
                  value: c.fieldSeasonId,
                  child: Text(c.fieldSeasonId, overflow: TextOverflow.ellipsis),
                ),
              )
              .toList(),
          onChanged: busy
              ? null
              : (id) => setState(
                  () => selected = widget.contexts.firstWhere(
                    (c) => c.fieldSeasonId == id,
                  ),
                ),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('По завершённому заданию'),
          subtitle: const Text(
            'Время, объём и исполнители будут взяты из задания',
          ),
          value: linked,
          onChanged: busy ? null : (v) => setState(() => linked = v),
        ),
        if (linked)
          field('task', 'Ссылка на задание')
        else ...[
          field('operation', 'Ссылка на вид операции'),
          field(
            'start',
            'Фактическое начало',
            helper: 'Дата, время и часовой пояс (ISO 8601)',
          ),
          field(
            'end',
            'Фактическое окончание',
            helper: 'Дата, время и часовой пояс (ISO 8601)',
          ),
          field('quantity', 'Фактический объём', numeric: true),
          field('unit', 'Код единицы'),
          field(
            'executors',
            'Ссылки на исполнителей',
            helper: 'Несколько ссылок разделяются запятой',
          ),
        ],
        const SizedBox(height: 16),
        resources('Материалы', materials, 'Ссылка на материал / продукт'),
        const SizedBox(height: 24),
        resources('Труд', labor, 'Ссылка на сотрудника'),
        ExpansionTile(
          tilePadding: EdgeInsets.zero,
          title: const Text('Связь с планом (необязательно)'),
          children: [
            field('map', 'Ссылка на техкарту'),
            field('revision', 'Ссылка на опубликованную версию'),
            field('planned', 'Ссылка на плановую операцию'),
          ],
        ),
        const SizedBox(height: 16),
        field('comment', 'Комментарий (необязательно)'),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(
              error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        FilledButton(
          onPressed: busy ? null : save,
          child: Text(busy ? 'Сохранение…' : 'Сохранить на устройстве'),
        ),
        const SizedBox(height: 12),
        const Text(
          'Запись будет отправлена после восстановления связи. Подтверждение выполняется агрономом на сервере.',
        ),
      ],
    ),
  );
}
