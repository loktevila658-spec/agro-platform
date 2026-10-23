import { Module } from '@nestjs/common';

import { NotificationEventConsumer } from './notification-event-consumer';
import { NOTIFICATION_RULES } from './notifications.tokens';

@Module({
  providers: [
    { provide: NOTIFICATION_RULES, useValue: [] },
    NotificationEventConsumer,
  ],
  exports: [NotificationEventConsumer],
})
export class NotificationsModule {}
