import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skippedDirectories = new Set(['.git', 'node_modules', '.pnpm-store']);
const tokenPatterns = Object.freeze([
  Object.freeze({
    rule: 'private-key-pem',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
  }),
  Object.freeze({
    rule: 'provider-token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,}|xox[baprs]-[A-Za-z0-9-]{20,}|sk_live_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{35})\b/,
  }),
]);
const credentialAssignment = /\b[A-Z][A-Z0-9_]*(?:PASSWORD|PASSWD|TOKEN|SECRET|API_KEY|ACCESS_KEY|PRIVATE_KEY)\b\s*[:=]\s*["']?([A-Za-z0-9_+/=-]{24,})/i;
const credentialUrl = /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:@/]+:([A-Za-z0-9_+/=%-]{20,})@/i;

function hasHighEntropy(value) {
  if (value.length < 24 || new Set(value).size < 12) return false;
  const counts = new Map();
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy >= 3.8;
}

export function scanText(contents) {
  const findings = [];
  const lines = String(contents).split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    let highConfidenceMatch = false;
    for (const { rule, pattern } of tokenPatterns) {
      if (pattern.test(line)) {
        findings.push({ line: index + 1, rule });
        highConfidenceMatch = true;
      }
    }
    if (!highConfidenceMatch && (credentialAssignment.test(line) || credentialUrl.test(line))) {
      const value = (credentialAssignment.exec(line) ?? credentialUrl.exec(line))?.[1];
      if (value && hasHighEntropy(value)) {
        findings.push({ line: index + 1, rule: 'high-entropy-credential' });
      }
    }
  }
  return findings.sort((a, b) => a.line - b.line || (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0));
}

async function collectTextFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const files = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) {
        files.push(...await collectTextFiles(root, path));
      }
      continue;
    }
    if (entry.isFile()) files.push(path);
  }
  return files;
}

export async function scanRepository(root = repositoryRoot) {
  const files = await collectTextFiles(root);
  const findings = [];
  let filesScanned = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });

  for (const path of files) {
    let contents;
    try {
      contents = decoder.decode(await readFile(path));
    } catch (error) {
      if (error instanceof TypeError) continue;
      throw new Error(`Unable to scan repository file: ${relative(root, path).split(sep).join('/')}`);
    }
    filesScanned += 1;
    const relativePath = relative(root, path).split(sep).join('/');
    for (const finding of scanText(contents)) findings.push({ path: relativePath, ...finding });
  }

  findings.sort((a, b) =>
    (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
    || a.line - b.line
    || (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0));
  return Object.freeze({ filesScanned, findings: Object.freeze(findings) });
}

export function formatFinding(finding) {
  return `${finding.path}:${finding.line}: prohibited secret material detected (${finding.rule})`;
}

async function main() {
  const result = await scanRepository(process.argv[2] ? resolve(process.argv[2]) : repositoryRoot);
  if (result.findings.length > 0) {
    for (const finding of result.findings) process.stderr.write(`${formatFinding(finding)}\n`);
    process.stderr.write(`Secret scan failed: ${result.findings.length} finding(s) in ${result.filesScanned} text file(s).\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Secret scan passed: ${result.filesScanned} repository text file(s), 0 findings.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write('Secret scan failed: repository content could not be scanned.\n');
    process.exitCode = 1;
  });
}
