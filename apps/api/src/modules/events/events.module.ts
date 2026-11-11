import {OfflineGisModule} from '../offline-gis/offline-gis.module';
import {OfflineGisEvents} from '../offline-gis/offline-gis.events';
import { ReplicationModule } from '../replication/replication.module';
import { ReplicationConsumer } from '../replication/replication.consumer';
import { Module } from '@nestjs/common';
import { Pool } from 'pg';

import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationEventConsumer } from '../notifications/notification-event-consumer';
import { EVENTS_POOL, EVENT_HANDLERS } from './events.tokens';
import type { EventHandler } from './events.types';
import { InboxService } from './inbox.service';
import { OutboxDispatcherService } from './outbox-dispatcher.service';

@Module({
  imports: [NotificationsModule, ReplicationModule, OfflineGisModule],
  providers: [
    { provide: EVENTS_POOL, useFactory: () => new Pool({ connectionString: process.env.DATABASE_URL }) },
    {
      provide: EVENT_HANDLERS,
      useFactory: (consumer: NotificationEventConsumer, ...additional: EventHandler[]) => [consumer, ...additional],
      inject: [NotificationEventConsumer, ReplicationConsumer, OfflineGisEvents],
    },
    InboxService,
    OutboxDispatcherService,
  ],
  exports: [EVENT_HANDLERS, InboxService, OutboxDispatcherService],
})
export class EventsModule {}
