import type { ObjectStorage } from '../../../../../packages/storage/src/index.cjs';

export const MIN_CHUNK_SIZE = 5 * 1024 * 1024;
export const RESUMABLE_THRESHOLD = 10 * 1024 * 1024;
export const DEFAULT_MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;
export const ACCEPTED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'application/pdf', 'audio/mpeg', 'audio/mp4',
]);

export type FileState = 'QUARANTINED' | 'AVAILABLE' | 'REJECTED';

export interface FileActor {
  readonly tenantId: string;
  readonly actorId: string;
  readonly correlationId?: string;
}

export interface InitFileUpload {
  readonly ownerRef: string;
  readonly evidenceType: string;
  readonly sizeBytes: number;
  readonly declaredMime: string;
  readonly idempotencyKey: string;
}

export interface FileUploadReference {
  readonly attachmentId: string;
  readonly state: FileState;
  readonly sizeBytes: number;
  readonly chunkSizeBytes: number;
  readonly resumable: boolean;
}

export interface FileAuthorizationRequest extends FileActor {
  readonly action: 'file.upload' | 'file.part' | 'file.complete' | 'file.read';
  readonly ownerRef: string;
  readonly attachmentId?: string;
}

export interface FileAuthorizationPort {
  authorize(request: FileAuthorizationRequest): Promise<boolean>;
}

export class DenyAllFileAuthorization implements FileAuthorizationPort {
  async authorize(_request: FileAuthorizationRequest): Promise<boolean> { return false; }
}

export interface FileSizePolicy {
  maxBytes(tenantId: string, evidenceType: string): number;
}

export class EnvironmentFileSizePolicy implements FileSizePolicy {
  maxBytes(tenantId: string, evidenceType: string): number {
    const fallback = positiveInteger(process.env.FILES_MAX_BYTES, DEFAULT_MAX_FILE_SIZE);
    const configured = process.env.FILES_MAX_BYTES_BY_TENANT_TYPE;
    if (!configured) return fallback;
    try {
      const entries = JSON.parse(configured) as Record<string, unknown>;
      const key = `${tenantId}:${evidenceType}`;
      return positiveInteger(entries[key], fallback);
    } catch {
      return fallback;
    }
  }
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export type { ObjectStorage };

export interface MalwareScanner {
  scan(body: AsyncIterable<Uint8Array>): Promise<'CLEAN' | 'INFECTED'>;
}

export interface FilesPool {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
  connect(): Promise<FilesPoolClient>;
}

export interface FilesPoolClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
  release(): void;
}

export interface UploadPartInput {
  readonly partNumber: number;
  readonly expectedSha256: string;
  readonly body: AsyncIterable<Uint8Array>;
}
