import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/features/tasks/task_repository.dart';
import 'package:agroplatform_mobile/features/tasks/tasks_page.dart';

import 'tasks_repository_test.dart' as fixtures;
import 'support.dart';

// Observe actual encrypted-store reads; no replacement domain or persistence.
class ObservedTaskRepository extends TaskRepository {
  ObservedTaskRepository(super.workspace) : super(verify: (_) async => true);
  late Future<List<TaskView>> lastRead;
  @override
  Future<List<TaskView>> list() => lastRead = super.list();
}

void main() {
  testWidgets('cached task renders action and durable pending indication', (
    tester,
  ) async {
    late Directory root;
    late Workspace w;
    await tester.runAsync(() async {
      root = await Directory.systemTemp.createTemp('task-widget-');
      w = await Workspace.open(
        fixtures.taskIdentity,
        root: root,
        secrets: MemorySecrets(),
      );
      await fixtures.seedTask(w);
    });
    final repository = ObservedTaskRepository(w);
    final queued = Completer<void>();
    try {
      await tester.pumpWidget(
        MaterialApp(
          home: TasksPage(repository: repository, onQueued: queued.complete),
        ),
      );
      await tester.runAsync(() async {
        await repository.lastRead;
      });
      await tester.pumpAndSettle();
      expect(find.text('Назначено'), findsOneWidget);
      await tester.tap(find.text('Принять'));
      await tester.runAsync(() async {
        await queued.future;
        await repository.lastRead;
      });
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
