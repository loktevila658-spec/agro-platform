import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const sourceExtensions = new Set(['.cjs', '.dart', '.js', '.jsx', '.mjs', '.py', '.ts', '.tsx']);
const ignoredDirectories = new Set(['.next', 'dist', 'node_modules']);
export const applicationBoundaryRule = 'ARCH-APP-BOUNDARY-001';
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name))) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...walk(join(directory, entry.name)));
    } else if (entry.isFile() && sourceExtensions.has(extname(entry.name))) {
      files.push(join(directory, entry.name));
    }
  }
  return files;
}

function appOwner(root, path) {
  const relativePath = relative(root, path).split('\\').join('/');
  const match = relativePath.match(/^apps\/([^/]+)(?:\/|$)/);
  return match?.[1] ?? null;
}

function importSpecifiers(source, sourcePath) {
  const specifiers = [];
  const extension = extname(sourcePath);
  const patterns = extension === '.py'
    ? [/^\s*(?:from\s+(apps(?:\.[\w]+)+|packages(?:\.[\w]+)+)\s+import|import\s+(apps(?:\.[\w]+)+|packages(?:\.[\w]+)+))/gm]
    : extension === '.dart'
      ? [/^\s*(?:import|export|part)\s+['"]([^'"]+)['"]/gm]
      : [
          /^\s*import\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm,
          /^\s*export\s+[^'";]*?\s+from\s+['"]([^'"]+)['"]/gm,
          /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
          /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
        ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = extension === '.py' ? match[1] ?? match[2] : match[1];
      if (specifier) specifiers.push(specifier);
    }
  }
  return [...new Set(specifiers)].sort(compare);
}

function pathIsWithin(parent, candidate) {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === '' || (!pathFromParent.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && pathFromParent !== '..');
}

function nearestPackageRoot(root, sourcePath) {
  let directory = dirname(sourcePath);
  while (pathIsWithin(root, directory)) {
    try {
      if (statSync(join(directory, 'package.json')).isFile()) return directory;
    } catch {
      // Continue to the parent; a package manifest defines the ownership root.
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

function resolveCompiledSource(root, sourcePath, outputPath) {
  const packageRoot = nearestPackageRoot(root, sourcePath);
  if (!packageRoot) return null;

  const configPath = join(packageRoot, 'tsconfig.json');
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`${relative(root, configPath)}: cannot read TypeScript output mapping (${error.message})`);
  }

  const { outDir, rootDir } = config.compilerOptions ?? {};
  if (typeof outDir !== 'string' || typeof rootDir !== 'string') return null;
  const outputRoot = resolve(packageRoot, outDir);
  const sourceRoot = resolve(packageRoot, rootDir);
  if (!pathIsWithin(packageRoot, outputRoot) || !pathIsWithin(packageRoot, sourceRoot)) return null;
  if (!pathIsWithin(outputRoot, outputPath) || extname(outputPath) !== '.js') return null;

  const sourceRelative = relative(outputRoot, outputPath);
  const sourceBase = resolve(sourceRoot, sourceRelative.slice(0, -3));
  if (!pathIsWithin(sourceRoot, sourceBase)) return null;

  for (const extension of ['.ts', '.tsx', '.js', '.jsx']) {
    const candidate = `${sourceBase}${extension}`;
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Try the next source extension supported by this JavaScript build.
    }
  }

  throw new Error(
    `${relative(root, sourcePath)}: compiled output '${relative(packageRoot, outputPath)}' has no matching source under '${rootDir}'`,
  );
}

