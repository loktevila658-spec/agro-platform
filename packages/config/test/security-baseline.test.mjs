import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import test from 'node:test';

import {
  ConfigValidationError,
  parseRequiredSecretReference,
} from '../dist/index.js';
import { formatFinding, scanRepository, scanText } from '../../../security/secret-scan.mjs';

const require = createRequire(import.meta.url);
const {
  createBaselineSecurityHeaders,
} = require('../../../security/headers.cjs');

const scannerPath = new URL('../../../security/secret-scan.mjs', import.meta.url);

test('scanner detects private keys, provider tokens, and high-entropy secret assignments', () => {
  const token = `ghp_${'aB3dE6fG9hJ2kL5mN8pQ1rS4tU7vW0xY'.repeat(2)}`;
  const credential = 'A7cD9fG2hJ5kL8mN1pQ4rT6vX3zB0eY';
  const privateKeyMarker = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
  const findings = scanText([
    privateKeyMarker,
    `GITHUB_TOKEN=${token}`,
    `DATABASE_PASSWORD=${credential}`,
  ].join('\n'));

  assert.deepEqual(findings.map(({ line, rule }) => ({ line, rule })), [
    { line: 1, rule: 'private-key-pem' },
    { line: 2, rule: 'provider-token' },
    { line: 3, rule: 'high-entropy-credential' },
  ]);
  assert.equal(JSON.stringify(findings).includes(token), false);
  assert.equal(JSON.stringify(findings).includes(credential), false);
});

test('scanner permits reviewable low-entropy synthetic examples without path exclusions', () => {
  assert.deepEqual(scanText('API_TOKEN=test-only-placeholder\nPASSWORD=not-a-secret'), []);
});

