import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { Injectable } from '@nestjs/common';

const execFileAsync = promisify(execFile);

export const EXPECTED_SCHEMA_VERSION = 1;

export type SchemaVersionStatus = 'current' | 'behind' | 'ahead';

export interface SchemaVersionResponse {
  readonly schemaVersion: number;
  readonly expectedSchemaVersion: number;
  readonly postgisVersion: string;
  readonly status: SchemaVersionStatus;
}

export class SchemaVersionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaVersionUnavailableError';
  }
}

function psqlConnection(databaseUrl: string): {
  readonly databaseUrl: string;
  readonly password: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new SchemaVersionUnavailableError(
      'DATABASE_URL is not a valid PostgreSQL connection URL',
    );
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new SchemaVersionUnavailableError(
      'DATABASE_URL must use the postgres or postgresql scheme',
    );
  }

  const password = decodeURIComponent(parsed.password);
  parsed.password = '';
  return Object.freeze({ databaseUrl: parsed.toString(), password });
}

export function parseSchemaVersionOutput(output: string): SchemaVersionResponse {
  const [rawVersion, postgisVersion, extra] = output.trim().split('|');
  const schemaVersion = Number(rawVersion);
  if (
    extra !== undefined ||
    !Number.isSafeInteger(schemaVersion) ||
    schemaVersion < 0 ||
    !postgisVersion
  ) {
    throw new SchemaVersionUnavailableError(
      'Database returned an invalid schema-version response',
    );
  }

  const status: SchemaVersionStatus =
    schemaVersion === EXPECTED_SCHEMA_VERSION
      ? 'current'
      : schemaVersion < EXPECTED_SCHEMA_VERSION
        ? 'behind'
        : 'ahead';

  return Object.freeze({
    schemaVersion,
    expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
    postgisVersion,
    status,
  });
}

@Injectable()
export class SchemaVersionService {
  async read(): Promise<SchemaVersionResponse> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new SchemaVersionUnavailableError('DATABASE_URL is not configured');
    }

    const psqlBin = process.env.PSQL_BIN ?? 'psql';
    const connection = psqlConnection(databaseUrl);
    const query = `
      SELECT
        COALESCE(MAX(version), 0)::text,
        COALESCE((SELECT extversion FROM pg_extension WHERE extname = 'postgis'), '')
      FROM platform_meta.schema_migrations;
    `;

    try {
      const { stdout } = await execFileAsync(
        psqlBin,
        [
          '--dbname',
          connection.databaseUrl,
          '--no-psqlrc',
          '--tuples-only',
          '--no-align',
          '--field-separator=|',
          '--set',
          'ON_ERROR_STOP=1',
          '--command',
          query,
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            ...(connection.password ? { PGPASSWORD: connection.password } : {}),
          },
          maxBuffer: 64 * 1024,
          timeout: 5_000,
        },
      );
      return parseSchemaVersionOutput(stdout);
    } catch (error) {
      if (error instanceof SchemaVersionUnavailableError) throw error;
      throw new SchemaVersionUnavailableError(
        'Database schema version is unavailable',
      );
    }
  }
}
