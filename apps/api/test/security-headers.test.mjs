import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../dist/main.js';

const baselineHeaders = {
  'content-security-policy': "default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

test('real HTTP success and not-found responses carry security headers and correlation IDs', async (t) => {
  const priorEnvironment = process.env.AGRO_ENV;
  const priorHttpsReady = process.env.AGRO_HTTPS_READY;
  process.env.AGRO_ENV = 'test';
  delete process.env.AGRO_HTTPS_READY;

  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    for (const path of ['/health/live', '/not-found']) {
      const response = await fetch(`${baseUrl}${path}`);
      for (const [name, expected] of Object.entries(baselineHeaders)) {
        assert.equal(response.headers.get(name), expected, `${path} ${name}`);
      }
      assert.equal(response.headers.get('strict-transport-security'), null);
      assert.match(response.headers.get('x-correlation-id') ?? '', /^[0-9a-f-]{36}$/i);
      await response.arrayBuffer();
    }
  } finally {
    await app.close();
    if (priorEnvironment === undefined) delete process.env.AGRO_ENV;
    else process.env.AGRO_ENV = priorEnvironment;
    if (priorHttpsReady === undefined) delete process.env.AGRO_HTTPS_READY;
    else process.env.AGRO_HTTPS_READY = priorHttpsReady;
  }
});
