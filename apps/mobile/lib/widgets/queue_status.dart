import 'package:flutter/material.dart';

import '../persistence/models.dart';

class QueueStatus extends StatelessWidget {
  const QueueStatus({super.key, required this.counts});
  final QueueCounts counts;
  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Wrap(
      spacing: 16,
      children: [
        Text('Ожидают отправки: ${counts.pending}'),
        Text('Синхронизировано: ${counts.synced}'),
        Text('Конфликты: ${counts.conflict}'),
        Text('Ошибки: ${counts.failed}'),
      ],
    ),
  );
}
