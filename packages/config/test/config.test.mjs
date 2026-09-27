import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ConfigValidationError,
  parseRuntimeConfig,
} from '../dist/index.js';

const validEnvironment = Object.freeze({
  AGRO_ENV: 'development',
  AGRO_DEPLOYMENT_MODE: 'LOCAL_PRIMARY',
  AGRO_SITE_TIME_ZONE: 'Europe/Moscow',
  AGRO_LOCAL_WRITE_ENABLED: 'true',
  AGRO_CLOUD_WRITE_ENABLED: 'false',
  PORT: '3000',
});

function expectInvalid(overrides, expectedVariable, expectedMessage) {
  assert.throws(
    () => parseRuntimeConfig({ ...validEnvironment, ...overrides }),
    (error) => {
      assert.ok(error instanceof ConfigValidationError);
      assert.ok(
        error.issues.some(
          (issue) =>
            issue.variable === expectedVariable &&
            issue.message.includes(expectedMessage),
        ),
      );
      return true;
    },
  );
}

test('valid environment parses into an immutable typed configuration', () => {
  const config = parseRuntimeConfig(validEnvironment);

  assert.deepEqual(config, {
    environment: 'development',
    deploymentMode: 'LOCAL_PRIMARY',
    siteTimeZone: 'Europe/Moscow',
    port: 3000,
    authority: { localWrite: true, cloudWrite: false },
  });
  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config.authority), true);
});

test('all missing required variables fail clearly in deterministic order', () => {
  assert.throws(
    () => parseRuntimeConfig({}),
    (error) => {
      assert.ok(error instanceof ConfigValidationError);
      assert.deepEqual(
        error.issues.map((issue) => issue.variable),
        [
          'AGRO_ENV',
          'AGRO_DEPLOYMENT_MODE',
          'AGRO_SITE_TIME_ZONE',
          'AGRO_LOCAL_WRITE_ENABLED',
          'AGRO_CLOUD_WRITE_ENABLED',
          'PORT',
        ],
      );
      return true;
    },
  );
});

test('malformed typed values fail instead of being coerced', () => {
  expectInvalid({ PORT: '3000.5' }, 'PORT', 'base-10 integer');
  expectInvalid({ PORT: '0' }, 'PORT', 'base-10 integer');
  expectInvalid({ PORT: '65536' }, 'PORT', 'base-10 integer');
  expectInvalid(
    { AGRO_LOCAL_WRITE_ENABLED: '1' },
    'AGRO_LOCAL_WRITE_ENABLED',
    'boolean true or false',
  );
  expectInvalid(
    { AGRO_SITE_TIME_ZONE: 'Farm/Local' },
    'AGRO_SITE_TIME_ZONE',
    'valid IANA time zone',
  );
});

test('invalid environment and deployment modes fail', () => {
  expectInvalid({ AGRO_ENV: 'demo' }, 'AGRO_ENV', 'must be one of');
  expectInvalid(
    { AGRO_DEPLOYMENT_MODE: 'CENTRAL_PRIMARY' },
    'AGRO_DEPLOYMENT_MODE',
    'must be LOCAL_PRIMARY',
  );
});

test('authority invariants cannot be disabled through environment values', () => {
  expectInvalid(
    { AGRO_LOCAL_WRITE_ENABLED: 'false' },
    'AGRO_LOCAL_WRITE_ENABLED',
    'must be true',
  );
  expectInvalid(
    { AGRO_CLOUD_WRITE_ENABLED: 'true' },
    'AGRO_CLOUD_WRITE_ENABLED',
    'must be false',
  );
});

test('parsing is deterministic and does not mutate the source', () => {
  const source = { ...validEnvironment };
  const before = { ...source };

  assert.deepEqual(parseRuntimeConfig(source), parseRuntimeConfig(source));
  assert.deepEqual(source, before);
});

test('deployment example contains only the declared non-secret variables', async () => {
  const example = await readFile(
    new URL('../../../deployment/.env.example', import.meta.url),
    'utf8',
  );
  const assignments = example
    .split('\n')
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  assert.deepEqual(assignments, [
    'AGRO_ENV=development',
    'AGRO_DEPLOYMENT_MODE=LOCAL_PRIMARY',
    'AGRO_SITE_TIME_ZONE=Etc/UTC',
    'AGRO_LOCAL_WRITE_ENABLED=true',
    'AGRO_CLOUD_WRITE_ENABLED=false',
    'PORT=3000',
  ]);
  assert.doesNotMatch(
    example,
    /(PASSWORD|TOKEN|PRIVATE_KEY|API_KEY|SECRET=|:\/\/[^\s/:]+:[^\s/@]+@)/i,
  );
});
