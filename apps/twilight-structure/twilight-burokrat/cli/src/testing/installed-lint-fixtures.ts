import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import type { LintInterrupt } from '../lint-interrupts';
import { readLintRuntime } from '../lint-runtime';
import { packageManifestBytes, packageVersion } from '../packaging/manifest';
import { hashTrustedModules } from '../policy/trusted-modules';
import type { LintContext } from '../runtime-facade';
import { createLintFixture } from './lint-fixtures';

export function createInstalledLintFixture(
  launcher: Uint8Array,
  validator: string | ((root: string) => string),
  snapshotter?: string | ((root: string) => string),
) {
  const fixture = createLintFixture(validator, snapshotter);
  const installedDirectory = join(fixture.root, 'puni installation = verified');
  const toolkit = join(installedDirectory, 'toolkit');
  mkdirSync(toolkit, { recursive: true });
  const closure = join(toolkit, 'trusted-node-modules');
  cpSync(join(fixture.archive, 'trusted-node-modules'), closure, { recursive: true });
  const names = [
    'launcher.mjs',
    'snapshotter.ts',
    'validator.mjs',
    'prepare-activation.mjs',
    'prepare-relocation-activation.mjs',
  ];
  const roles: Record<string, string> = {};
  for (const name of names) {
    const bytes =
      name === 'launcher.mjs'
        ? launcher
        : new TextEncoder().encode('export const fixture = ' + JSON.stringify(name) + ';\n');
    writeFileSync(join(toolkit, name), bytes);
    roles[name] = hashBytes(bytes);
  }
  const descriptor = {
    schemaVersion: 2,
    tag: 'puni-v' + packageVersion,
    sourceRevision: 'a'.repeat(40),
    bunVersion: Bun.version,
    roles,
    trustedNodeModules: ['typescript'],
    trustedNodeModulesIdentity: hashTrustedModules(closure),
  };
  const descriptorBytes = new TextEncoder().encode(serializeCanonical(descriptor));
  writeFileSync(join(toolkit, 'toolkit.json'), descriptorBytes);
  const manifest = join(installedDirectory, 'package-manifest.json');
  writeFileSync(
    manifest,
    packageManifestBytes(descriptor.sourceRevision, hashBytes(descriptorBytes)),
  );
  function writeLauncher(bytes: Uint8Array): void {
    writeFileSync(join(toolkit, 'launcher.mjs'), bytes);
    descriptor.roles['launcher.mjs'] = hashBytes(bytes);
    const descriptorBytes = new TextEncoder().encode(serializeCanonical(descriptor));
    writeFileSync(join(toolkit, 'toolkit.json'), descriptorBytes);
    writeFileSync(
      manifest,
      packageManifestBytes(descriptor.sourceRevision, hashBytes(descriptorBytes)),
    );
  }
  const launches: string[] = [];
  const listeners = new Set<(signal: LintInterrupt) => void>();
  let first: LintInterrupt | undefined;
  function interrupt(signal: LintInterrupt): void {
    first ??= signal;
    for (const listener of listeners) listener(signal);
  }
  const diagnostics: Uint8Array[] = [];
  const context: { -readonly [Field in keyof LintContext]: LintContext[Field] } = {
    installedDirectory,
    callerDirectory: fixture.root,
    runtime: readLintRuntime(fixture.context.path, fixture.root),
    activationRoot: fixture.archive,
    trustedNodeModules: undefined,
    required: false,
    scratchDirectory: fixture.scratch,
    launch(entrypoint: string): readonly string[] {
      launches.push(entrypoint);
      return fixture.context.launch(entrypoint);
    },
    stdout: fixture.context.stdout,
    stderr: fixture.context.stderr,
    reportDiagnostic: (bytes) => {
      diagnostics.push(bytes.slice());
      return Promise.resolve({ kind: 'reported' });
    },
    subscribeInterrupts(listener: (signal: LintInterrupt) => void): () => void {
      listeners.add(listener);
      if (first !== undefined) listener(first);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    ...fixture,
    context,
    installedDirectory,
    toolkit,
    closure,
    manifest,
    launches,
    writeLauncher,
    interrupt,
    diagnostics,
  };
}
