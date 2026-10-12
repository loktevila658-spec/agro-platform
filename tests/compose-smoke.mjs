import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import {
  buildComposeCandidates,
  composeArguments,
  selectComposeCli,
} from '../scripts/compose-cli.mjs';

const requireEngine = process.argv.includes('--require-engine');
const composeFile = 'apps/compose.yaml';
const dockerCandidates = [
  process.env.DOCKER_BIN,
  'docker',
  '/Applications/Docker.app/Contents/Resources/bin/docker',
].filter(Boolean);

function runnable(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return result.error?.code === 'ENOENT' ? undefined : result;
}

function firstRunnable(candidates, args) {
  for (const candidate of candidates) {
    if (candidate.startsWith('/') && !existsSync(candidate)) continue;
    const result = runnable(candidate, args);
    if (result) return { command: candidate, result };
  }
  return undefined;
}

const compose = selectComposeCli(
  buildComposeCandidates(process.env, process.platform),
  runnable,
);
if (!compose) {
  throw new Error('Docker Compose CLI is unavailable');
}

function runCompose(args) {
  return runnable(compose.command, composeArguments(compose, args));
}

const config = runCompose(['-f', composeFile, 'config']);
if (!config || config.status !== 0) {
  process.stderr.write(config?.stderr ?? 'Compose config validation failed\n');
  process.exit(config?.status ?? 1);
}
console.log('Compose config validation: PASS');

const docker = firstRunnable(dockerCandidates, ['info']);
const engineReady = docker?.result.status === 0;
if (!engineReady) {
  const message = 'Docker engine unavailable: runtime Compose smoke not executed';
  if (requireEngine) throw new Error(message);
  console.warn(message);
  process.exit(0);
}

const up = runCompose(['-f', composeFile, 'up', '--build', '--detach']);
if (!up || up.status !== 0) {
  process.stderr.write(up?.stderr ?? 'Compose bootstrap failed\n');
  process.exit(up?.status ?? 1);
}

try {
  const ps = runCompose(['-f', composeFile, 'ps', '--services', '--status', 'running']);
  if (!ps || ps.status !== 0) process.exit(ps?.status ?? 1);
  const running = new Set(ps.stdout.trim().split(/\s+/).filter(Boolean));
  for (const service of ['api', 'web', 'workers', 'ai']) {
    if (!running.has(service)) throw new Error(`Compose service is not running: ${service}`);
  }
  console.log('Compose runtime smoke: PASS');
} finally {
  runCompose(['-f', composeFile, 'down', '--volumes', '--remove-orphans']);
}
