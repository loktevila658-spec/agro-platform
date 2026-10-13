import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../dist/main.js';

const baselineHeaders = {
  'content-security-policy': "default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

test('real HTTP responses carry baseline headers and production HSTS only', async () => {
  const priorEnvironment = process.env.AGRO_ENV;
  try {
    for (const { environment, expectedHsts } of [
      { environment: 'test', expectedHsts: null },
      { environment: 'production', expectedHsts: 'max-age=31536000' },
    ]) {
      process.env.AGRO_ENV = environment;
      const app = await createApp();
      try {
        await app.listen(0, '127.0.0.1');
        const address = app.getHttpServer().address();
        assert.ok(address && typeof address === 'object');
        const baseUrl = `http://127.0.0.1:${address.port}`;

        for (const path of ['/health/live', '/not-found']) {
          const response = await fetch(`${baseUrl}${path}`);
          for (const [name, expected] of Object.entries(baselineHeaders)) {
            assert.equal(response.headers.get(name), expected, `${environment} ${path} ${name}`);
          }
          assert.equal(response.headers.get('strict-transport-security'), expectedHsts);
          assert.match(response.headers.get('x-correlation-id') ?? '', /^[0-9a-f-]{36}$/i);
          await response.arrayBuffer();
        }
      } finally {
        await app.close();
      }
    }
  } finally {
    if (priorEnvironment === undefined) delete process.env.AGRO_ENV;
    else process.env.AGRO_ENV = priorEnvironment;
  }
});
