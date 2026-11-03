import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/features/tasks/task_repository.dart';
import 'package:agroplatform_mobile/features/tasks/tasks_page.dart';

import 'tasks_repository_test.dart' as fixtures;
import 'support.dart';

void main() {
  testWidgets('cached task renders action and durable pending indication', (
    tester,
  ) async {
    final root = await Directory.systemTemp.createTemp('task-widget-');
    final w = await Workspace.open(
      fixtures.taskIdentity,
      root: root,
      secrets: MemorySecrets(),
    );
    try {
      await fixtures.seedTask(w);
      await tester.pumpWidget(
        MaterialApp(
          home: TasksPage(
            repository: TaskRepository(w, verify: (_) async => true),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Назначено'), findsOneWidget);
      await tester.tap(find.text('Принять'));
      await tester.pumpAndSettle();
      expect(find.text('Принято'), findsOneWidget);
      expect(find.text('Ожидают отправки: 1'), findsOneWidget);
    } finally {
      await tester.pumpWidget(const SizedBox());
      await w.close();
      await root.delete(recursive: true);
    }
  });
}
