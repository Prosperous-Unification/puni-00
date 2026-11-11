import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

import { hashBytes } from '../evidence/content-manifest';
import { createToolkitFixture } from '../testing/preparation-fixtures';
import { planBunToolkit } from './bun-release';
import { readPreparationNotices } from './preparation-notices';
import { prepareBunToolkit } from './prepare-bun-toolkit';
import { disposeRelocationFixtures } from './relocation-fixtures';
import { readBunToolkit } from './toolkit';
import { hashTrustedModules } from './trusted-modules';

const roots: string[] = [];
afterAll(() => {
  disposeRelocationFixtures();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('delivers derived pinned compiler notices in a normal prepared archive without trusting adjacent files', async () => {
  const fixture = await createToolkitFixture(roots),
    toolkit = fixture.context.toolkitDirectory;
  mkdirSync(join(toolkit, 'licenses/typescript-preparation'), { recursive: true });
  writeFileSync(
    join(toolkit, 'licenses/typescript-preparation/NOTICE'),
    'unauthenticated-adjacent-canary',
  );
  const prepared = await prepareBunToolkit(fixture.request, fixture.context);
  if (prepared.kind !== 'prepared') throw new Error('unexpected normal notice cancellation');
  const archive = Bun.spawnSync(['/usr/bin/tar', '--list', '--file', prepared.archive.path], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(archive.exitCode, archive.stderr.toString()).toBe(0);
  expect(archive.stdout.toString()).toContain('licenses/typescript-preparation/LICENSE.txt');
  expect(archive.stdout.toString()).toContain('licenses/typescript-preparation/NOTICE');
  const notice = readFileSync(
    join(fixture.request.destination, 'licenses/typescript-preparation/NOTICE'),
    'utf8',
  );
  expect(notice).toContain('language-service plugin loading disabled');
  expect(notice).not.toContain('unauthenticated-adjacent-canary');
});

it('refuses repinned altered compiler notice bytes before normal output ownership', async () => {
  const fixture = await createToolkitFixture(roots),
    toolkit = readBunToolkit(fixture.context.toolkitDirectory);
  writeFileSync(
    join(toolkit.directory, 'trusted-node-modules/@typescript/old/ThirdPartyNoticeText.txt'),
    'altered notice',
  );
  const plan = planBunToolkit({
    tag: toolkit.tag,
    sourceRevision: toolkit.sourceRevision,
    bunVersion: toolkit.bunVersion,
    roleBytes: toolkit.roleBytes,
    trustedNodeModules: toolkit.trustedNodeModules,
    trustedNodeModulesIdentity: hashTrustedModules(join(toolkit.directory, 'trusted-node-modules')),
  });
  writeFileSync(join(toolkit.directory, 'toolkit.json'), plan.descriptor);
  const cause: unknown = await prepareBunToolkit(fixture.request, {
    ...fixture.context,
    expectedToolkitIdentity: hashBytes(plan.descriptor),
  }).then(
    () => undefined,
    (failure: unknown) => failure,
  );
  expect(String(cause instanceof Error ? cause.cause : cause)).toContain(
    'preparation compiler notice identity differs',
  );
  expect(existsSync(fixture.request.work)).toBe(false);
});

it('models compiler-free toolkits explicitly while refusing an incomplete selected compiler roster', () => {
  const root = mkdtempSync(join(tmpdir(), 'puni compiler-free notices '));
  roots.push(root);
  expect(readPreparationNotices({ directory: root, trustedNodeModules: [] })).toEqual({
    kind: 'compiler-free',
    notices: [],
  });
  expect(() =>
    readPreparationNotices({ directory: root, trustedNodeModules: ['typescript'] }),
  ).toThrow('preparation compiler roster is incomplete');
});
