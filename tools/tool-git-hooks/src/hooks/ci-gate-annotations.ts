import { readFile } from 'node:fs/promises';

const DEFAULT_LIMIT = 20;
const ERROR_PREFIX = '::error ';
const NX_STREAM_START = '\u001b[1m\u001b[34m';
const NX_STREAM_END = ':\u001b[39m\u001b[22m ';

function nxStreamPrefixLength(line: string): number | null {
  if (!line.startsWith(NX_STREAM_START)) return null;
  const projectEnd = line.indexOf(NX_STREAM_END, NX_STREAM_START.length);
  if (projectEnd === -1) return null;
  const project = line.slice(NX_STREAM_START.length, projectEnd);
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(project) ? projectEnd + NX_STREAM_END.length : null;
}

function locatedErrorCommandOf(line: string): string | null {
  const nxPrefixLength = nxStreamPrefixLength(line);
  // Proof: accepting `indexOf(ERROR_PREFIX)` promoted the prose and plain-prefix
  // fixtures into annotations for files that did not fail.
  const command = line.startsWith(ERROR_PREFIX)
    ? line
    : nxPrefixLength !== null && line.startsWith(ERROR_PREFIX, nxPrefixLength)
      ? line.slice(nxPrefixLength)
      : null;
  if (!command) return null;

  const separator = command.indexOf('::', ERROR_PREFIX.length);
  if (separator === -1 || separator === command.length - 2) return null;

  const properties = new Map<string, string>();
  let propertyName: string | null = null;
  for (const field of command.slice(ERROR_PREFIX.length, separator).split(',')) {
    const equals = field.indexOf('=');
    if (equals <= 0) {
      if (!propertyName) return null;
      // Proof: rejecting a comma continuation dropped the exact located command
      // whose title is `error: bad input, expected number`.
      const value = properties.get(propertyName);
      if (value === undefined) return null;
      properties.set(propertyName, `${value},${field}`);
      continue;
    }
    propertyName = field.slice(0, equals).trim();
    properties.set(propertyName, field.slice(equals + 1).trim());
  }

  return Boolean(properties.get('file')) && /^[1-9]\d*$/.test(properties.get('line') ?? '')
    ? command
    : null;
}

/** Selects exact GitHub error commands that can restore source annotations. */
export function selectErrorAnnotations(raw: string, limit = DEFAULT_LIMIT): string[] {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError(`annotation limit must be a positive safe integer; got ${String(limit)}`);
  }

  const selected: string[] = [];
  const seen = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const command = locatedErrorCommandOf(line);
    // Proof: deleting `seen.has(command)` made the twenty-command test receive
    // case-0 twice and drop case-19, failing with one unexpected entry.
    if (!command || seen.has(command)) continue;
    // Proof: stripping `,col=9` here made the exact-command test receive the
    // right file and line but the wrong command, and it failed at its equality.
    selected.push(command);
    seen.add(command);
    // Proof: deleting this break made the bound test receive case-20 as a
    // twenty-first command (`Expected -0 / Received +1`).
    if (selected.length === limit) break;
  }
  return selected;
}

/** Reads UTF-8 gate output and throws when the required log cannot be read. */
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
