import 'package:flutter/material.dart';

import 'task_repository.dart';

const taskLabels = <String, String>{
  'ASSIGNED': 'Назначено',
  'ACCEPTED': 'Принято',
  'IN_PROGRESS': 'В работе',
  'PAUSED': 'Приостановлено',
  'COMPLETED': 'Выполнено',
  'VERIFIED': 'Проверено',
  'CLOSED': 'Закрыто',
  'DRAFT': 'Черновик',
  'PLANNED': 'Запланировано',
  'RETURNED': 'Возвращено',
  'CANCELLED': 'Отменено',
  'ABORTED': 'Прервано',
};
const actionLabels = <String, String>{
  'Accept': 'Принять',
  'Start': 'Начать',
  'Pause': 'Пауза',
  'Resume': 'Продолжить',
  'Complete': 'Завершить',
};

class TasksPage extends StatefulWidget {
  const TasksPage({super.key, required this.repository, this.onQueued});
  final TaskRepository repository;
  final VoidCallback? onQueued;
  @override
  State<TasksPage> createState() => _TasksPageState();
}

class _TasksPageState extends State<TasksPage> {
  late Future<List<TaskView>> tasks;
  bool busy = false;
  @override
  void initState() {
    super.initState();
    tasks = widget.repository.list();
  }

  void refresh() {
    setState(() => tasks = widget.repository.list());
  }

  Future<void> execute(TaskView view, String action) async {
    final payload = <String, Object?>{};
    if (action == 'Pause' || action == 'Complete') {
      var input = '';

      final result = await showDialog<String>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(actionLabels[action]!),
          content: TextField(
            onChanged: (value) => input = value,
            autofocus: true,
            keyboardType: action == 'Complete'
                ? const TextInputType.numberWithOptions(decimal: true)
                : TextInputType.text,
            decoration: InputDecoration(
              labelText: action == 'Complete'
                  ? 'Фактический объём, ${view.task.definition.uom ?? "единица не задана"}'
                  : 'Причина паузы',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Отмена'),
            ),
            FilledButton(
              onPressed: () {
                if (input.trim().isNotEmpty)
                  Navigator.pop(context, input.trim());
              },
              child: const Text('Сохранить'),
            ),
          ],
        ),
      );
      if (result == null || !mounted) return;
      if (action == 'Complete') {
        payload['actualQty'] = result.replaceAll(',', '.');
        payload['uom'] = view.task.definition.uom;
      } else {
        payload['reason'] = result;
      }
    }
    if (!mounted) return;
    setState(() => busy = true);
    try {
      await widget.repository.execute(view.task.id, action, payload);
      widget.onQueued?.call();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Сохранено на устройстве. Ожидает синхронизации.'),
          ),
        );
        refresh();
      }
    } catch (_) {
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Не удалось сохранить. Проверьте объём, право на действие и состояние задания.',
            ),
          ),
        );
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Задания'),
      actions: [
        IconButton(
          onPressed: busy ? null : refresh,
          tooltip: 'Обновить локальные данные',
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: FutureBuilder<List<TaskView>>(
      future: tasks,
      builder: (context, snapshot) {
        if (snapshot.hasError)
          return const Center(
            child: Text(
              'Локальные данные недоступны. Откройте рабочее пространство заново.',
            ),
          );
        if (!snapshot.hasData)
          return const Center(child: CircularProgressIndicator());
        final rows = snapshot.data!;
        if (rows.isEmpty)
          return const Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'Нет загруженных заданий. Подключитесь к Local Server для синхронизации назначений.',
            ),
          );
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: rows.length,
          separatorBuilder: (context, index) => const Divider(height: 32),
          itemBuilder: (context, index) {
            final view = rows[index], task = view.task;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Поле ${task.definition.targetId}',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                Text(taskLabels[task.status] ?? task.status),
                if (task.definition.plannedQty != null)
                  Text(
                    'План: ${task.definition.plannedQty} ${task.definition.uom ?? ""}',
                  ),
                if (view.pending > 0) Text('Ожидают отправки: ${view.pending}'),
                if (view.attention)
                  const Text(
                    'Требует внимания. Исходное действие сохранено; автоматического повторения нет.',
                  ),
                if (view.actions.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Wrap(
                      spacing: 12,
                      runSpacing: 8,
                      children: [
                        for (final action in view.actions)
                          OutlinedButton(
                            onPressed: busy
                                ? null
                                : () => execute(view, action),
                            child: Text(actionLabels[action]!),
                          ),
                      ],
                    ),
                  ),
              ],
            );
          },
        );
      },
    ),
  );
}
