import assert from 'node:assert/strict';
import 'reflect-metadata';
import test from 'node:test';

import { NotificationEventConsumer } from '../dist/modules/notifications/notification-event-consumer.js';
import { evaluateNotificationRules } from '../dist/modules/notifications/notifications.rules.js';
import { NotificationsModule } from '../dist/modules/notifications/notifications.module.js';
import { NOTIFICATION_RULES } from '../dist/modules/notifications/notifications.tokens.js';
import { EventsModule } from '../dist/modules/events/events.module.js';
import { EVENT_HANDLERS } from '../dist/modules/events/events.tokens.js';

const event = {
  id: '00000000-0000-4000-8000-000000000001',
  source: 'org',
  eventName: 'org.tenant_created',
  eventVersion: '1.0.0',
  producer: 'org',
  entityId: '00000000-0000-4000-8000-000000000002',
  tenantId: '00000000-0000-4000-8000-000000000003',
  actorId: '00000000-0000-4000-8000-000000000004',
  correlationId: 'corr-1',
  causationId: 'cause-1',
  occurredAt: new Date('2026-01-01T00:00:00Z'),
  payload: { tenantId: '00000000-0000-4000-8000-000000000003' },
};

test('rule evaluation requires an enabled exact event name and version match', () => {
  const rules = [
    { code: 'match', version: '1', eventName: event.eventName, eventVersion: event.eventVersion, enabled: true },
    { code: 'wrong-version', version: '1', eventName: event.eventName, eventVersion: '2.0.0', enabled: true },
    { code: 'disabled', version: '1', eventName: event.eventName, eventVersion: event.eventVersion, enabled: false },
    { code: 'wrong-name', version: '1', eventName: 'org.other', eventVersion: event.eventVersion, enabled: true },
  ];

  assert.deepEqual(evaluateNotificationRules(event, rules).map(({ code }) => code), ['match']);
  assert.deepEqual(evaluateNotificationRules(event, []), []);
});

test('registered consumer evaluates events without using the domain transaction client', async () => {
  const rule = { code: 'tenant-created', version: '1', eventName: event.eventName, eventVersion: event.eventVersion, enabled: true };
  const consumer = new NotificationEventConsumer([rule]);
  const client = { query: () => { throw new Error('notification consumer must not write'); } };

  await consumer.handle(client, event);
  assert.equal(consumer.name, 'notification-rules');
});

test('events module registers the notifications consumer with the existing dispatcher', () => {
  const imports = Reflect.getMetadata('imports', EventsModule);
  const providers = Reflect.getMetadata('providers', EventsModule);
  const notificationsProviders = Reflect.getMetadata('providers', NotificationsModule);
  const handlersProvider = providers.find(({ provide }) => provide === EVENT_HANDLERS);
  const rulesProvider = notificationsProviders.find(({ provide }) => provide === NOTIFICATION_RULES);
  const consumer = new NotificationEventConsumer(rulesProvider.useValue);

  assert.ok(imports.includes(NotificationsModule));
  assert.deepEqual(handlersProvider.useFactory(consumer), [consumer]);
  assert.deepEqual(rulesProvider.useValue, []);
});
