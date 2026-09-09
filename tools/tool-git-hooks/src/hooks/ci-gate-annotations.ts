import { readFile } from 'node:fs/promises';

const DEFAULT_LIMIT = 20;
const ERROR_PREFIX = '::error ';
const NX_STREAM_BOLD_START = '\u001b[1m';
const NX_STREAM_COLOURS = [32, 92, 34, 94, 36, 96, 33, 93, 35, 95].map(
  (colour) => `\u001b[${String(colour)}m`,
);
const NX_STREAM_COLOUR_END = '\u001b[39m';
const NX_STREAM_BOLD_END = '\u001b[22m';
const SAFE_TAIL_PREFIX = '| ';
const UNSAFE_ANNOTATION_DIAGNOSTIC =
  'ci-gate-annotations: skipped unsafe annotation commands containing control characters\n';

function containsCommandControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function nxStreamPrefixLength(line: string): number | null {
  const isBold = line.startsWith(NX_STREAM_BOLD_START);
  const colourStart = isBold ? NX_STREAM_BOLD_START.length : 0;
  const colour = NX_STREAM_COLOURS.find((candidate) => line.startsWith(candidate, colourStart));
  if (!colour) return null;
  const projectStart = colourStart + colour.length;
  const nxStreamEnd = `:${NX_STREAM_COLOUR_END}${isBold ? NX_STREAM_BOLD_END : ''} `;
  const projectEnd = line.indexOf(nxStreamEnd, projectStart);
  if (projectEnd === -1) return null;
  const project = line.slice(projectStart, projectEnd);
  // Proof: accepting a whitespace-bearing project token breaks
  // "accepts only column zero or the exact ANSI Nx stream prefix".
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(project) ? projectEnd + nxStreamEnd.length : null;
}

function errorCommandOf(line: string): string | null {
  const nxPrefixLength = nxStreamPrefixLength(line);
  // Proof: accepting `indexOf(ERROR_PREFIX)` breaks
  // "accepts only column zero or the exact ANSI Nx stream prefix".
  return line.startsWith(ERROR_PREFIX)
    ? line
    : nxPrefixLength !== null && line.startsWith(ERROR_PREFIX, nxPrefixLength)
      ? line.slice(nxPrefixLength)
      : null;
}

function hasSourceLocation(command: string): boolean {
  const separator = command.indexOf('::', ERROR_PREFIX.length);
  if (separator === -1 || separator === command.length - 2) return false;

  const properties = new Map<string, string>();
  for (const field of command.slice(ERROR_PREFIX.length, separator).split(',')) {
    const equals = field.indexOf('=');
    // Proof: rejecting opaque comma continuations or overwriting the first
    // location breaks "preserves a raw comma inside a workflow-command property value".
    if (equals <= 0) continue;
    const propertyName = field.slice(0, equals).trim();
    if (!properties.has(propertyName)) {
      properties.set(propertyName, field.slice(equals + 1).trim());
    }
  }

  return Boolean(properties.get('file')) && /^[1-9]\d*$/.test(properties.get('line') ?? '');
}

function locatedErrorCommandOf(line: string): string | null {
  const command = errorCommandOf(line);
  // Proof: removing this guard makes "rejects embedded C0 controls and DEL"
  // and "the production helper reports a rejected tab without exposing it" retain unsafe commands.
  if (!command || containsCommandControl(command)) return null;
  return hasSourceLocation(command) ? command : null;
}

/** Selects exact GitHub error commands that can restore source annotations. */
export function selectErrorAnnotations(raw: string, limit = DEFAULT_LIMIT): string[] {
  // Proof: accepting zero, a fraction, or an unsafe integer breaks
  // "rejects limits outside the positive-safe-integer contract".
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError(`annotation limit must be a positive safe integer; got ${String(limit)}`);
  }

  const selected: string[] = [];
  const seen = new Set<string>();
  // A bare CR is a line boundary too. Treating only CRLF/LF as boundaries let
  // an Actions command after CR remain inside a selected error command.
  for (const line of raw.split(/\r\n|\r|\n/)) {
    const command = locatedErrorCommandOf(line);
    // Proof: deleting `seen.has(command)` breaks
    // "keeps the first twenty unique commands in first-seen order".
    if (!command || seen.has(command)) continue;
    // Proof: stripping `,col=9` breaks
    // "preserves the exact file and line command emitted by the failing assertion".
    selected.push(command);
    seen.add(command);
    // Proof: deleting this break breaks
    // "keeps the first twenty unique commands in first-seen order".
    if (selected.length === limit) break;
  }
  return selected;
}

/**
 * Reports whether a located annotation was rejected without retaining its text.
 * GitHub decodes `%0A`, `%0D`, and `%25` only after an accepted command is emitted;
 * `%09` remains four literal printable characters, unlike a raw tab.
 */
export function hasUnsafeErrorAnnotation(raw: string): boolean {
  for (const line of raw.split(/\r\n|\r|\n/)) {
    const command = errorCommandOf(line);
    if (command && containsCommandControl(command) && hasSourceLocation(command)) return true;
  }
  return false;
}

function visibleTailLine(line: string): string {
  let visible = '';
  for (let index = 0; index < line.length; index += 1) {
    const code = line.charCodeAt(index);
    visible += code < 0x20 || code === 0x7f ? `\\x${code.toString(16).padStart(2, '0')}` : line[index];
  }
  return `${SAFE_TAIL_PREFIX}${visible}`;
}

/** Renders a retained-log tail that cannot begin a GitHub workflow command. */
export function safeGateTail(raw: string, limit: number): string {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError(`tail limit must be a positive safe integer; got ${String(limit)}`);
  }
  const lines = raw.split(/\r\n|\r|\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines.slice(-limit).map(visibleTailLine).join('\n');
}

/** Reads UTF-8 gate output and throws when the required log cannot be read. */
export async function readErrorAnnotations(path: string): Promise<string[]> {
  return selectErrorAnnotations(await readFile(path, 'utf8'));
}

async function main(): Promise<void> {
  const [path, tailFlag, tailValue, unexpected] = process.argv.slice(2);
  if (!path || unexpected || (tailFlag !== undefined && tailFlag !== '--tail') || (tailFlag && !tailValue)) {
    throw new Error('usage: bun run ci-gate-annotations.ts <nx-gate.log> [--tail <lines>]');
  }

  const raw = await readFile(path, 'utf8');
  if (tailValue) {
    const tail = safeGateTail(raw, Number(tailValue));
    if (tail) process.stdout.write(`${tail}\n`);
  }
  const annotations = selectErrorAnnotations(raw);
  if (annotations.length > 0) process.stdout.write(`${annotations.join('\n')}\n`);
  if (hasUnsafeErrorAnnotation(raw)) process.stderr.write(UNSAFE_ANNOTATION_DIAGNOSTIC);
}

if (import.meta.main) await main();
