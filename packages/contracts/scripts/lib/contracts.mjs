import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(moduleDirectory, '../../../..');

const OPENAPI_PATH = 'openapi/openapi.yaml';
const EVENT_CATALOG_PATH = 'events/catalog/index.json';
const EVENT_SCHEMA_PATH = 'events/schemas/event-catalog.schema.json';
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const EVENT_NAME = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function topLevelValue(source, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...source.matchAll(new RegExp(`^${escaped}:\\s*(.+)$`, 'gm'))];
  if (matches.length !== 1) return undefined;
  return matches[0][1].trim();
}

function nestedValue(source, section, key) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `${section}:`);
  if (start < 0) return undefined;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line && !line.startsWith(' ')) break;
    const match = line?.match(new RegExp(`^  ${key}:\\s*(.+)$`));
    if (match) return match[1].trim();
  }
  return undefined;
}

export function validateOpenApi(source) {
  const errors = [];
  if (source.includes('\t')) errors.push('tabs are not permitted');
  const openapiVersion = topLevelValue(source, 'openapi');
  const title = nestedValue(source, 'info', 'title');
  const apiVersion = nestedValue(source, 'info', 'version');
  const paths = topLevelValue(source, 'paths');
  const schemas = nestedValue(source, 'components', 'schemas');

  if (!/^3\.1\.\d+$/.test(openapiVersion ?? '')) {
    errors.push('OpenAPI version must be 3.1.x');
  }
  if (!title) errors.push('info.title must be a non-empty scalar');
  if (!apiVersion) errors.push('info.version must be a non-empty scalar');
  if (paths !== '{}') errors.push('bootstrap paths must be an explicit empty mapping');
  if (schemas !== '{}') errors.push('components.schemas must be an explicit mapping');
  if (errors.length > 0) throw new Error(`Invalid OpenAPI contract:\n- ${errors.join('\n- ')}`);

  return { apiVersion, openapiVersion, paths: [], title };
}

export function validateEventSchema(schema) {
  const errors = [];
  if (schema?.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
    errors.push('schema must declare JSON Schema draft 2020-12');
  }
  if (schema?.type !== 'object') errors.push('schema root type must be object');
  if (!Array.isArray(schema?.required) || !schema.required.includes('events')) {
    errors.push('schema must require events');
  }
  if (schema?.properties?.events?.type !== 'array') {
    errors.push('schema must define events as an array');
  }
  if (errors.length > 0) throw new Error(`Invalid event catalog schema:\n- ${errors.join('\n- ')}`);
  return schema;
}

export function validateEventCatalog(catalog) {
  const errors = [];
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    throw new Error('Invalid event catalog:\n- catalog must be an object');
  }
  if (!SEMVER.test(catalog.catalogVersion ?? '')) {
    errors.push('catalogVersion must be semantic version');
  }
  if (!Array.isArray(catalog.events)) {
    errors.push('events must be an array');
  } else {
    const identities = new Set();
    catalog.events.forEach((event, index) => {
      const prefix = `events[${index}]`;
      if (!EVENT_NAME.test(event?.name ?? '')) errors.push(`${prefix} event name is invalid`);
      if (!SEMVER.test(event?.version ?? '')) errors.push(`${prefix} version must be semantic version`);
      if (typeof event?.producer !== 'string' || event.producer.length === 0) {
        errors.push(`${prefix} producer must be non-empty`);
      }
      if (!Array.isArray(event?.consumers)) {
        errors.push(`${prefix} consumers must be an array`);
      } else if (new Set(event.consumers).size !== event.consumers.length) {
        errors.push(`${prefix} consumers must be unique`);
      }
      if (event?.schema?.type !== 'object') errors.push(`${prefix} schema type must be object`);
      const identity = `${event?.name}@${event?.version}`;
      if (identities.has(identity)) errors.push(`${prefix} duplicates ${identity}`);
      identities.add(identity);
    });
  }
  if (errors.length > 0) throw new Error(`Invalid event catalog:\n- ${errors.join('\n- ')}`);
  return catalog;
}

