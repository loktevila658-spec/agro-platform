import 'package:flutter/services.dart';
import 'package:agroplatform_mobile/features/scouting/scouting_capture.dart';

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/features/scouting/scouting_repository.dart';

import '../test/scouting_repository_test.dart' as f;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets(
    'native scouting channel rejects unsupported capture without hardware',
    (tester) async {
      await expectLater(
        ScoutingCapture.channel.invokeMethod<void>('media', {
          'kind': 'UNSUPPORTED',
        }),
        throwsA(isA<PlatformException>()),
      );
    },
  );
  testWidgets(
    'native encrypted scouting capture reopens unchanged and shared-device wipe removes it',
    (tester) async {
      var w = await Workspace.open(f.identity);
      final directory = w.directory.path;
      try {
        await f.seed(w);
        var r = ScoutingRepository(w, verify: (_) async => true);
        final id = await r.capture(f.fixture()),
            before = (await r.queue.get(id))!;
        await w.close();
        w = await Workspace.open(f.identity);
        r = ScoutingRepository(w, verify: (_) async => true);
        expect(
          (await r.queue.get(id))!.data['payload_json'],
          before.data['payload_json'],
        );
        expect((await r.intents()).single.status, 'pending');
        expect((await r.intents()).single.data['note'], 'Сухая почва');
      } finally {
        await w.wipeShared();
      }
      expect(await File('$directory/workspace.db').exists(), false);
    },
  );
}
