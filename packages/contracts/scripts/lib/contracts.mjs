import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(moduleDirectory, '../../../..');

const OPENAPI_PATH = 'openapi/openapi.yaml';
const EVENT_CATALOG_PATH = 'events/catalog/index.yaml';
const EVENT_SCHEMA_PATH = 'events/schemas/event-catalog.schema.json';
const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
const SCHEMA_KEYWORDS = new Set([
  '$schema', '$id', 'title', 'type', 'additionalProperties', 'required', 'properties',
  'pattern', 'minLength', 'items', 'uniqueItems', 'enum',
]);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function stripYamlComment(line) {
  let quote;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote) {
      if (character === quote && line[index - 1] !== '\\') quote = undefined;
    } else if (character === "'" || character === '"') quote = character;
    else if (character === '#' && (index === 0 || /\s/.test(line[index - 1]))) return line.slice(0, index).trimEnd();
  }
  if (quote) throw new Error('unterminated quoted scalar');
  return line.trimEnd();
}

function mappingColon(value) {
  let quote;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote && value[index - 1] !== '\\') quote = undefined;
    } else if (character === "'" || character === '"') quote = character;
    else if (character === ':' && (index === value.length - 1 || /\s/.test(value[index + 1]))) return index;
  }
  return -1;
}

