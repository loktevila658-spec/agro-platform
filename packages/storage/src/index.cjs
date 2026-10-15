'use strict';

class ObjectStorageUnavailableError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ObjectStorageUnavailableError';
    this.retryable = true;
  }
}

class MinioObjectStorage {
  constructor(client, bucket = 'agro-attachments') {
    this.client = client;
    this.bucket = bucket;
  }

  async putObject(key, body, size, metadata) {
    const client = this.requireClient();
    try {
      await client.putObject(this.bucket, key, body, size, metadata);
    } catch (error) {
      throw new ObjectStorageUnavailableError('MinIO upload failed', { cause: error });
    }
  }

  async getObject(key) {
    try {
      return await this.requireClient().getObject(this.bucket, key);
    } catch (error) {
      throw new ObjectStorageUnavailableError('MinIO object read failed', { cause: error });
    }
  }

  async removeObject(key) {
    try {
      await this.requireClient().removeObject(this.bucket, key);
    } catch (error) {
      throw new ObjectStorageUnavailableError('MinIO object removal failed', { cause: error });
    }
  }

  async ensureBucket() {
    const client = this.requireClient();
    try {
      if (!(await client.bucketExists(this.bucket))) await client.makeBucket(this.bucket);
    } catch (error) {
      throw new ObjectStorageUnavailableError('MinIO bucket is unavailable', { cause: error });
    }
  }

  requireClient() {
    if (!this.client) throw new ObjectStorageUnavailableError('File object storage is not configured');
    return this.client;
  }
}

module.exports = { MinioObjectStorage, ObjectStorageUnavailableError };