export async function loadAndValidateContracts(root = repositoryRoot) {
  const [openapiSource, eventCatalogSource, eventSchemaSource] = await Promise.all([
    readFile(path.join(root, OPENAPI_PATH), 'utf8'),
    readFile(path.join(root, EVENT_CATALOG_PATH), 'utf8'),
    readFile(path.join(root, EVENT_SCHEMA_PATH), 'utf8'),
  ]);
  const openapi = validateOpenApi(openapiSource);
  const eventSchema = validateEventSchema(JSON.parse(eventSchemaSource));
  const events = validateEventCatalog(JSON.parse(eventCatalogSource));
  return {
    openapi,
    events,
    eventSchema,
    sources: {
      [OPENAPI_PATH]: sha256(openapiSource),
      [EVENT_CATALOG_PATH]: sha256(eventCatalogSource),
      [EVENT_SCHEMA_PATH]: sha256(eventSchemaSource),
    },
  };
}

function renderTypeScript(contracts) {
  return `/**\n * @generated by @agroplatform/contracts. DO NOT EDIT.\n * Sources: ${OPENAPI_PATH}, ${EVENT_CATALOG_PATH}\n */\n\nexport const OPENAPI_VERSION = '${contracts.openapi.openapiVersion}' as const;\nexport const API_CONTRACT_VERSION = '${contracts.openapi.apiVersion}' as const;\nexport const EVENT_CATALOG_VERSION = '${contracts.events.catalogVersion}' as const;\n\nexport interface EventDefinition {\n  readonly name: string;\n  readonly version: string;\n  readonly producer: string;\n  readonly consumers: readonly string[];\n  readonly schema: Readonly<Record<string, unknown>>;\n}\n\nexport const EVENT_DEFINITIONS: readonly EventDefinition[] = ${JSON.stringify(contracts.events.events, null, 2)};\n\nexport interface ApiClientOptions {\n  readonly baseUrl: string;\n}\n\n/** Endpoint methods are added only when authorized operations enter the OpenAPI source. */\nexport class AgroPlatformApiClient {\n  readonly baseUrl: string;\n\n  constructor(options: ApiClientOptions) {\n    this.baseUrl = options.baseUrl.replace(/\\/+$/, '');\n  }\n}\n`;
}

function renderDart(contracts) {
  return `// @generated by @agroplatform/contracts. DO NOT EDIT.\n// Sources: ${OPENAPI_PATH}, ${EVENT_CATALOG_PATH}\n\nconst openApiVersion = '${contracts.openapi.openapiVersion}';\nconst apiContractVersion = '${contracts.openapi.apiVersion}';\nconst eventCatalogVersion = '${contracts.events.catalogVersion}';\n\nclass EventDefinition {\n  const EventDefinition({\n    required this.name,\n    required this.version,\n    required this.producer,\n    required this.consumers,\n    required this.schema,\n  });\n\n  final String name;\n  final String version;\n  final String producer;\n  final List<String> consumers;\n  final Map<String, Object?> schema;\n}\n\nconst List<EventDefinition> eventDefinitions = [];\n\n/// Endpoint methods are added only when authorized operations enter OpenAPI.\nclass AgroPlatformApiClient {\n  AgroPlatformApiClient({required this.baseUri});\n\n  final Uri baseUri;\n}\n`;
}

export function renderGeneratedArtifacts(contracts) {
  const dart = renderDart(contracts);
  const typescript = renderTypeScript(contracts);
  const manifest = {
    generator: '@agroplatform/contracts',
    formatVersion: 1,
    sources: contracts.sources,
    outputs: {
      'generated/dart/contracts.dart': sha256(dart),
      'src/generated/contracts.ts': sha256(typescript),
    },
  };
  return new Map([
    ['generated/dart/contracts.dart', dart],
    ['generated/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`],
    ['src/generated/contracts.ts', typescript],
  ]);
}

export function detectGeneratedDrift(expected, actual) {
  return [...expected]
    .filter(([relativePath, content]) => actual.get(relativePath) !== content)
    .map(([relativePath]) => relativePath);
}
