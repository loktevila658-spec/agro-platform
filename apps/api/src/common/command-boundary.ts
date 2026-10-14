import { ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';

/**
 * A transaction-scoped optimistic-version assertion. Implementations must
 * compare against authoritative state while holding the transaction's lock
 * (or using an equivalent atomic compare-and-set) until the effect commits.
 */
export type AtomicVersionGuard<Version = unknown> = (
  transaction: PoolClient,
  expectedVersion: Version,
) => Promise<boolean>;

export interface CommandEffectInput<Result, Version = unknown> {
  readonly transaction: PoolClient;
  readonly expectedVersion?: Version;
  readonly assertVersion?: AtomicVersionGuard<Version>;
  readonly effect: () => Promise<Result>;
}

/** Runs a command effect behind the shared transaction-scoped version guard. */
export async function executeCommandEffect<Result, Version = unknown>(
  input: CommandEffectInput<Result, Version>,
): Promise<Result> {
  if (input.expectedVersion !== undefined) {
    if (!input.assertVersion) {
      throw new Error('An atomic version guard is required when expectedVersion is supplied');
    }
    if (!(await input.assertVersion(input.transaction, input.expectedVersion))) {
      throw new ConflictException('Optimistic version conflict');
    }
  }

  return input.effect();
}
