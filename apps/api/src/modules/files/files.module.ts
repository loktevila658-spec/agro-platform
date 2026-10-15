import { Module } from '@nestjs/common';
import { Client } from 'minio';
import { Pool } from 'pg';

import { MinioObjectStorage } from '../../../../../packages/storage/src/index.cjs';
import { FILES_AUTHORIZATION, FILES_POOL, FILES_SCANNER, FILES_SIZE_POLICY, FILES_STORAGE } from './files.tokens';
import { ClamAvScanner } from './clamav-scanner';
import { FilesService } from './files.service';
import { DenyAllFileAuthorization, EnvironmentFileSizePolicy } from './files.types';

@Module({
  providers: [
    { provide: FILES_POOL, useFactory: () => new Pool({ connectionString: process.env.DATABASE_URL }) },
    {
      provide: FILES_STORAGE,
      useFactory: () => {
        const endpoint = process.env.FILES_MINIO_ENDPOINT;
        const accessKey = process.env.FILES_MINIO_ACCESS_KEY;
        const secretKey = process.env.FILES_MINIO_SECRET_KEY;
        let client: Client | undefined;
        if (endpoint && accessKey && secretKey) {
          const parsed = new URL(endpoint);
          client = new Client({ endPoint: parsed.hostname, port: Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 9000)), useSSL: parsed.protocol === 'https:', accessKey, secretKey });
        }
        return new MinioObjectStorage(client, process.env.FILES_MINIO_BUCKET ?? 'agro-attachments');
      },
    },
    { provide: FILES_SCANNER, useClass: ClamAvScanner },
    { provide: FILES_AUTHORIZATION, useClass: DenyAllFileAuthorization },
    { provide: FILES_SIZE_POLICY, useClass: EnvironmentFileSizePolicy },
    FilesService,
  ],
  exports: [FilesService],
})
export class FilesModule {}
