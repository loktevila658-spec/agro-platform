import { ServiceUnavailableException } from '@nestjs/common';
import { connect } from 'node:net';

import type { MalwareScanner } from './files.types';

export class ClamAvScanner implements MalwareScanner {
  async scan(body: AsyncIterable<Uint8Array>): Promise<'CLEAN' | 'INFECTED'> {
    const endpoint = process.env.FILES_CLAMD_ENDPOINT;
    if (!endpoint) throw new ServiceUnavailableException('Malware scanner is not configured; file remains quarantined');
    let parsed: URL;
    try { parsed = new URL(endpoint); }
    catch (error) { throw new ServiceUnavailableException('Malware scanner endpoint is invalid; file remains quarantined', { cause: error }); }
    if (parsed.protocol !== 'tcp:') throw new ServiceUnavailableException('Malware scanner endpoint must use private TCP');
    const client = connect({ host: parsed.hostname, port: Number(parsed.port || 3310) });
    client.setTimeout(30_000);
    try {
      await new Promise<void>((resolve, reject) => {
        client.once('connect', resolve);
        client.once('error', reject);
        client.once('timeout', () => reject(new Error('ClamAV scanner connection timed out')));
      });
      const response = new Promise<string>((resolve, reject) => {
        let output = '';
        client.setEncoding('utf8');
        client.on('data', (part: string) => { output += part; if (output.includes('\n') || output.includes('\0')) resolve(output.trim().replace(/\0+$/, '')); });
        client.once('error', reject);
        client.once('timeout', () => reject(new Error('ClamAV scanner timed out')));
        client.once('close', () => { if (!output.includes('\n') && !output.includes('\0')) reject(new Error('ClamAV closed without a complete response')); });
      });
      client.write('zINSTREAM\0');
      for await (const chunk of body) {
        let offset = 0;
        while (offset < chunk.length) {
          const length = Math.min(chunk.length - offset, 64 * 1024);
          const header = Buffer.allocUnsafe(4);
          header.writeUInt32BE(length);
          if (!client.write(header) || !client.write(Buffer.from(chunk.buffer, chunk.byteOffset + offset, length))) {
            await new Promise<void>((resolve) => client.once('drain', resolve));
          }
          offset += length;
        }
      }
      const terminator = Buffer.alloc(4);
      client.end(terminator);
      const result = await response;
      if (result.endsWith('OK')) return 'CLEAN';
      if (result.includes('FOUND')) return 'INFECTED';
      throw new Error('ClamAV returned an invalid scan response');
    } catch (error) {
      client.destroy();
      throw new ServiceUnavailableException('Malware scan failed; file remains quarantined', { cause: error });
    }
  }
}
