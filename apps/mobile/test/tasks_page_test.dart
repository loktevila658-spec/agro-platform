import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/features/tasks/task_repository.dart';
import 'package:agroplatform_mobile/features/tasks/tasks_page.dart';

import 'tasks_repository_test.dart' as fixtures;
import 'support.dart';

// Run actual Drift I/O in tester.runAsync, while widget frames use fake time.
// Only scheduling is controlled: all domain validation/queue/cache code is real.
class ScheduledTaskRepository extends TaskRepository {
  ScheduledTaskRepository(super.workspace) : super(verify: (_) async => true);
  List<TaskView> cached = [];
  Future<void> Function()? work;
  Future<void> load() async {
    cached = await super.list();
  }

  @override
  Future<List<TaskView>> list() async => cached;
  @override
  Future<void> execute(String id, String action, Map<String, Object?> payload) {
    final completion = Completer<void>();
    work = () async {
      try {
        await super.execute(id, action, payload);
        await load();
        completion.complete();
      } catch (error, stack) {
        completion.completeError(error, stack);
      }
    };
    return completion.future;
  }

  Future<void> flush() async {
    final operation = work!;
    work = null;
    await operation();
  }
}

void main() {
  testWidgets('cached task renders action and durable pending indication', (
    tester,
  ) async {
    late Directory root;
    late Workspace w;
    late ScheduledTaskRepository repository;
    await tester.runAsync(() async {
      root = await Directory.systemTemp.createTemp('task-widget-');
      w = await Workspace.open(
        fixtures.taskIdentity,
        root: root,
        secrets: MemorySecrets(),
      );
      await fixtures.seedTask(w);
      repository = ScheduledTaskRepository(w);
      await repository.load();
    });
    try {
      await tester.pumpWidget(
        MaterialApp(home: TasksPage(repository: repository)),
      );
      await tester.pumpAndSettle();
      expect(find.text('Назначено'), findsOneWidget);
      await tester.tap(find.text('Принять'));
      await tester.runAsync(repository.flush);
      await tester.pumpAndSettle();
      expect(find.text('Принято'), findsOneWidget);
      expect(find.text('Ожидают отправки: 1'), findsOneWidget);
      await tester.runAsync(() async {
        expect(await repository.queue.count(), 1);
      });
    } finally {
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(() async {
        await w.close();
        await root.delete(recursive: true);
      });
    }
  });
}