function resolveLocalImport(root, sourcePath, specifier) {
  if (!specifier.startsWith('.')) {
    if (specifier.startsWith('apps.') || specifier.startsWith('packages.')) {
      const target = resolve(root, ...specifier.split('.'));
      const candidates = [`${target}.py`, join(target, '__init__.py')];
      const found = candidates.find((candidate) => {
        try { return statSync(candidate).isFile(); } catch { return false; }
      });
      if (found) return resolve(found);
      try {
        if (statSync(target).isDirectory()) return target;
      } catch {
        // Report the unresolved project import below.
      }
      throw new Error(`${relative(root, sourcePath)}: unresolved workspace import '${specifier}'`);
    }
    if (specifier.startsWith('package:')) {
      const [, packageName, ...pathParts] = specifier.match(/^package:([^/]+)\/(.*)$/) ?? [];
      if (!packageName) return null;
      const parentPath = join(root, 'apps');
      for (const entry of readdirSync(parentPath, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const packageRoot = join(parentPath, entry.name);
        let manifest;
        try {
          manifest = readFileSync(join(packageRoot, 'pubspec.yaml'), 'utf8');
        } catch (error) {
          if (error?.code === 'ENOENT') continue;
          throw error;
        }
        if (manifest.match(new RegExp(`^name:\\s*${packageName}\\s*$`, 'm'))) {
          return pathParts.length ? resolve(packageRoot, ...pathParts) : packageRoot;
        }
      }
      return null;
    }
    if (!specifier.startsWith('@agroplatform/')) return null;
    const packageName = specifier.split('/').slice(0, 2).join('/');
    for (const parent of ['apps', 'packages']) {
      const parentPath = join(root, parent);
      let entries;
      try {
        entries = readdirSync(parentPath, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const packageRoot = join(parentPath, entry.name);
        try {
          const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
          if (manifest.name === packageName) return packageRoot;
        } catch (error) {
          if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
        }
      }
    }
    throw new Error(`unresolved workspace import '${specifier}'`);
  }
  const base = resolve(dirname(sourcePath), specifier);
  const compiledSource = resolveCompiledSource(root, sourcePath, base);
  if (compiledSource) return compiledSource;
  const candidates = [base];
  if (!sourceExtensions.has(extname(base))) {
    for (const extension of sourceExtensions) candidates.push(`${base}${extension}`);
    for (const extension of sourceExtensions) candidates.push(join(base, `index${extension}`));
  } else if (extname(base) === '.js') {
    // TypeScript source commonly uses emitted .js specifiers for .ts sources.
    candidates.push(base.slice(0, -3) + '.ts', base.slice(0, -3) + '.tsx');
  }
  const target = candidates.find((candidate) => {
    try {
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
  if (!target) {
    throw new Error(
      `${relative(root, sourcePath)}: unresolved local import '${specifier}'`,
    );
  }
  return resolve(target);
}

export function scanSourceFiles(root, sourceFiles) {
  const violations = [];
  const dependencies = [];
  const errors = [];

  for (const sourcePath of sourceFiles.map((file) => resolve(root, file)).sort(compare)) {
    let source;
    try {
      source = readFileSync(sourcePath, 'utf8');
    } catch (error) {
      errors.push(`${relative(root, sourcePath)}: cannot read source (${error.message})`);
      continue;
    }

    for (const specifier of importSpecifiers(source, sourcePath)) {
      let targetPath;
      try {
        targetPath = resolveLocalImport(root, sourcePath, specifier);
      } catch (error) {
        errors.push(error.message);
        continue;
      }
      if (!targetPath) continue;

      const sourceOwner = appOwner(root, sourcePath);
      const targetOwner = appOwner(root, targetPath);
      const sourceRelative = relative(root, sourcePath).split('\\').join('/');
      const targetRelative = relative(root, targetPath).split('\\').join('/');
      dependencies.push({ source: sourceRelative, specifier, target: targetRelative });

      if (targetOwner && targetOwner !== sourceOwner) {
        violations.push({
          rule: applicationBoundaryRule,
          source: sourceRelative,
          sourceApplication: sourceOwner ?? 'shared-package',
          specifier,
          target: targetRelative,
          targetApplication: targetOwner,
          message: 'runnable application source must not import another application implementation; use a shared package or contract',
        });
      }
    }
  }

  const sortBy = (a, b) => compare(JSON.stringify(a), JSON.stringify(b));
  return {
    errors: errors.sort(compare),
    dependencies: dependencies.sort(sortBy),
    violations: violations.sort(sortBy),
  };
}

export function scanRepository(root = repositoryRoot) {
  const sourceFiles = [];
  for (const directory of ['apps', 'packages']) {
    const absolute = join(root, directory);
    try {
      sourceFiles.push(...walk(absolute));
    } catch (error) {
      return {
        errors: [`${directory}: cannot scan source tree (${error.message})`],
        dependencies: [],
        violations: [],
      };
    }
  }
  return scanSourceFiles(root, sourceFiles);
}

export function evidenceFor(result) {
  return {
    gate: 'G1-architecture',
    rule: applicationBoundaryRule,
    repositoryRoot,
    sourceDependenciesChecked: result.dependencies.length,
    errors: result.errors,
    violations: result.violations,
    result: result.errors.length === 0 && result.violations.length === 0 ? 'PASS' : 'FAIL',
  };
}
