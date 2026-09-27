import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

async function waitForHttp(url, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(url);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`service did not start: ${url}`);
}

function start(command, args, env = {}) {
  return spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('built API and web shells start locally', async (context) => {
  const api = start('node', ['apps/api/dist/main.js'], { PORT: '3100' });
  const web = start('pnpm', ['--dir', 'apps/web', 'start'], { PORT: '3101' });
  context.after(() => {
    api.kill('SIGTERM');
    web.kill('SIGTERM');
  });

  const [apiResponse, webResponse] = await Promise.all([
    waitForHttp('http://127.0.0.1:3100/'),
    waitForHttp('http://127.0.0.1:3101/'),
  ]);

  assert.equal(apiResponse.status, 404);
  assert.equal(webResponse.status, 200);
  assert.match(await webResponse.text(), /AgroPlatform web shell/);
});