test('scanner checks all same-line assignments and URLs without disclosing values', async () => {
  const benignAssignment = 'x'.repeat(32);
  const assignmentSecret = ['A7cD9fG2hJ5kL8mN', '1pQ4rT6vX3zB0eY'].join('');
  const urlSecret = ['R3tY5uI7oP9aS2dF', '4gH6jK8lZ1xC0vB'].join('');
  const contents = [
    `TOKEN=${benignAssignment} DATABASE_PASSWORD=${assignmentSecret}`,
    `API_TOKEN=${benignAssignment} postgres://farm:${urlSecret}@db.internal/agro`,
  ].join('\n');
  const expected = [
    { line: 1, rule: 'high-entropy-credential' },
    { line: 2, rule: 'high-entropy-credential' },
  ];
  const findings = scanText(contents);
  assert.deepEqual(findings, expected);
  assert.deepEqual(scanText(contents), findings);
  const formatted = findings.map(formatFinding).join('\n');
  assert.equal(formatted.includes(assignmentSecret), false);
  assert.equal(formatted.includes(urlSecret), false);

  const root = await mkdtemp(join(tmpdir(), 'agro-secret-scan-mixed-'));
  try {
    await writeFile(join(root, 'mixed.env'), contents);
    const args = [scannerPath.pathname, root];
    const first = spawnSync(process.execPath, args, { encoding: 'utf8' });
    const second = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(first.status, 1);
    assert.deepEqual(
      { status: second.status, stdout: second.stdout, stderr: second.stderr },
      { status: first.status, stdout: first.stdout, stderr: first.stderr },
    );
    const output = `${first.stdout}${first.stderr}`;
    assert.equal(output.includes(assignmentSecret), false);
    assert.equal(output.includes(urlSecret), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('scanner findings and repository traversal are stable across repeated scans', async () => {
  const first = await scanRepository();
  const second = await scanRepository();
  assert.deepEqual(second, first);
  assert.deepEqual(scanText('TOKEN=zZ8qP1mN4vB7cD0fG3hJ6kL9'), scanText('TOKEN=zZ8qP1mN4vB7cD0fG3hJ6kL9'));
  assert.equal(first.findings.length, 0);
});

test('scanner command fails explicitly without disclosing a detected value', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agro-secret-scan-'));
  try {
    const secret = 'X7aB9cD2eF4gH6jK8mN0pQ3r';
    await writeFile(join(root, 'config.env'), `SERVICE_TOKEN=${secret}\n`);
    const result = spawnSync(process.execPath, [scannerPath.pathname, root], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /prohibited secret material detected/);
    assert.equal(`${result.stdout}${result.stderr}`.includes(secret), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('scanner does not broadly omit synthetic test directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agro-secret-scan-tests-'));
  try {
    await mkdir(join(root, 'test'));
    await writeFile(join(root, 'test', 'sample.env'), `SERVICE_TOKEN=${'X7aB9cD2eF4gH6jK8mN0pQ3r'}\n`);
    const result = await scanRepository(root);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].path, 'test/sample.env');
    assert.equal(formatFinding(result.findings[0]).includes('X7aB9cD2eF4gH6jK8mN0pQ3r'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('secret references are typed, immutable, and contain no secret material', () => {
  const reference = parseRequiredSecretReference({
    SIGNING_KEY_REF: JSON.stringify({
      provider: 'VAULT',
      locator: 'kv/agro/signing-key',
      purpose: 'event-signing',
      version: 'v3',
    }),
  }, 'SIGNING_KEY_REF');
  assert.deepEqual(reference, {
    provider: 'VAULT',
    locator: 'kv/agro/signing-key',
    purpose: 'event-signing',
    version: 'v3',
  });
  assert.equal(Object.isFrozen(reference), true);
  assert.equal(JSON.stringify(reference).includes('PRIVATE KEY'), false);
  const opaqueLocator = '4f9a2c7e1b6d8a3f5c0e9b2d7a4f1c6e8b3d0a5f2c9e7b1d6a4f8c3e0b5d2a9';
  assert.equal(parseRequiredSecretReference({
    SIGNING_KEY_REF: JSON.stringify({ provider: 'VAULT', locator: opaqueLocator, purpose: 'event-signing' }),
  }, 'SIGNING_KEY_REF').locator, opaqueLocator);
});

test('missing, malformed, and raw key material fail without echoing the value', () => {
  const rawValue = 'very-secret-material-that-must-not-leak';
  const privateKeyMarker = ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' ');
  for (const source of [
    {},
    { SIGNING_KEY_REF: '{bad-json' },
    { SIGNING_KEY_REF: rawValue },
    { SIGNING_KEY_REF: JSON.stringify({ provider: 'UNKNOWN', locator: 'x', purpose: 'y' }) },
    { SIGNING_KEY_REF: JSON.stringify({ provider: 'VAULT', locator: '', purpose: 'y' }) },
    { SIGNING_KEY_REF: JSON.stringify({ provider: 'VAULT', locator: 'x', purpose: 'y', material: rawValue }) },
    { SIGNING_KEY_REF: JSON.stringify({ provider: 'VAULT', locator: privateKeyMarker, purpose: 'y' }) },
    { SIGNING_KEY_REF: JSON.stringify({ provider: 'VAULT', locator: 'ghp_' + 'A'.repeat(36), purpose: 'y' }) },
    { SIGNING_KEY_REF: JSON.stringify({ provider: 'VAULT', locator: 'safe-locator', purpose: 'signing', version: `password=${rawValue}` }) },
    { SIGNING_KEY_REF: JSON.stringify({ provider: 'VAULT', locator: 'safe-locator', purpose: 'signing', version: `postgres://user:${rawValue}@db.internal/app` }) },
  ]) {
    assert.throws(() => parseRequiredSecretReference(source, 'SIGNING_KEY_REF'), (error) => {
      assert.ok(error instanceof ConfigValidationError);
      assert.match(error.message, /SIGNING_KEY_REF/);
      assert.equal(error.message.includes(rawValue), false);
      return true;
    });
  }
  for (const field of ['locator', 'purpose', 'version']) {
    const secret = 'xoxb-' + 'AbCdEf1234567890GhIjKlMn';
    assert.throws(() => parseRequiredSecretReference({
      SIGNING_KEY_REF: JSON.stringify({ provider: 'VAULT', locator: 'opaque-r4nd0m-ref-98Qx', purpose: 'signing', version: 'v4', [field]: secret }),
    }, 'SIGNING_KEY_REF'), (error) => {
      assert.ok(error instanceof ConfigValidationError);
      assert.match(error.message, /SIGNING_KEY_REF/);
      assert.equal(error.message.includes(secret), false);
      return true;
    });
  }
  const privateKeyValue = ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' ');
  assert.throws(() => parseRequiredSecretReference({
    SIGNING_KEY_REF: JSON.stringify({ provider: 'VAULT', locator: 'opaque-r4nd0m-ref-98Qx', purpose: privateKeyValue, version: 'v4' }),
  }, 'SIGNING_KEY_REF'), (error) => {
    assert.ok(error instanceof ConfigValidationError);
    assert.equal(error.message.includes(privateKeyValue), false);
    return true;
  });
});

test('repository scan is included in the package test and reports zero committed findings', async () => {
  const result = await scanRepository();
  assert.equal(result.findings.length, 0, JSON.stringify(result.findings.map(formatFinding)));
  const readme = await readFile(new URL('../../../security/README.md', import.meta.url), 'utf8');
  assert.match(readme, /no path-based or broad test-directory exclusions/);
});

test('baseline security header policy enables HSTS only for production', () => {
  const development = createBaselineSecurityHeaders({ AGRO_ENV: 'development' });
  assert.deepEqual(development, {
    'Content-Security-Policy': "default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none'",
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  assert.equal(Object.values(development).some((value) => value.includes('*')), false);
  assert.equal('Strict-Transport-Security' in development, false);
  assert.equal(
    createBaselineSecurityHeaders({ AGRO_ENV: 'production' })['Strict-Transport-Security'],
    'max-age=31536000',
  );
  assert.equal('Strict-Transport-Security' in createBaselineSecurityHeaders({ AGRO_ENV: 'test' }), false);
});
