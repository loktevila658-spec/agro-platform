import { Module } from '@nestjs/common';
import { Pool } from 'pg';

import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationEventConsumer } from '../notifications/notification-event-consumer';
import { EVENTS_POOL, EVENT_HANDLERS } from './events.tokens';
import { InboxService } from './inbox.service';
import { OutboxDispatcherService } from './outbox-dispatcher.service';

@Module({
  imports: [NotificationsModule],
  providers: [
    { provide: EVENTS_POOL, useFactory: () => new Pool({ connectionString: process.env.DATABASE_URL }) },
    {
      provide: EVENT_HANDLERS,
      useFactory: (consumer: NotificationEventConsumer) => [consumer],
      inject: [NotificationEventConsumer],
    },
    InboxService,
    OutboxDispatcherService,
  ],
  exports: [EVENT_HANDLERS, InboxService, OutboxDispatcherService],
})
export class EventsModule {}
