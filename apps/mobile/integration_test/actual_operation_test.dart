import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/features/agronomy/actual_operation_repository.dart';

import '../test/actual_operation_repository_test.dart' as f;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'native encrypted actual capture reopens unchanged and shared-device wipe removes it',
    (tester) async {
      var w = await Workspace.open(f.actualIdentity);
      final directory = w.directory.path;
      try {
        await f.seedActual(w);
        var r = ActualOperationRepository(w, verify: (_) async => true);
        final id = await r.capture(f.actualFixture()),
            before = (await r.queue.get(id))!;
        await w.close();
        w = await Workspace.open(f.actualIdentity);
        r = ActualOperationRepository(w, verify: (_) async => true);
        expect(
          (await r.queue.get(id))!.data['payload_json'],
          before.data['payload_json'],
        );
        expect((await r.intents()).single.status, 'pending');
        expect((await r.intents()).single.data['actualQuantity'], '1.25');
      } finally {
        await w.wipeShared();
      }
      expect(await File('$directory/workspace.db').exists(), false);
    },
  );
}
