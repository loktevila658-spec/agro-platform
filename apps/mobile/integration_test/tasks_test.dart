import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/features/tasks/task_repository.dart';

import '../test/tasks_repository_test.dart' as fixtures;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('native task intent encrypted persistence/reopen/shared wipe', (
    tester,
  ) async {
    var w = await Workspace.open(fixtures.taskIdentity);
    try {
      await fixtures.seedTask(w);
      final r = TaskRepository(w, verify: (_) async => true);
      await r.execute(fixtures.taskId, 'Accept', {});
      await r.execute(fixtures.taskId, 'Start', {});
      final ids = await w.db.rows(
        'SELECT local_command_id FROM sync_outbox ORDER BY device_seq',
      );
      await w.close();
      w = await Workspace.open(fixtures.taskIdentity);
      expect(
        (await TaskRepository(
          w,
          verify: (_) async => true,
        ).current(fixtures.taskId))!.status,
        'IN_PROGRESS',
      );
      expect(
        await w.db.rows(
          'SELECT local_command_id FROM sync_outbox ORDER BY device_seq',
        ),
        ids,
      );
    } finally {
      await w.wipeShared();
    }
  });
}
