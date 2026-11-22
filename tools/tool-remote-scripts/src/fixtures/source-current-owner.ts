import { createHash } from 'node:crypto';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import { readClosed, readString } from '../lib/managed-cohort';
import {
  captureCurrentSourceStartupTree,
  createCurrentSourceStartupManifest,
  decodeCurrentSourceStartupManifest,
} from '../lib/source-startup-current';

const encoded = process.argv.at(2);
if (encoded === undefined) throw new Error('current source fixture requires its owned input');
const supplied: unknown = JSON.parse(encoded);
const fields = readClosed(supplied, [
  'root',
  'sha',
  'variant',
  'recordPath',
  'selectionSha256',
  'packageDirectory',
]);
const root = readString(fields['root']),
  sha = readString(fields['sha']);
const variant = readString(fields['variant']);
if (
  ![
    'healthy',
    'changed-source',
    'changed-config',
    'changed-installation',
    'legacy-launch',
  ].includes(variant)
)
  throw new Error('current source fixture variant differs');
const selection = {
  contents: readFileSync(readString(fields['recordPath']), 'utf8'),
  sha256: readString(fields['selectionSha256']),
};
const privateContents = 'MIGRATE_ON_STARTUP=false\n# PRIVATE_CURRENT_SOURCE_SENTINEL\n';
const configuration = (['backend', 'gateway', 'mcp', 'frontend'] as const).map((slot) => ({
  slot,
  size: Buffer.byteLength(privateContents),
  sha256: createHash('sha256').update(privateContents).digest('hex'),
}));
const generated = await createCurrentSourceStartupManifest(root, sha, configuration, selection);
const pins = {
  version: 2 as const,
  sourceSha: sha,
  runtimeImageId: 'sha256:' + 'b'.repeat(64),
  manifestSha256: generated.sha256,
  environmentSha256: 'c'.repeat(64),
  puniSelectionSha256: selection.sha256,
};
const manifest = decodeCurrentSourceStartupManifest(generated.contents, pins);
const tiers = ['be-01', 'gw-01', 'mcp-01', 'fe-01'];
for (const tier of tiers) {
  const path = root + '/apps/wbs/' + tier + '/.env';
  writeFileSync(path, privateContents, { flag: 'wx', mode: 0o600 });
  chmodSync(path, 0o600);
}
const recheck = await captureCurrentSourceStartupTree(
  root,
  manifest,
  performance.now() + 20000,
  selection,
);
await recheck();
process.stdout.write(
  JSON.stringify({
    stage: 'current-tree-ready',
    version: manifest.version,
    profile: manifest.profile,
    sourceSha: manifest.sourceSha,
    selectionSha256: manifest.puniInstallation.selectionSha256,
  }) + '\n',
);
if (variant !== 'healthy') {
  if (variant === 'changed-source') writeFileSync(root + '/owned.txt', 'changed after capture\n');
  else if (variant === 'changed-config')
    writeFileSync(root + '/apps/wbs/be-01/.env', privateContents + '# changed\n');
  else if (variant === 'changed-installation')
    writeFileSync(
      readString(fields['packageDirectory']) + '/dist/puni.mjs',
      'export const changed=true;\n',
    );
  let refused = false,
    diagnostic = '';
  if (variant === 'legacy-launch') {
    for (const tier of tiers) rmSync(root + '/apps/wbs/' + tier + '/.env');
    const path = root + '/package.json';
    const decoded: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      !('scripts' in decoded) ||
      typeof decoded.scripts !== 'object' ||
      decoded.scripts === null ||
      !('dev' in decoded.scripts)
    )
      throw new Error('controlled current package has no dev script');
    decoded.scripts.dev = 'bin/dev.sh';
    writeFileSync(path, JSON.stringify(decoded));
    function git(arguments_: readonly string[]): string {
      const child = Bun.spawnSync(['git', '--no-optional-locks', '-C', root, ...arguments_], {
        env: {
          PATH: process.env['PATH'],
          HOME: root,
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_NO_REPLACE_OBJECTS: '1',
        },
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 5000,
        killSignal: 'SIGKILL',
        maxBuffer: 1048576,
      });
      if (
        child.signalCode !== undefined ||
        child.exitedDueToTimeout ||
        child.exitedDueToMaxBuffer
      ) {
        process.stdout.write(
          JSON.stringify({ stage: 'current-tree-custody', unknownGit: true }) + '\n',
        );
        throw new Error('current-source nested Git custody unknown; owned roots must be retained');
      }
      if (child.exitCode !== 0) throw new Error('current-source nested Git refused');
      return child.stdout.toString().trim();
    }
    git(['add', 'package.json']);
    git([
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-qm',
      'owned legacy launch mutation',
    ]);
    const changedSha = git(['rev-parse', 'HEAD']);
    try {
      await createCurrentSourceStartupManifest(root, changedSha, configuration, selection);
    } catch (cause: unknown) {
      refused = true;
      diagnostic = String(cause);
    }
  } else {
    try {
      await recheck();
    } catch (cause: unknown) {
      refused = true;
      diagnostic = String(cause);
    }
  }
  process.stdout.write(
    JSON.stringify({
      stage: 'current-tree-refusal',
      refused,
      sanitized: !diagnostic.includes('PRIVATE_CURRENT_SOURCE_SENTINEL'),
    }) + '\n',
  );
  if (!refused) process.exitCode = 79;
}
