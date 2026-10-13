export const runtimeEnvironments = [
  'development',
  'test',
  'staging',
  'production',
] as const;

export type RuntimeEnvironment = (typeof runtimeEnvironments)[number];

export const deploymentModes = ['LOCAL_PRIMARY'] as const;

export type DeploymentMode = (typeof deploymentModes)[number];

export interface RuntimeAuthority {
  readonly localWrite: true;
  readonly cloudWrite: false;
}

export interface RuntimeConfig {
  readonly environment: RuntimeEnvironment;
  readonly deploymentMode: DeploymentMode;
  readonly siteTimeZone: string;
  readonly port: number;
  readonly authority: RuntimeAuthority;
}

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export const secretReferenceProviders = [
  'LOCAL_SECRETSTORE',
  'VAULT',
  'HSM',
  'OS_KEYSTORE',
  'EXTERNAL_CSP',
] as const;

export type SecretReferenceProvider = (typeof secretReferenceProviders)[number];

export interface SecretReference {
  readonly provider: SecretReferenceProvider;
  readonly locator: string;
  readonly purpose: string;
  readonly version?: string;
}

export interface ConfigValidationIssue {
  readonly variable: string;
  readonly message: string;
}

export class ConfigValidationError extends Error {
  readonly issues: readonly ConfigValidationIssue[];

  constructor(issues: readonly ConfigValidationIssue[]) {
    super(
      `Invalid runtime configuration:\n${issues
        .map((issue) => `- ${issue.variable}: ${issue.message}`)
        .join('\n')}`,
    );
    this.name = 'ConfigValidationError';
    this.issues = Object.freeze([...issues]);
  }
}

/** Parse a JSON-encoded reference to externally held secret material. */
export function parseRequiredSecretReference(
  source: EnvironmentSource,
  variable: string,
): SecretReference {
  const raw = source[variable];
  const invalid = () => new ConfigValidationError([
    { variable, message: 'must be a valid external secret reference' },
  ]);
  if (raw === undefined || raw.trim() === '') throw invalid();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalid();
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw invalid();
  const candidate = parsed as Record<string, unknown>;
  const allowedKeys = new Set(['provider', 'locator', 'purpose', 'version']);
  if (Object.keys(candidate).some((key) => !allowedKeys.has(key))) throw invalid();
  if (
    typeof candidate.provider !== 'string'
    || !(secretReferenceProviders as readonly string[]).includes(candidate.provider)
    || typeof candidate.locator !== 'string'
    || candidate.locator.trim() === ''
    || typeof candidate.purpose !== 'string'
    || candidate.purpose.trim() === ''
    || (candidate.version !== undefined
      && (typeof candidate.version !== 'string' || candidate.version.trim() === ''))
    || /-----BEGIN .*PRIVATE KEY-----/.test(raw)
  ) {
    throw invalid();
  }

  return Object.freeze({
    provider: candidate.provider as SecretReferenceProvider,
    locator: candidate.locator.trim(),
    purpose: candidate.purpose.trim(),
    ...(candidate.version === undefined ? {} : { version: (candidate.version as string).trim() }),
  });
}

const requiredVariables = [
  'AGRO_ENV',
  'AGRO_DEPLOYMENT_MODE',
  'AGRO_SITE_TIME_ZONE',
  'AGRO_LOCAL_WRITE_ENABLED',
  'AGRO_CLOUD_WRITE_ENABLED',
  'PORT',
] as const;

type RequiredVariable = (typeof requiredVariables)[number];

function isRuntimeEnvironment(value: string): value is RuntimeEnvironment {
  return (runtimeEnvironments as readonly string[]).includes(value);
}

function isDeploymentMode(value: string): value is DeploymentMode {
  return (deploymentModes as readonly string[]).includes(value);
}

function isIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function parseBoolean(value: string): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function readRequired(
  source: EnvironmentSource,
  issues: ConfigValidationIssue[],
): Partial<Record<RequiredVariable, string>> {
  const values: Partial<Record<RequiredVariable, string>> = {};

  for (const variable of requiredVariables) {
    const value = source[variable];
    if (value === undefined || value.trim() === '') {
      issues.push({ variable, message: 'is required' });
    } else {
      values[variable] = value.trim();
    }
  }

  return values;
}

export function parseRuntimeConfig(source: EnvironmentSource): RuntimeConfig {
  const issues: ConfigValidationIssue[] = [];
  const values = readRequired(source, issues);

  const environment = values.AGRO_ENV;
  if (environment !== undefined && !isRuntimeEnvironment(environment)) {
    issues.push({
      variable: 'AGRO_ENV',
      message: `must be one of: ${runtimeEnvironments.join(', ')}`,
    });
  }

  const deploymentMode = values.AGRO_DEPLOYMENT_MODE;
  if (deploymentMode !== undefined && !isDeploymentMode(deploymentMode)) {
    issues.push({
      variable: 'AGRO_DEPLOYMENT_MODE',
      message: 'must be LOCAL_PRIMARY',
    });
  }

  const siteTimeZone = values.AGRO_SITE_TIME_ZONE;
  if (siteTimeZone !== undefined && !isIanaTimeZone(siteTimeZone)) {
    issues.push({
      variable: 'AGRO_SITE_TIME_ZONE',
      message: 'must be a valid IANA time zone',
    });
  }

  const localWrite = values.AGRO_LOCAL_WRITE_ENABLED;
  const parsedLocalWrite =
    localWrite === undefined ? undefined : parseBoolean(localWrite);
  if (localWrite !== undefined && parsedLocalWrite === undefined) {
    issues.push({
      variable: 'AGRO_LOCAL_WRITE_ENABLED',
      message: 'must be the boolean true or false',
    });
  } else if (parsedLocalWrite === false) {
    issues.push({
      variable: 'AGRO_LOCAL_WRITE_ENABLED',
      message: 'must be true in LOCAL_PRIMARY mode',
    });
  }

  const cloudWrite = values.AGRO_CLOUD_WRITE_ENABLED;
  const parsedCloudWrite =
    cloudWrite === undefined ? undefined : parseBoolean(cloudWrite);
  if (cloudWrite !== undefined && parsedCloudWrite === undefined) {
    issues.push({
      variable: 'AGRO_CLOUD_WRITE_ENABLED',
      message: 'must be the boolean true or false',
    });
  } else if (parsedCloudWrite === true) {
    issues.push({
      variable: 'AGRO_CLOUD_WRITE_ENABLED',
      message: 'must be false; cloud writes are not authoritative',
    });
  }

  const rawPort = values.PORT;
  let port: number | undefined;
  if (rawPort !== undefined) {
    if (!/^[0-9]+$/.test(rawPort)) {
      issues.push({
        variable: 'PORT',
        message: 'must be a base-10 integer from 1 to 65535',
      });
    } else {
      port = Number(rawPort);
      if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
        issues.push({
          variable: 'PORT',
          message: 'must be a base-10 integer from 1 to 65535',
        });
      }
    }
  }

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }

  const authority = Object.freeze({
    localWrite: true as const,
    cloudWrite: false as const,
  });

  return Object.freeze({
    environment: environment as RuntimeEnvironment,
    deploymentMode: deploymentMode as DeploymentMode,
    siteTimeZone: siteTimeZone as string,
    port: port as number,
    authority,
  });
}
