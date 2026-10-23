import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';

import type { DomainEvent, EventHandler } from '../events/events.types';
import { evaluateNotificationRules, type NotificationRule } from './notifications.rules';
import { NOTIFICATION_RULES } from './notifications.tokens';

@Injectable()
export class NotificationEventConsumer implements EventHandler {
  readonly name = 'notification-rules';
  private readonly logger = new Logger(NotificationEventConsumer.name);

  constructor(
    @Inject(NOTIFICATION_RULES) private readonly rules: readonly NotificationRule[],
  ) {}

  async handle(_client: PoolClient, event: DomainEvent): Promise<void> {
    const matches = evaluateNotificationRules(event, this.rules);
    this.logger.debug({
      eventId: event.id,
      eventName: event.eventName,
      eventVersion: event.eventVersion,
      evaluatedRules: this.rules.length,
      matchedRules: matches.map(({ code, version }) => ({ code, version })),
    });
  }
}
