import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildComposeCandidates,
  composeArguments,
  selectComposeCli,
} from '../scripts/compose-cli.mjs';

test('modern docker compose is preferred over standalone docker-compose', () => {
  const candidates = buildComposeCandidates({}, 'linux');
  const probes = [];
  const selected = selectComposeCli(candidates, (command, args) => {
    probes.push([command, args]);
    return { status: 0 };
  });

  assert.deepEqual(selected, {
    command: 'docker',
    prefixArgs: ['compose'],
  });
  assert.deepEqual(probes, [['docker', ['compose', 'version']]]);
});

test('standalone docker-compose is used when the modern plugin is unavailable', () => {
  const candidates = buildComposeCandidates({}, 'linux');
  const selected = selectComposeCli(candidates, (command, args) => {
    if (command === 'docker' && args[0] === 'compose') return { status: 1 };
    if (command === 'docker-compose') return { status: 0 };
    return undefined;
  });

  assert.deepEqual(selected, {
    command: 'docker-compose',
    prefixArgs: [],
  });
});

test('custom and macOS Docker Desktop candidates retain compose argument prefixes', () => {
  const candidates = buildComposeCandidates(
    {
      DOCKER_BIN: '/custom/docker',
      DOCKER_COMPOSE_BIN: '/custom/docker-compose',
    },
    'darwin',
  );

  assert.deepEqual(candidates, [
    { command: '/custom/docker', prefixArgs: ['compose'] },
    { command: 'docker', prefixArgs: ['compose'] },
    {
      command: '/Applications/Docker.app/Contents/Resources/bin/docker',
      prefixArgs: ['compose'],
    },
    { command: '/custom/docker-compose', prefixArgs: [] },
    { command: 'docker-compose', prefixArgs: [] },
    {
      command:
        '/Applications/Docker.app/Contents/Resources/cli-plugins/docker-compose',
      prefixArgs: [],
    },
  ]);

  assert.deepEqual(
    composeArguments(candidates[0], ['-f', 'apps/compose.yaml', 'config']),
    ['compose', '-f', 'apps/compose.yaml', 'config'],
  );
});
