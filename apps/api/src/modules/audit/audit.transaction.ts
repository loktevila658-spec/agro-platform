import type { PoolClient } from 'pg';

const transactionBrand = Symbol('AUDIT_TRANSACTION_CONTEXT');

/** Transaction-scoped handle. Create it only with runAuditTransaction. */
export class AuditTransactionContext {
  private readonly [transactionBrand] = true;

  private constructor(readonly client: PoolClient) {}

  static async run<T>(client: PoolClient, operation: (tx: AuditTransactionContext) => Promise<T>): Promise<T> {
    await client.query('BEGIN');
    const tx = new AuditTransactionContext(client);
    try {
      const result = await operation(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the command failure; callers must discard a broken connection.
      }
      throw error;
    }
  }
}

export const runAuditTransaction = AuditTransactionContext.run;
