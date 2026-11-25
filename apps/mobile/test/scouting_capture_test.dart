import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/features/scouting/scouting_capture.dart';
import 'package:agroplatform_mobile/features/scouting/scouting_commands.dart';
import 'package:agroplatform_mobile/generated/contracts.dart';

import 'scouting_repository_test.dart' as f;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  tearDown(
    () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(ScoutingCapture.channel, null),
  );
  test('denied GPS/cancelled media never manufactures evidence', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(ScoutingCapture.channel, (call) async {
          if (call.method == 'location') {
            throw PlatformException(code: 'PERMISSION_DENIED');
          }
          return null;
        });
    await expectLater(
      const ScoutingCapture().location(),
      throwsA(isA<PlatformException>()),
    );
    expect(await const ScoutingCapture().media('PHOTO'), isNull);
    expect(scoutingDraft(f.fixture()).attachmentIds, isEmpty);
  });
  test(
    'GPS accuracy and source are retained exactly and invalid values reject',
    () async {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(
            ScoutingCapture.channel,
            (call) async => {
              'latitude': 54.123456789,
              'longitude': 36.12,
              'accuracyMetres': 8.21,
              'provider': 'gps',
              'observedAt': '2026-11-25T08:00:00Z',
            },
          );
      final l = await const ScoutingCapture().location();
      expect(l!.accuracyMetres, 8.21);
      expect(l.latitude, 54.123456789);
      expect(l.provider, 'gps');
      final d = f.fixture();
      expect(
        () => validateScouting(
          ScoutingObservationData(
            organizationId: d.organizationId,
            fieldSeasonId: d.fieldSeasonId,
            sourceType: 'USER_MOBILE',
            observationType: 'GENERAL',
            note: 'x',
            anomaly: false,
            location: const ScoutingLocation(
              latitude: 91,
              longitude: 0,
              accuracyMetres: 1,
              observedAt: '2026-11-25T00:00:00Z',
              provider: 'gps',
            ),
          ),
        ),
        throwsStateError,
      );
    },
  );
}
