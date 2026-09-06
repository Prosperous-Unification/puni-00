import { readFile } from 'node:fs/promises';

const DEFAULT_LIMIT = 20;
const ERROR_PREFIX = '::error ';

function isLocatedErrorCommand(line: string): boolean {
  if (!line.startsWith(ERROR_PREFIX)) return false;

  const separator = line.indexOf('::', ERROR_PREFIX.length);
  if (separator === -1 || separator === line.length - 2) return false;

  const properties = new Map<string, string>();
  for (const field of line.slice(ERROR_PREFIX.length, separator).split(',')) {
    const equals = field.indexOf('=');
    if (equals <= 0) return false;
    properties.set(field.slice(0, equals).trim(), field.slice(equals + 1).trim());
  }

  return Boolean(properties.get('file')) && /^\d+$/.test(properties.get('line') ?? '');
}

/** Selects exact GitHub error commands that can restore source annotations. */
export function selectErrorAnnotations(raw: string, limit = DEFAULT_LIMIT): string[] {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError(`annotation limit must be a positive safe integer; got ${String(limit)}`);
  }

  const selected: string[] = [];
  const seen = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    if (!isLocatedErrorCommand(line) || seen.has(line)) continue;
    selected.push(line);
    seen.add(line);
    if (selected.length === limit) break;
  }
  return selected;
}

export async function readErrorAnnotations(path: string): Promise<string[]> {
  return selectErrorAnnotations(await readFile(path, 'utf8'));
}

async function main(): Promise<void> {
  const [path, unexpected] = process.argv.slice(2);
  if (!path || unexpected) {
    throw new Error('usage: bun run ci-gate-annotations.ts <nx-gate.log>');
  }

  const annotations = await readErrorAnnotations(path);
  if (annotations.length > 0) process.stdout.write(`${annotations.join('\n')}\n`);
}

if (import.meta.main) await main();
