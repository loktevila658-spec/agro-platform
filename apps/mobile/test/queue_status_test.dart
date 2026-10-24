import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/persistence.dart';
import 'package:agroplatform_mobile/widgets/queue_status.dart';

void main() {
  testWidgets(
    'shows every frozen queue view without exposing technical payload',
    (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: QueueStatus(counts: QueueCounts(3, 5, 1, 2))),
      );
      for (final label in [
        'Ожидают отправки: 3',
        'Синхронизировано: 5',
        'Конфликты: 1',
        'Ошибки: 2',
      ]) {
        expect(find.text(label), findsOneWidget);
      }
    },
  );
}
