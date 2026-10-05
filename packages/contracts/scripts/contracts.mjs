#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  detectGeneratedDrift,
  loadAndValidateContracts,
  renderGeneratedArtifacts,
  repositoryRoot,
} from './lib/contracts.mjs';

const packageRoot = path.join(repositoryRoot, 'packages/contracts');
const command = process.argv[2];

async function generate(artifacts) {
  for (const [relativePath, content] of artifacts) {
    const target = path.join(packageRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
}

async function check(artifacts) {
  const actual = new Map();
  for (const [relativePath] of artifacts) {
    try {
      actual.set(relativePath, await readFile(path.join(packageRoot, relativePath), 'utf8'));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  const drift = detectGeneratedDrift(artifacts, actual);
  if (drift.length > 0) {
    throw new Error(`Generated contract drift detected:\n- ${drift.join('\n- ')}\nRun pnpm contracts:generate.`);
  }
}

const contracts = await loadAndValidateContracts();
if (command === 'validate') {
  console.log('OpenAPI and event contracts are valid.');
} else if (command === 'generate') {
  await generate(renderGeneratedArtifacts(contracts));
  console.log('TypeScript and Dart contracts generated.');
} else if (command === 'check') {
  await check(renderGeneratedArtifacts(contracts));
  console.log('Generated contracts are current.');
} else {
  console.error('Usage: node scripts/contracts.mjs <validate|generate|check>');
  process.exitCode = 2;
}
