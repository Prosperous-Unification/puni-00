import type { MigrationSetIdentity } from '@wbs/store-sqlite/migration-set';

type FlagName = 'capture' | 'capture-file' | 'to' | 'target' | 'attempt' | 'candidate';

function valuesOf(arguments_: readonly string[]): Map<FlagName, string> {
  const values = new Map<FlagName, string>();
  const allowed: readonly FlagName[] = [
    'capture',
    'capture-file',
    'to',
    'target',
    'attempt',
    'candidate',
  ];
  for (const argument of arguments_) {
    const [name, ...parts] = argument.startsWith('--') ? argument.slice(2).split('=') : [];
    const flag = allowed.find((known) => known === name);
    if (flag === undefined) {
      throw new Error(`unknown migration CLI argument: ${argument}`);
    }
    // Proof: removing this check made the real capture CLI accept two --target flags
    // and silently use the last; the duplicate-flags test observed exit 0.
    if (values.has(flag)) throw new Error(`duplicate --${flag} migration CLI argument`);
    if (flag === 'capture') {
      if (parts.length !== 0) throw new Error('--capture does not accept a value');
      values.set(flag, 'true');
    } else {
      if (parts.length !== 1 || parts[0] === '') {
        throw new Error(`--${flag}=<value> is required`);
      }
      values.set(flag, parts[0]);
    }
  }
  return values;
}

function identityOf(values: ReadonlyMap<FlagName, string>): MigrationSetIdentity {
  const required = (name: 'target' | 'attempt' | 'candidate'): string => {
    const value = values.get(name);
    if (value === undefined) throw new Error(`--${name}=<value> is required`);
    return value;
  };
  return {
    target: required('target'),
    attempt: required('attempt'),
    candidate: required('candidate'),
  };
}

export type StatusMode =
  | { readonly kind: 'latest' }
  | { readonly kind: 'capture'; readonly identity: MigrationSetIdentity };
export type DownMode =
  | { readonly kind: 'legacy'; readonly target: string }
  | { readonly kind: 'capture'; readonly path: string; readonly identity: MigrationSetIdentity };

/** Parse status mode before opening a database. */
export function statusModeOf(arguments_: readonly string[]): StatusMode {
  const values = valuesOf(arguments_);
  if (values.size === 0) return { kind: 'latest' };
  if (!values.has('capture') || values.has('capture-file') || values.has('to')) {
    throw new Error('status CLI requires --capture with target, attempt and candidate');
  }
  return { kind: 'capture', identity: identityOf(values) };
}

/** Parse one rollback mode before reading a capture or changing SQLite. */
export function downModeOf(arguments_: readonly string[]): DownMode {
  const values = valuesOf(arguments_);
  const path = values.get('capture-file');
  const target = values.get('to');
  // Proof: removing this refusal made the real CLI accept --capture-file and --to
  // together, exit 0 and reverse the candidate despite the conflicting command.
  if (path !== undefined && target !== undefined) {
    throw new Error('--capture-file and --to are mutually exclusive rollback modes');
  }
  if (values.has('capture')) throw new Error('--capture is only valid for status CLI');
  if (path !== undefined) return { kind: 'capture', path, identity: identityOf(values) };
  if (target !== undefined) {
    if (values.size !== 1) throw new Error('legacy --to does not accept capture identity flags');
    return { kind: 'legacy', target };
  }
  throw new Error('refusing: --to=<migration-name|none> or --capture-file=<path> is required');
}
