import type { Readable } from 'node:stream';

/** Internal Local Server object-storage boundary; implementations must stream. */
export interface ObjectStorage {
  putObject(key: string, body: Readable, size: number, metadata?: Record<string, string>): Promise<void>;
  getObject(key: string): Promise<Readable>;
  removeObject(key: string): Promise<void>;
}

export interface MinioClientPort {
  putObject(bucket: string, key: string, body: Readable, size: number, metadata?: Record<string, string>): Promise<unknown>;
  getObject(bucket: string, key: string): Promise<Readable>;
  removeObject(bucket: string, key: string): Promise<unknown>;
  bucketExists(bucket: string): Promise<boolean>;
  makeBucket(bucket: string): Promise<unknown>;
}

export class MinioObjectStorage implements ObjectStorage {
  constructor(client: MinioClientPort | undefined, bucket?: string);
  putObject(key: string, body: Readable, size: number, metadata?: Record<string, string>): Promise<void>;
  getObject(key: string): Promise<Readable>;
  removeObject(key: string): Promise<void>;
  ensureBucket(): Promise<void>;
}

export class ObjectStorageUnavailableError extends Error {
  readonly retryable: true;
}
