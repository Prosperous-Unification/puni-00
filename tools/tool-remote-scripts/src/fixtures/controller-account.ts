import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

export interface ControllerAccount {
  readonly uid: number;
  readonly gid: number;
}

function requireAccount(account: ControllerAccount): ControllerAccount {
  for (const number of [account.uid, account.gid])
    if (!Number.isSafeInteger(number) || number < 0) throw new Error('invalid fixture account');
  return Object.freeze({ ...account });
}

/** Pins the native creating account once; an effective-account mismatch cannot become a new target. */
export const controllerAccount: ControllerAccount = (() => {
  if (
    process.getuid === undefined ||
    process.getgid === undefined ||
    process.geteuid === undefined ||
    process.getegid === undefined
  )
    throw new Error('native fixture account APIs unavailable');
  const account = requireAccount({ uid: process.getuid(), gid: process.getgid() });
  if (process.geteuid() !== account.uid || process.getegid() !== account.gid)
    throw new Error('fixture effective account differs');
  return account;
})();

function replaceAnchor(source: string, anchor: string, replacement: string): string {
  if (source.split(anchor).length !== 2)
    throw new Error(`fixture account anchor differs: ${anchor}`);
  return source.replace(anchor, replacement);
}

/** Translates only the two shell expected-account operands; native captures and refusal predicates remain real. */
export function mapControllerShell(source: string, account = controllerAccount): string {
  requireAccount(account);
  let mapped = source;
  for (const field of ['uid', 'gid'] as const)
    mapped = replaceAnchor(
      mapped,
      `"$controller_file_${field}" != 1000`,
      `"$controller_file_${field}" != ${String(account[field])}`,
    );
  return mapped;
}

/** Requires all four pinned production predicates before translating an owned module. */
export function mapControllerSource(source: string, account = controllerAccount): string {
  let mapped = mapControllerShell(source, account);
  for (const field of ['uid', 'gid'] as const)
    mapped = replaceAnchor(
      mapped,
      `opening.${field} !== '1000'`,
      `opening.${field} !== '${String(account[field])}'`,
    );
  return mapped;
}

/** Maps the independent private-staging parent expectation without changing stage-owner admission. */
export function mapPushSource(source: string, account = controllerAccount): string {
  requireAccount(account);
  return replaceAnchor(
    source,
    'test "$controller_parent_uid" = 1000 || exit 1',
    `test "$controller_parent_uid" = ${String(account.uid)} || exit 1`,
  );
}

const admissionPath = realpathSync(resolve(import.meta.dir, '../lib/edge-admission.ts'));

/** Loads only the canonical admission module and an explicitly selected push module; basename collisions throw. */
export function controllerAccountPlugin(
  account = controllerAccount,
  pushPath?: string,
): Bun.BunPlugin {
  requireAccount(account);
  const selectedPush = pushPath === undefined ? undefined : realpathSync(pushPath);
  const expectedPush = resolve(import.meta.dir, '../../../tool-bootstrap/src/push.ts');
  if (selectedPush !== undefined && selectedPush !== realpathSync(expectedPush))
    throw new Error('unknown supplied controller push module: ' + selectedPush);
  return {
    name: 'owned-controller-account',
    setup(build) {
      build.onLoad({ filter: /(?:edge-admission|push)\.ts$/ }, (file) => {
        const canonical = realpathSync(file.path);
        if (canonical === admissionPath)
          return {
            contents: mapControllerSource(readFileSync(canonical, 'utf8'), account),
            loader: 'ts',
          };
        if (selectedPush !== undefined && canonical === selectedPush)
          return {
            contents: mapPushSource(readFileSync(canonical, 'utf8'), account),
            loader: 'ts',
          };
        throw new Error('unknown controller account module: ' + canonical);
      });
    },
  };
}

/** Installs the same exact source hook before the source entrypoint is imported, using an absolute helper path. */
export function writeControllerPreload(
  path: string,
  pushPath?: string,
  account = controllerAccount,
): void {
  requireAccount(account);
  writeFileSync(
    path,
    `import { plugin } from 'bun'; import { controllerAccountPlugin } from ${JSON.stringify(import.meta.path)}; plugin(controllerAccountPlugin(${JSON.stringify(account)}, ${JSON.stringify(pushPath)}));\n`,
  );
}

/** Makes an owned executable copy, never chmods the toolchain inode, and verifies its bytes and native account. */
export function copyControllerBun(path: string): void {
  const original = lstatSync(process.execPath, { bigint: true });
  const bytes = readFileSync(process.execPath);
  copyFileSync(process.execPath, path);
  chmodSync(path, 0o755);
  const copied = lstatSync(path, { bigint: true });
  const closing = lstatSync(process.execPath, { bigint: true });
  const digest = (contents: Uint8Array) => createHash('sha256').update(contents).digest('hex');
  if (copied.dev === original.dev && copied.ino === original.ino)
    throw new Error('fixture Bun aliases toolchain inode');
  if (
    digest(bytes) !== digest(readFileSync(path)) ||
    digest(bytes) !== digest(readFileSync(process.execPath)) ||
    original.dev !== closing.dev ||
    original.ino !== closing.ino ||
    original.mode !== closing.mode ||
    original.uid !== closing.uid ||
    original.gid !== closing.gid
  )
    throw new Error('fixture Bun copy or original changed');
  verifyControllerFile(path);
}

/** Checks native metadata against the already pinned tuple; never learns an altered owner as the expectation. */
export function verifyControllerFile(path: string): void {
  const opened = lstatSync(path);
  if (
    !opened.isFile() ||
    opened.isSymbolicLink() ||
    opened.uid !== controllerAccount.uid ||
    opened.gid !== controllerAccount.gid ||
    (opened.mode & 0o7777) !== 0o755 ||
    realpathSync(path) !== path
  )
    throw new Error('owned controller artifact metadata differs');
}