function yamlScalar(value, lineNumber) {
  if (value === '{}') return {};
  if (value === '[]') return [];
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('"')) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed !== 'string') throw new Error();
      return parsed;
    } catch {
      throw new Error(`line ${lineNumber}: invalid double-quoted scalar`);
    }
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2) throw new Error(`line ${lineNumber}: invalid single-quoted scalar`);
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (/^[\[\]{},&*!|>@`]/.test(value)) throw new Error(`line ${lineNumber}: unsupported or malformed scalar`);
  return value;
}

export function parseYamlDocument(source) {
  if (source.charCodeAt(0) === 0xfeff) throw new Error('YAML byte-order mark is not supported');
  if (source.includes('\t')) throw new Error('YAML tabs are not permitted');
  const tokens = [];
  source.split(/\r?\n/).forEach((raw, index) => {
    const line = stripYamlComment(raw);
    if (line.trim() === '') return;
    const indent = line.length - line.trimStart().length;
    if (indent % 2 !== 0) throw new Error(`line ${index + 1}: indentation must use two spaces`);
    tokens.push({ content: line.slice(indent), indent, line: index + 1 });
  });
  if (tokens.length === 0) throw new Error('YAML document is empty');

  function pair(content, token, target, childIndent, cursor) {
    const colon = mappingColon(content);
    if (colon < 1) throw new Error(`line ${token.line}: expected a mapping entry`);
    const key = yamlScalar(content.slice(0, colon).trim(), token.line);
    if (typeof key !== 'string' || key.length === 0) throw new Error(`line ${token.line}: invalid key`);
    if (Object.hasOwn(target, key)) throw new Error(`line ${token.line}: duplicate key ${key}`);
    const rawValue = content.slice(colon + 1).trim();
    if (rawValue !== '') return { cursor, value: yamlScalar(rawValue, token.line), key };
    if (cursor < tokens.length && tokens[cursor].indent > token.indent) {
      if (tokens[cursor].indent !== childIndent) throw new Error(`line ${tokens[cursor].line}: unexpected indentation`);
      const nested = block(cursor, childIndent);
      return { cursor: nested.cursor, value: nested.value, key };
    }
    return { cursor, value: null, key };
  }

  function block(start, indent) {
    const sequence = tokens[start].content === '-' || tokens[start].content.startsWith('- ');
    const value = sequence ? [] : {};
    let cursor = start;
    while (cursor < tokens.length) {
      const token = tokens[cursor];
      if (token.indent < indent) break;
      if (token.indent > indent) throw new Error(`line ${token.line}: unexpected indentation`);
      if (sequence) {
        if (!(token.content === '-' || token.content.startsWith('- '))) break;
        const rest = token.content.slice(1).trim();
        cursor += 1;
        if (rest === '') {
          if (cursor >= tokens.length || tokens[cursor].indent !== indent + 2) throw new Error(`line ${token.line}: empty sequence item`);
          const nested = block(cursor, indent + 2);
          value.push(nested.value);
          cursor = nested.cursor;
        } else if (mappingColon(rest) >= 1) {
          const item = {};
          const first = pair(rest, token, item, indent + 4, cursor);
          item[first.key] = first.value;
          cursor = first.cursor;
          if (cursor < tokens.length && tokens[cursor].indent === indent + 2) {
            const continuation = block(cursor, indent + 2);
            if (!isObject(continuation.value)) throw new Error(`line ${tokens[cursor].line}: expected mapping`);
            for (const [key, child] of Object.entries(continuation.value)) {
              if (Object.hasOwn(item, key)) throw new Error(`line ${tokens[cursor].line}: duplicate key ${key}`);
              item[key] = child;
            }
            cursor = continuation.cursor;
          }
          value.push(item);
        } else value.push(yamlScalar(rest, token.line));
      } else {
        if (token.content === '-' || token.content.startsWith('- ')) break;
        cursor += 1;
        const parsed = pair(token.content, token, value, indent + 2, cursor);
        value[parsed.key] = parsed.value;
        cursor = parsed.cursor;
      }
    }
    return { cursor, value };
  }

  if (tokens[0].indent !== 0) throw new Error('line 1: document root must not be indented');
  const parsed = block(0, 0);
  if (parsed.cursor !== tokens.length) throw new Error(`line ${tokens[parsed.cursor].line}: mixed collection types`);
  if (!isObject(parsed.value)) throw new Error('YAML document root must be a mapping');
  return parsed.value;
}

function resolveReference(document, reference) {
  if (typeof reference !== 'string' || !reference.startsWith('#/')) return undefined;
  return reference.slice(2).split('/').reduce((value, segment) => value?.[segment], document);
}

function dereference(document, value) {
  return isObject(value) && typeof value.$ref === 'string'
    ? resolveReference(document, value.$ref)
    : value;
}

function operationInputs(document, operation, route, label, errors) {
  const inputs = {};
  for (const rawParameter of operation.parameters ?? []) {
    const parameter = dereference(document, rawParameter);
    if (!isObject(parameter) || !['path', 'query', 'header'].includes(parameter.in) || typeof parameter.name !== 'string' || !isObject(parameter.schema) || !['string', 'integer', 'number', 'boolean'].includes(parameter.schema.type)) {
      errors.push(`${label} has an invalid path, query, or header parameter`);
      continue;
    }
    (inputs[parameter.in] ??= []).push({ name: parameter.name, required: parameter.required === true, type: parameter.schema.type });
  }
  const routeParameters = [...route.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  const pathParameters = (inputs.path ?? []).map(({ name }) => name);
  if (routeParameters.some((name) => !pathParameters.includes(name)) || pathParameters.some((name) => !routeParameters.includes(name))) errors.push(`${label} path parameters must match route placeholders`);
  const body = operation.requestBody ? dereference(document, operation.requestBody) : undefined;
  const schema = body?.content?.['application/json']?.schema;
  const binary=body?.content?.['application/octet-stream']?.schema;
  if(binary?.type==='string' && binary?.format==='binary') inputs.binary={required:body.required===true};
  if (operation.requestBody && !inputs.binary && (!isObject(body) || !isObject(schema))) errors.push(`${label} requestBody must define an application/json schema`);
  if (schema) {
    const reference = schema.$ref;
    if (typeof reference !== 'string' || !isObject(resolveReference(document, reference))) errors.push(`${label} requestBody schema must reference a declared component schema`);
    else inputs.body = { schemaName: reference.split('/').at(-1), required: body.required === true };
  }
  if (Object.keys(inputs).length === 0) return {};
  for (const location of ['path', 'query', 'header']) if (inputs[location]) inputs[location].sort((left, right) => left.name.localeCompare(right.name));
  return { inputs };
}

export function validateOpenApi(source) {
  let document;
  try {
    document = parseYamlDocument(source);
  } catch (error) {
    throw new Error(`Invalid OpenAPI syntax: ${error.message}`);
  }
  const errors = [];
  if (!/^3\.1\.\d+$/.test(document.openapi ?? '')) errors.push('openapi must be version 3.1.x');
  if (!isObject(document.info) || typeof document.info.title !== 'string' || typeof document.info.version !== 'string') errors.push('info must contain string title and version');
  if (!isObject(document.paths)) errors.push('paths must be an object');
  if (!isObject(document.components?.schemas)) errors.push('components.schemas must be an object');

  const operations = [];
  const operationIds = new Set();
  if (isObject(document.paths)) {
    for (const route of Object.keys(document.paths).sort()) {
      const pathItem = document.paths[route];
      if (!route.startsWith('/') || !isObject(pathItem)) {
        errors.push(`paths.${route} must be an object at an absolute route`);
        continue;
      }
      for (const method of Object.keys(pathItem).sort()) {
        if (!HTTP_METHODS.has(method)) {
          errors.push(`${method.toUpperCase()} ${route} is not a supported operation`);
          continue;
        }
        const operation = pathItem[method];
        const label = `${method.toUpperCase()} ${route}`;
        if (!isObject(operation) || !/^[A-Za-z][A-Za-z0-9]*$/.test(operation.operationId ?? '')) {
          errors.push(`${label} must have a valid operationId`);
          continue;
        }
        if (operationIds.has(operation.operationId)) errors.push(`duplicate operationId ${operation.operationId}`);
        operationIds.add(operation.operationId);
        if (!isObject(operation.responses) || Object.keys(operation.responses).length === 0) {
          errors.push(`${label} must define responses`);
          continue;
        }
        const success = Object.entries(operation.responses).find(([status]) => /^2\d\d$/.test(status));
        const reference = success?.[1]?.content?.['application/json']?.schema?.$ref;
        if (!success || !isObject(resolveReference(document, reference))) errors.push(`${label} must define a JSON success response schema reference`);
        operations.push({ method: method.toUpperCase(), operationId: operation.operationId, path: route, responseSchemaName: typeof reference === 'string' ? reference.split('/').at(-1) : undefined, ...operationInputs(document, { ...operation, parameters: [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])] }, route, label, errors) });
      }
    }
  }

  for (const [name, schema] of Object.entries(document.components?.schemas ?? {})) {
    if (!isObject(schema) || schema.type !== 'object' || !isObject(schema.properties)) {
      errors.push(`components.schemas.${name} must be an object schema with properties`);
      continue;
    }
    if (!Array.isArray(schema.required) || !schema.required.every((key) => Object.hasOwn(schema.properties, key))) errors.push(`components.schemas.${name}.required must reference declared properties`);
    for (const [property, definition] of Object.entries(schema.properties)) {
      const validReference = isObject(definition) && typeof definition.$ref === 'string' && isObject(resolveReference(document, definition.$ref));
      const validPrimitive = isObject(definition) && ['string', 'integer', 'number', 'boolean', 'object'].includes(definition.type);
      const validArray = isObject(definition) && definition.type === 'array' && isObject(definition.items) && (
        ['string', 'integer', 'number', 'boolean'].includes(definition.items.type)
        || (typeof definition.items.$ref === 'string' && isObject(resolveReference(document, definition.items.$ref)))
      );
      if (!validReference && !validPrimitive && !validArray) errors.push(`components.schemas.${name}.properties.${property} has unsupported type`);
      if (definition?.enum && (!Array.isArray(definition.enum) || !definition.enum.every((entry) => typeof entry === 'string'))) errors.push(`components.schemas.${name}.properties.${property}.enum must contain strings`);
    }
  }
  if (errors.length > 0) throw new Error(`Invalid OpenAPI structure:\n- ${errors.join('\n- ')}`);
  return { document, operations };
}

function schemaTypeMatches(type, value) {
  if (type === 'object') return isObject(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return false;
}

export function validateJsonSchema(schema, value, location = '$') {
  const errors = [];
  function visit(definition, current, at) {
    if (!schemaTypeMatches(definition.type, current)) {
      errors.push(`${at} must be ${definition.type}`);
      return;
    }
    if (definition.enum && !definition.enum.some((entry) => Object.is(entry, current))) errors.push(`${at} must be one of ${definition.enum.join(', ')}`);
    if (typeof current === 'string') {
      if (definition.minLength !== undefined && current.length < definition.minLength) errors.push(`${at} is shorter than minLength`);
      if (definition.pattern !== undefined && !new RegExp(definition.pattern, 'u').test(current)) errors.push(`${at} does not match pattern`);
    }
    if (Array.isArray(current)) {
      if (definition.uniqueItems && new Set(current.map((entry) => JSON.stringify(entry))).size !== current.length) errors.push(`${at} must contain unique items`);
      if (definition.items) current.forEach((entry, index) => visit(definition.items, entry, `${at}[${index}]`));
    }
    if (isObject(current)) {
      for (const required of definition.required ?? []) if (!Object.hasOwn(current, required)) errors.push(`${at}.${required} is required`);
      if (definition.additionalProperties === false) {
        for (const key of Object.keys(current)) if (!Object.hasOwn(definition.properties ?? {}, key)) errors.push(`${at}.${key} is not allowed`);
      }
      for (const [key, child] of Object.entries(definition.properties ?? {})) if (Object.hasOwn(current, key)) visit(child, current[key], `${at}.${key}`);
    }
  }
  visit(schema, value, location);
  return errors;
}

export function validateEventSchema(schema) {
  const errors = [];
  if (!isObject(schema) || schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') errors.push('schema must declare JSON Schema draft 2020-12');
  function inspect(definition, at) {
    if (!isObject(definition)) {
      errors.push(`${at} must be an object`);
      return;
    }
    for (const key of Object.keys(definition)) if (!SCHEMA_KEYWORDS.has(key)) errors.push(`${at} uses unsupported keyword ${key}`);
    if (!['object', 'array', 'string', 'boolean', 'integer', 'number'].includes(definition.type)) errors.push(`${at}.type is unsupported`);
    for (const [key, child] of Object.entries(definition.properties ?? {})) inspect(child, `${at}.properties.${key}`);
    if (definition.items) inspect(definition.items, `${at}.items`);
  }
  inspect(schema, '$');
  if (errors.length > 0) throw new Error(`Invalid event catalog schema:\n- ${errors.join('\n- ')}`);
  return schema;
}

export function validateEventCatalog(catalog, schema) {
  const errors = validateJsonSchema(schema, catalog);
  const identities = new Set();
  for (const [index, event] of (catalog?.events ?? []).entries()) {
    const identity = `${event.name}@${event.version}`;
    if (identities.has(identity)) errors.push(`$.events[${index}] duplicates ${identity}`);
    identities.add(identity);
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
  let eventSchema;
  try {
    eventSchema = validateEventSchema(JSON.parse(eventSchemaSource));
  } catch (error) {
    throw new Error(`Invalid event schema syntax or structure: ${error.message}`);
  }
  let eventCatalog;
  try {
    eventCatalog = parseYamlDocument(eventCatalogSource);
  } catch (error) {
    throw new Error(`Invalid event catalog syntax: ${error.message}`);
  }
  const events = validateEventCatalog(eventCatalog, eventSchema);
  return {
    openapi, events, eventSchema,
    sources: {
      [OPENAPI_PATH]: sha256(openapiSource),
      [EVENT_CATALOG_PATH]: sha256(eventCatalogSource),
      [EVENT_SCHEMA_PATH]: sha256(eventSchemaSource),
    },
  };
}

function argumentName(name) {
  const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return parts.map((part, index) => index === 0 ? part[0].toLowerCase() + part.slice(1) : part[0].toUpperCase() + part.slice(1)).join('');
}

function hasOnlyOptionalHeaders(inputs) {
  const headers = inputs.header ?? [];
  return !inputs.body
    && (inputs.path ?? []).length === 0
    && (inputs.query ?? []).length === 0
    && headers.length > 0
    && headers.every((parameter) => !parameter.required);
}

function tsType(definition) {
  if (definition.$ref) return definition.$ref.split('/').at(-1);
  if (definition.type === 'array') return `readonly ${tsType(definition.items)}[]`;
  if (definition.enum) return definition.enum.map((value) => `'${value}'`).join(' | ');
  return { string: 'string', integer: 'number', number: 'number', boolean: 'boolean', object: 'Readonly<Record<string, unknown>>' }[definition.type] ?? 'unknown';
}

function renderTypeScript(contracts) {
  const schemas = Object.entries(contracts.openapi.document.components.schemas).sort(([left], [right]) => left.localeCompare(right));
  const models = schemas.map(([name, schema]) => {
    const required = new Set(schema.required ?? []);
    const properties = Object.entries(schema.properties).sort(([left], [right]) => left.localeCompare(right));
    return `export interface ${name} {\n${properties.map(([property, definition]) => `  readonly ${property}${required.has(property) ? '' : '?'}: ${tsType(definition)};`).join('\n')}\n}`;
  }).join('\n\n');
  const methods = contracts.openapi.operations.map((operation) => {
    const inputs = operation.inputs ?? {};
    const parameters = [...(inputs.path ?? []), ...(inputs.query ?? []), ...(inputs.header ?? [])];
    const optionalHeadersOnly = hasOnlyOptionalHeaders(inputs);
    const args = parameters.map((parameter) => ({ required: parameter.required, value: `${argumentName(parameter.name)}${parameter.required ? '' : '?'}: ${tsType({ type: parameter.type })}` }));
    if(inputs.binary)args.push({required:true,value:'body: Uint8Array<ArrayBuffer>'});
    if (inputs.body) args.push({ required: inputs.body.required, value: `body${inputs.body.required ? '' : '?'}: ${inputs.body.schemaName}` });
    args.sort((left, right) => Number(right.required) - Number(left.required));
    const route = operation.path.replace(/\{([^}]+)\}/g, (_, name) => `\${encodeURIComponent(String(${argumentName(name)}))}`);
    const query = (inputs.query ?? []).map((parameter) => `    if (${argumentName(parameter.name)} !== undefined) url.searchParams.set(${JSON.stringify(parameter.name)}, String(${argumentName(parameter.name)}));`).join('\n');
    const headers = (inputs.header ?? []).map((parameter) => `    if (${argumentName(parameter.name)} !== undefined) headers[${JSON.stringify(parameter.name)}] = String(${argumentName(parameter.name)});`).join('\n');
    const body = inputs.binary ? `    headers['Content-Type'] = 'application/octet-stream';\n    const requestBody = body;\n` : inputs.body ? `    headers['Content-Type'] = 'application/json';\n    const requestBody = ${inputs.body.required ? 'JSON.stringify(body)' : 'body === undefined ? undefined : JSON.stringify(body)'};\n` : '';
    const init = optionalHeadersOnly
      ? `method: '${operation.method}', ...(Object.keys(headers).length ? { headers } : {})`
      : `method: '${operation.method}'${parameters.length || inputs.body || inputs.binary ? `, headers${inputs.body || inputs.binary ? ', body: requestBody' : ''}` : ''}`;
    return `  async ${operation.operationId}(${args.map(({ value }) => value).join(', ')}): Promise<${operation.responseSchemaName}> {\n    const url = new URL(\`${'${this.baseUrl}'}${route}\`);${query ? `\n${query}` : ''}\n    const headers: Record<string, string> = {};${headers ? `\n${headers}` : ''}\n${body}    const response = await this.transport(url.toString(), { ${init} });\n    if (!response.ok) throw new Error(\`${operation.operationId} failed with HTTP ${'${response.status}'}\`);\n    return await response.json() as ${operation.responseSchemaName};\n  }`;
  }).join('\n\n');
  return `/**\n * @generated by @agroplatform/contracts. DO NOT EDIT.\n * Sources: ${OPENAPI_PATH}, ${EVENT_CATALOG_PATH}\n */\n\nexport const OPENAPI_VERSION = '${contracts.openapi.document.openapi}' as const;\nexport const API_CONTRACT_VERSION = '${contracts.openapi.document.info.version}' as const;\nexport const EVENT_CATALOG_VERSION = '${contracts.events.catalogVersion}' as const;\n\n${models}\n\nexport interface EventDefinition {\n  readonly name: string;\n  readonly version: string;\n  readonly producer: string;\n  readonly consumers: readonly string[];\n  readonly schema: Readonly<Record<string, unknown>>;\n}\n\nexport const EVENT_DEFINITIONS: readonly EventDefinition[] = ${JSON.stringify(contracts.events.events, null, 2)};\n\nexport interface ApiTransportResponse {\n  readonly ok: boolean;\n  readonly status: number;\n  json(): Promise<unknown>;\n}\n\nexport type ApiTransport = (url: string, init: { readonly method: string; readonly headers?: Readonly<Record<string, string>>; readonly body?: string | Uint8Array<ArrayBuffer> }) => Promise<ApiTransportResponse>;\n\nexport interface ApiClientOptions {\n  readonly baseUrl: string;\n  readonly transport?: ApiTransport;\n}\n\nconst defaultTransport: ApiTransport = (url, init) => fetch(url, init);\n\nexport class AgroPlatformApiClient {\n  readonly baseUrl: string;\n  private readonly transport: ApiTransport;\n\n  constructor(options: ApiClientOptions) {\n    this.baseUrl = options.baseUrl.replace(/\\/+$/, '');\n    this.transport = options.transport ?? defaultTransport;\n  }\n\n${methods}\n}\n`;
}

function dartString(value) {
  return `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function dartLiteral(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return dartString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `<Object?>[${value.map(dartLiteral).join(', ')}]`;
  return `<String, Object?>{${Object.entries(value).map(([key, child]) => `${dartString(key)}: ${dartLiteral(child)}`).join(', ')}}`;
}

function dartType(definition) {
  if (definition.$ref) return definition.$ref.split('/').at(-1);
  if (definition.type === 'array') return `List<${dartType(definition.items)}>`;
  return { string: 'String', integer: 'int', number: 'num', boolean: 'bool', object: 'Map<String, Object?>' }[definition.type] ?? 'Object?';
}

function dartRead(property, definition) {
  if (definition.$ref) return `${dartType(definition)}.fromJson(Map<String, Object?>.from(json[${dartString(property)}] as Map))`;
  if (definition.type === 'array') {
    const item = definition.items;
    const parsed = item.$ref
      ? `${dartType(item)}.fromJson(Map<String, Object?>.from(item as Map))`
      : `item as ${dartType(item)}`;
    return `(json[${dartString(property)}] as List<Object?>).map((item) => ${parsed}).toList(growable: false)`;
  }
  if (definition.type === 'integer') return `(json[${dartString(property)}] as num).toInt()`;
  return `json[${dartString(property)}] as ${dartType(definition)}`;
}

function renderDart(contracts) {
  const schemas = Object.entries(contracts.openapi.document.components.schemas).sort(([left], [right]) => left.localeCompare(right));
  const models = schemas.map(([name, schema]) => {
    const required = new Set(schema.required ?? []);
    const properties = Object.entries(schema.properties).sort(([left], [right]) => left.localeCompare(right));
    return `class ${name} {\n  const ${name}({\n${properties.map(([property]) => `    ${required.has(property) ? 'required ' : ''}this.${property},`).join('\n')}\n  });\n\n  factory ${name}.fromJson(Map<String, Object?> json) => ${name}(\n${properties.map(([property, definition]) => `        ${property}: ${required.has(property) ? dartRead(property, definition) : `json[${dartString(property)}] == null ? null : ${dartRead(property, definition)}`},`).join('\n')}\n      );\n\n  Map<String, Object?> toJson() => <String, Object?>{${properties.map(([property]) => required.has(property) ? `${dartString(property)}: ${property}` : `if (${property} != null) ${dartString(property)}: ${property}`).join(', ')}};\n\n${properties.map(([property, definition]) => `  final ${dartType(definition)}${required.has(property) ? '' : '?'} ${property};`).join('\n')}\n}`;
  }).join('\n\n');
  const events = contracts.events.events.map((event) => `  EventDefinition(\n    name: ${dartString(event.name)},\n    version: ${dartString(event.version)},\n    producer: ${dartString(event.producer)},\n    consumers: <String>[${event.consumers.map(dartString).join(', ')}],\n    schema: ${dartLiteral(event.schema)},\n  )`).join(',\n');
  const methods = contracts.openapi.operations.map((operation) => {
    const inputs = operation.inputs ?? {};
    const parameters = [...(inputs.path ?? []), ...(inputs.query ?? []), ...(inputs.header ?? [])];
    const optionalHeadersOnly = hasOnlyOptionalHeaders(inputs);
    const args = parameters.map((parameter) => `${parameter.required ? 'required ' : ''}${dartType({ type: parameter.type })}${parameter.required ? '' : '?'} ${argumentName(parameter.name)}`);
    if (inputs.body) args.push(`${inputs.body.required ? 'required ' : ''}${inputs.body.schemaName}${inputs.body.required ? '' : '?'} body`);
    if(inputs.binary)args.push('required Uint8List body');
    const routeParts = operation.path.split(/\{([^}]+)\}/g);
    const route = routeParts.map((part, index) => index % 2 ? `Uri.encodeComponent(${argumentName(part)}${(inputs.path ?? []).find((item) => item.name === part)?.required ? '' : '!'})` : dartString(part)).join(' + ');
    const queryEntries = (inputs.query ?? []).map(({ name }) => `if (${argumentName(name)} != null) ${dartString(name)}: ${argumentName(name)}!.toString()`);
    const query = queryEntries.length ? `.replace(queryParameters: <String, String>{${queryEntries.join(', ')}})` : '';
    const headers = (inputs.header ?? []).map(({ name, required }) => `if (${argumentName(name)} != null) ${dartString(name)}: ${argumentName(name)}${required ? '' : '!'}`).join(', ');
    const requestHeaders = inputs.body ? `${headers}${headers ? ', ' : ''}'Content-Type': 'application/json'` : headers;
    if (optionalHeadersOnly) {
      const url = `baseUri.resolve(${route})${query}`;
      return `  Future<${operation.responseSchemaName}> ${operation.operationId}(${args.length ? `{${args.join(', ')}}` : ''}) async {\n    final headers = <String, String>{${requestHeaders}};\n    final url = ${url};\n    final Map<String, Object?> json;\n    if (headers.isEmpty) {\n      json = await transport(url, ${dartString(operation.method)});\n    } else {\n      final send = requestTransport;\n      if (send == null) throw StateError('requestTransport is required for ${operation.operationId} when optional headers are supplied');\n      json = await send(url, ${dartString(operation.method)}, headers: headers, body: null);\n    }\n    return ${operation.responseSchemaName}.fromJson(json);\n  }`;
    }
    if(inputs.binary) {
      return `  Future<${operation.responseSchemaName}> ${operation.operationId}({${args.join(', ')}}) async {\n    final send=binaryTransport;\n    if(send==null)throw StateError('binaryTransport is required for ${operation.operationId}');\n    return ${operation.responseSchemaName}.fromJson(await send(baseUri.resolve(${route}),${dartString(operation.method)},headers:<String,String>{${headers},'Content-Type':'application/octet-stream'},body:body));\n  }`;
    }
    const usesRequestTransport = parameters.length > 0 || Boolean(inputs.body);
    const call = usesRequestTransport
      ? `requestTransport!(baseUri.resolve(${route})${query}, ${dartString(operation.method)}, headers: <String, String>{${requestHeaders}}, body: ${inputs.body ? 'jsonEncode(body.toJson())' : 'null'})`
      : `transport(baseUri.resolve(${route})${query}, ${dartString(operation.method)})`;
    return `  Future<${operation.responseSchemaName}> ${operation.operationId}(${args.length ? `{${args.join(', ')}}` : ''}) async {\n${usesRequestTransport ? `    final send = requestTransport;\n    if (send == null) throw StateError('requestTransport is required for ${operation.operationId}');\n` : ''}    final json = await ${usesRequestTransport ? call.replace('requestTransport!', 'send') : call};\n    return ${operation.responseSchemaName}.fromJson(json);\n  }`;
  }).join('\n\n');
  return `// @generated by @agroplatform/contracts. DO NOT EDIT.\n// Sources: ${OPENAPI_PATH}, ${EVENT_CATALOG_PATH}\n\nimport 'dart:convert';\nimport 'dart:typed_data';\n\nconst openApiVersion = '${contracts.openapi.document.openapi}';\nconst apiContractVersion = '${contracts.openapi.document.info.version}';\nconst eventCatalogVersion = '${contracts.events.catalogVersion}';\n\n${models}\n\nclass EventDefinition {\n  const EventDefinition({\n    required this.name,\n    required this.version,\n    required this.producer,\n    required this.consumers,\n    required this.schema,\n  });\n\n  final String name;\n  final String version;\n  final String producer;\n  final List<String> consumers;\n  final Map<String, Object?> schema;\n}\n\nconst List<EventDefinition> eventDefinitions = <EventDefinition>[\n${events}\n];\n\ntypedef ApiTransport = Future<Map<String, Object?>> Function(Uri uri, String method);\ntypedef ApiRequestTransport = Future<Map<String, Object?>> Function(Uri uri, String method, {required Map<String, String> headers, String? body});\n\ntypedef ApiBinaryTransport = Future<Map<String, Object?>> Function(Uri uri, String method, {required Map<String,String> headers, required Uint8List body});\n\nclass AgroPlatformApiClient {\n  AgroPlatformApiClient({required this.baseUri, required this.transport, this.requestTransport, this.binaryTransport});\n\n  final Uri baseUri;\n  final ApiTransport transport;\n  final ApiRequestTransport? requestTransport;\n  final ApiBinaryTransport? binaryTransport;\n\n${methods}\n}\n`;
}

export function renderGeneratedArtifacts(contracts) {
  const dart = renderDart(contracts);
  const typescript = renderTypeScript(contracts);
  const manifest = {
    generator: '@agroplatform/contracts', formatVersion: 1, sources: contracts.sources,
    outputs: {
      'generated/dart/contracts.dart': sha256(dart),
      'src/generated/contracts.ts': sha256(typescript),
    },
  };
  return new Map([
    ['generated/dart/contracts.dart', dart],
    ['../../apps/mobile/lib/generated/contracts.dart', '// dart format off\n// ignore_for_file: unnecessary_null_comparison, unnecessary_non_null_assertion, unnecessary_brace_in_string_interps, prefer_interpolation_to_compose_strings, use_null_aware_elements\n'+dart],
    ['generated/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`],
    ['src/generated/contracts.ts', typescript],
  ]);
}

export function detectGeneratedDrift(expected, actual) {
  return [...expected].filter(([relativePath, content]) => actual.get(relativePath) !== content).map(([relativePath]) => relativePath);
}
