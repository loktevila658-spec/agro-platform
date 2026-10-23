import type { DomainEvent } from '../events/events.types';

/** Exact, versioned event selectors; the skeleton intentionally has no rule DSL. */
export interface NotificationRule {
  code: string;
  version: string;
  eventName: string;
  eventVersion: string;
  enabled: boolean;
}

export function evaluateNotificationRules(
  event: DomainEvent,
  rules: readonly NotificationRule[],
): NotificationRule[] {
  return rules.filter(
    (rule) =>
      rule.enabled &&
      rule.eventName === event.eventName &&
      rule.eventVersion === event.eventVersion,
  );
}
