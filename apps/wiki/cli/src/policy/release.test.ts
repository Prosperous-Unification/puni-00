import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import { hashBytes } from '../evidence/content-manifest';
import { verifyActivation } from './activation';
import { prepareToolkitActivation } from './prepare-activation-cli';
import { planToolkit, toolkitRoles } from './release';
import { releaseToolkit } from './release-cli';
import {
  auditReview,
  candidateIdentityAt,
  createRelocationCandidate,
  disposeRelocationFixtures,
  write,
} from './relocation-fixtures';
import { buildValidatorBundle, writeBytes } from './trusted-modules';

const workspace = resolve(import.meta.dir, '..', '..', '..', '..', '..');
const scratchPaths: string[] = [];

function scratch(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  scratchPaths.push(path);
  return path;
}

function git(repository: string, argv: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  if (invocation.exitCode !== 0) {
    throw new Error(`git ${argv.join(' ')}: ${invocation.stderr.toString('utf8')}`);
  }
  return invocation.stdout.toString('utf8').trim();
}

/**
 * A checkout with this repository's release layout: the four role sources the target reads, a
 * pinned `.bun-version`, and a `node_modules/typescript` the trusted closure walks. The TypeScript
 * stand-in keeps the 24 MB real closure out of every case that only measures the descriptors.
 */
function releaseCheckout(): { repository: string; destinationParent: string } {
  const parent = scratch('tool-wiki-release-');
  const repository = join(parent, 'checkout');
  mkdirSync(repository, { recursive: true });
  git(repository, ['init', '--initial-branch=main']);
  git(repository, ['config', 'user.email', 'release@example.test']);
  git(repository, ['config', 'user.name', 'Release Fixture']);
  write(join(repository, '.gitignore'), 'node_modules\n');
  write(join(repository, '.bun-version'), `${Bun.version}\n`);
  cpSync(join(workspace, 'bin', 'tool-wiki-lint.sh'), join(repository, 'bin/tool-wiki-lint.sh'));
  cpSync(
    join(workspace, 'apps/wiki/cli/src/policy/snapshot-validator.ts'),
    join(repository, 'apps/wiki/cli/src/policy/snapshot-validator.ts'),
  );
  write(
    join(repository, 'apps/wiki/cli/src/cli.ts'),
    'process.stdout.write(`${JSON.stringify({ argv: process.argv.slice(2) })}\\n`);\n',
  );
  write(
    join(repository, 'apps/wiki/cli/src/policy/prepare-activation-cli.ts'),
    'process.stdout.write("prepare\\n");\n',
  );
  write(join(repository, 'node_modules/typescript/package.json'), '{"name":"typescript"}\n');
  git(repository, ['add', '--all']);
  git(repository, ['commit', '--message', 'release layout']);
  return { repository, destinationParent: join(parent, 'out') };
}

function tarMembers(path: string): string[] {
  const listed = Bun.spawnSync(['tar', '--list', '--file', path], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  if (listed.exitCode !== 0) throw new Error(listed.stderr.toString('utf8'));
  return listed.stdout
    .toString('utf8')
    .split('\n')
    .filter((line) => line.length > 0);
}

/** Runs an action that must refuse and returns its message, so cases assert the exact text. */
async function refusalMessage(action: Promise<unknown>): Promise<string> {
  try {
    await action;
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
  throw new Error('expected a refusal, but the action resolved');
}

afterAll(() => {
  disposeRelocationFixtures();
  for (const path of scratchPaths.splice(0)) {
    Bun.spawnSync(['rm', '-rf', '--', path], { stderr: 'pipe', stdout: 'pipe' });
  }
});

describe('wiki-cli release target', () => {
  test('packs exactly the toolkit a consumer can reuse and prints its digest', async () => {
    const { repository, destinationParent } = releaseCheckout();
    git(repository, ['tag', '--annotate', 'wiki-v0.0.1', '--message', 'toolkit']);
    const destination = join(destinationParent, 'toolkit');

    const lines = await releaseToolkit([
      '--tag',
      'wiki-v0.0.1',
      '--destination',
      destination,
      '--repository',
      repository,
    ]);

    const head = git(repository, ['rev-parse', 'HEAD']);
    expect(lines[0]).toBe(`toolkit: wiki-v0.0.1 ${head}`);
    const archiveLine = lines.find((line) => line.startsWith('archive: '));
    if (archiveLine === undefined) throw new Error(`no archive line in: ${lines.join('\n')}`);
    const archivePath = archiveLine.slice('archive: '.length).split(/\s+/)[0];
    const printedDigest = /sha256: ([0-9a-f]{64})/.exec(archiveLine)?.[1];

    expect(archivePath).toBe(join(destinationParent, 'wiki-v0.0.1.tar'));
    // The printed digest is the operator's only handle on these bytes; it must be the file's own.
    expect(printedDigest).toBe(hashBytes(readFileSync(archivePath)));
    expect(printedDigest).toBe(
      Bun.spawnSync(['sha256sum', archivePath], { stdout: 'pipe' })
        .stdout.toString('utf8')
        .slice(0, 64),
    );

    const members = tarMembers(archivePath).filter(
      (member) => !member.startsWith('./trusted-node-modules'),
    );
    // Proof: a toolkit that shipped `selected.json`, a manifest or a review receipt would certify
    // this repository's commit to a consumer whose candidates can never equal it — ADR 0026. The
    // sorted member list is watched here so a role added without a decision fails.
    expect(members.sort()).toEqual([
      './',
      './SHA256SUMS',
      './launcher.sh',
      './prepare-activation.mjs',
      './snapshotter.ts',
      './toolkit.json',
      './validator.mjs',
    ]);
    expect(tarMembers(archivePath)).toContain('./trusted-node-modules/typescript/package.json');

    const descriptor = JSON.parse(readFileSync(join(destination, 'toolkit.json'), 'utf8')) as {
      tag: string;
      sourceRevision: string;
      bunVersion: string;
      roles: Record<string, string>;
      trustedNodeModules: string[];
    };
    expect(descriptor).toMatchObject({
      tag: 'wiki-v0.0.1',
      sourceRevision: head,
      bunVersion: Bun.version,
      trustedNodeModules: ['typescript'],
    });
    for (const role of toolkitRoles) {
      expect(descriptor.roles[role]).toBe(hashBytes(readFileSync(join(destination, role))));
    }
    expect(readFileSync(join(destination, 'launcher.sh'), 'utf8')).toBe(
      readFileSync(join(workspace, 'bin', 'tool-wiki-lint.sh'), 'utf8'),
    );
    expect(readFileSync(join(destination, 'SHA256SUMS'), 'utf8')).toContain('./toolkit.json');
  });

  test('refuses a checkout whose bytes are not the ones the tag names', async () => {
    const { repository, destinationParent } = releaseCheckout();
    git(repository, ['tag', '--annotate', 'wiki-v0.0.1', '--message', 'toolkit']);
    write(join(repository, 'bin/tool-wiki-lint.sh'), '#!/usr/bin/env bash\nexit 0\n');

    // Proof: with the dirty-tree refusal removed this packed the edited launcher as the tag's
    // `launcher.sh` and printed an archive path at exit 0, so `toolkit.json` named a commit whose
    // committed launcher was not the one inside the archive.
    expect(
      await refusalMessage(
        releaseToolkit([
          '--tag',
          'wiki-v0.0.1',
          '--destination',
          join(destinationParent, 'toolkit'),
          '--repository',
          repository,
        ]),
      ),
    ).toContain('checkout is dirty: bin/tool-wiki-lint.sh');
  });

  test('refuses a tag that is not at HEAD, unknown, or malformed', async () => {
    const { repository, destinationParent } = releaseCheckout();
    const parent = git(repository, ['rev-parse', 'HEAD']);
    git(repository, ['tag', '--annotate', 'wiki-v0.0.1', '--message', 'toolkit']);
    write(join(repository, 'apps/wiki/cli/src/cli.ts'), 'process.stdout.write("moved\\n");\n');
    git(repository, ['add', '--all']);
    git(repository, ['commit', '--message', 'after the tag']);
    const head = git(repository, ['rev-parse', 'HEAD']);
    const destination = join(destinationParent, 'toolkit');

    // Proof: with the HEAD comparison removed this packed the new commit's `validator.mjs` under a
    // `toolkit.json` naming the tagged parent; the negative received a complete archive at exit 0.
    expect(
      await refusalMessage(
        releaseToolkit([
          '--tag',
          'wiki-v0.0.1',
          '--destination',
          destination,
          '--repository',
          repository,
        ]),
      ),
    ).toContain(`release tag is not at HEAD: ${parent} != ${head}`);

    // Proof: with the resolution refusal removed an unknown tag reached the HEAD comparison and
    // refused with `release tag is not at HEAD: undefined != <head>`, naming a placement problem
    // for a tag that does not exist.
    expect(
      await refusalMessage(
        releaseToolkit([
          '--tag',
          'wiki-v9.9.9',
          '--destination',
          destination,
          '--repository',
          repository,
        ]),
      ),
    ).toContain('release tag is unknown: wiki-v9.9.9');

    for (const malformed of ['wiki-v1', 'wiki-v1.2', 'wiki-v1.2.3-rc1', 'v1.2.3']) {
      // Proof: with the tag form unchecked `wiki-v1` packed into `wiki-wiki-v1.tar` under a
      // `toolkit.json` whose tag no release page could carry; the negative exited 0.
      expect(
        await refusalMessage(
          releaseToolkit([
            '--tag',
            malformed,
            '--destination',
            destination,
            '--repository',
            repository,
          ]),
        ),
      ).toContain(`release tag is malformed: ${malformed}`);
    }
  });

  test('refuses an operator runtime and a destination it cannot honestly use', async () => {
    const { repository, destinationParent } = releaseCheckout();
    git(repository, ['tag', '--annotate', 'wiki-v0.0.1', '--message', 'toolkit']);
    const destination = join(destinationParent, 'toolkit');
    await releaseToolkit([
      '--tag',
      'wiki-v0.0.1',
      '--destination',
      destination,
      '--repository',
      repository,
    ]);

    // Proof: with the destination refusal removed a second run wrote a second `toolkit.json` beside
    // the first run's files and printed a digest for an archive mixing both; the negative exited 0.
    expect(
      await refusalMessage(
        releaseToolkit([
          '--tag',
          'wiki-v0.0.1',
          '--destination',
          destination,
          '--repository',
          repository,
        ]),
      ),
    ).toContain(`destination already holds a toolkit: ${destination}`);

    const drifted = releaseCheckout();
    write(join(drifted.repository, '.bun-version'), '1.3.9\n');
    git(drifted.repository, ['add', '--all']);
    git(drifted.repository, ['commit', '--message', 'drifted runtime']);
    git(drifted.repository, ['tag', '--annotate', 'wiki-v0.0.1', '--message', 'toolkit']);
    // Proof: with the runtime refusal removed this packed a bundle built by the running Bun under a
    // `toolkit.json` claiming 1.3.9, so a consumer's pinned runner could not reproduce the digest;
    // the negative received a complete archive at exit 0.
    expect(
      await refusalMessage(
        releaseToolkit([
          '--tag',
          'wiki-v0.0.1',
          '--destination',
          join(drifted.destinationParent, 'toolkit'),
          '--repository',
          drifted.repository,
        ]),
      ),
    ).toContain(`operator Bun differs from .bun-version: ${Bun.version} != 1.3.9`);
  });

  test('the toolkit descriptor is a pure function of the bytes it describes', () => {
    const request = {
      tag: 'wiki-v1.2.3',
      sourceRevision: 'a'.repeat(40),
      bunVersion: '1.4.2',
      roleBytes: Object.fromEntries(
        toolkitRoles.map((role) => [role, new TextEncoder().encode(`${role}\n`)]),
      ) as Record<(typeof toolkitRoles)[number], Uint8Array>,
      trustedNodeModules: ['typescript', '@typescript/old'],
    };
    const first = planToolkit(request);
    const second = planToolkit({
      ...request,
      trustedNodeModules: ['@typescript/old', 'typescript'],
    });

    expect(first.descriptor).toEqual(second.descriptor);
    expect(first.checksums).toEqual(second.checksums);
    const changed = planToolkit({
      ...request,
      roleBytes: { ...request.roleBytes, 'launcher.sh': new TextEncoder().encode('other\n') },
    });
    expect(changed.digests['launcher.sh']).not.toBe(first.digests['launcher.sh']);
  });
});

/**
 * Builds a toolkit directory of the shape {@link planToolkit} produces, carrying the real launcher,
 * snapshotter and validator bundle so the preparer's self-check runs the reviewed bytes.
 */
async function realToolkit(): Promise<string> {
  const directory = join(scratch('tool-wiki-toolkit-'), 'toolkit');
  mkdirSync(directory, { recursive: true });
  const roleBytes = {
    'launcher.sh': readFileSync(join(workspace, 'bin/tool-wiki-lint.sh')),
    'snapshotter.ts': readFileSync(
      join(workspace, 'apps/wiki/cli/src/policy/snapshot-validator.ts'),
    ),
    'validator.mjs': await buildValidatorBundle(join(workspace, 'apps/wiki/cli/src/cli.ts')),
    'prepare-activation.mjs': new TextEncoder().encode('// not executed by this test\n'),
  };
  for (const role of toolkitRoles) writeBytes(join(directory, role), roleBytes[role]);
  chmodSync(join(directory, 'launcher.sh'), 0o555);
  symlinkSync(join(workspace, 'node_modules'), join(directory, 'trusted-node-modules'), 'dir');
  const plan = planToolkit({
    tag: 'wiki-v0.0.1',
    sourceRevision: 'b'.repeat(40),
    bunVersion: Bun.version,
    roleBytes,
    trustedNodeModules: ['typescript'],
  });
  writeBytes(join(directory, 'toolkit.json'), plan.descriptor);
  writeBytes(join(directory, 'SHA256SUMS'), plan.checksums);
  return directory;
}

describe('consumer activation from a toolkit', () => {
  test('a consumer prepares and certifies its own first activation with no base activation', async () => {
    const fixture = createRelocationCandidate();
    const toolkit = await realToolkit();
    const out = scratch('tool-wiki-consumer-');
    const strata = join(out, 'audit-strata.json');
    write(
      strata,
      `${JSON.stringify({
        strata: [
          {
            stratumId: 'risk.public-admission',
            sampleRateBps: 10000,
            disagreementTriggerBps: 10000,
          },
        ],
        obligations: { 'review.fixture.module': 'risk.public-admission' },
      })}\n`,
    );
    const review = join(out, 'review.json');
    write(
      review,
      `${JSON.stringify(
        auditReview(
          'review.fixture.module',
          fixture.candidateRevision,
          candidateIdentityAt(fixture.repository, fixture.candidateRevision),
        ),
      )}\n`,
    );

    const lines = prepareToolkitActivation([
      '--candidate-repository',
      fixture.repository,
      '--candidate-sha',
      fixture.candidateRevision,
      '--toolkit',
      toolkit,
      '--candidate-policy',
      'docs/wiki-policy/policy.json',
      '--candidate-mapping',
      'docs/wiki-policy/modules.json',
      '--review-record',
      review,
      '--audit-strata',
      strata,
      '--destination',
      join(out, 'activation'),
      '--work',
      join(out, 'work'),
      '--resource-lane',
      'lane.consumer-fixture',
      '--cwd-identity',
      'cwd.consumer-fixture',
    ]);

    expect(lines[0]).toBe(`toolkit activation: ${fixture.candidateRevision}`);
    expect(lines[1]).toContain('wiki-v0.0.1');
    const versionDirectory = lines
      .find((line) => line.startsWith('version directory: '))
      ?.slice('version directory: '.length);
    if (versionDirectory === undefined) throw new Error(lines.join('\n'));
    // The self-check inside the command already ran the toolkit's own launcher to
    // `certified: true`; this re-verifies the package an operator would publish.
    const verified = verifyActivation(versionDirectory);
    expect(verified.manifest.sourceRevision).toBe(fixture.candidateRevision);
    expect(lines.find((line) => line.startsWith('self-check: '))).toContain('"certified":true');
    expect(readFileSync(join(out, 'activation', 'toolkit-release'), 'utf8')).toContain(
      'wiki-v0.0.1 ',
    );
  }, 300_000);

  test('a strata file that stratifies no policy review refuses by name', async () => {
    const fixture = createRelocationCandidate();
    const toolkit = await realToolkit();
    const out = scratch('tool-wiki-consumer-strata-');
    const strata = join(out, 'audit-strata.json');
    write(
      strata,
      `${JSON.stringify({
        strata: [
          {
            stratumId: 'risk.public-admission',
            sampleRateBps: 10000,
            disagreementTriggerBps: 10000,
          },
        ],
        obligations: { 'review.other.module': 'risk.public-admission' },
      })}\n`,
    );
    const review = join(out, 'review.json');
    write(
      review,
      `${JSON.stringify(
        auditReview(
          'review.fixture.module',
          fixture.candidateRevision,
          candidateIdentityAt(fixture.repository, fixture.candidateRevision),
        ),
      )}\n`,
    );

    // Proof: replacing this refusal with a default stratum invented the risk a review was audited
    // at, for a review the operator never stratified; the negative received a prepared activation.
    expect(() =>
      prepareToolkitActivation([
        '--candidate-repository',
        fixture.repository,
        '--candidate-sha',
        fixture.candidateRevision,
        '--toolkit',
        toolkit,
        '--candidate-policy',
        'docs/wiki-policy/policy.json',
        '--candidate-mapping',
        'docs/wiki-policy/modules.json',
        '--review-record',
        review,
        '--audit-strata',
        strata,
        '--destination',
        join(out, 'activation'),
        '--work',
        join(out, 'work'),
        '--resource-lane',
        'lane.consumer-fixture',
        '--cwd-identity',
        'cwd.consumer-fixture',
      ]),
    ).toThrow('audit strata name no stratum for review: review.fixture.module');
  }, 300_000);

  test('a toolkit role altered after packing refuses before anything is prepared', async () => {
    const fixture = createRelocationCandidate();
    const toolkit = await realToolkit();
    const out = scratch('tool-wiki-consumer-altered-');
    chmodSync(join(toolkit, 'launcher.sh'), 0o644);
    write(join(toolkit, 'launcher.sh'), '#!/usr/bin/env bash\nexit 0\n');

    // Proof: with the digest check removed this prepared an activation whose launcher role was the
    // altered file while `toolkit.json` still named the reviewed digest, so the self-check ran the
    // replacement and certified it.
    expect(() =>
      prepareToolkitActivation([
        '--candidate-repository',
        fixture.repository,
        '--candidate-sha',
        fixture.candidateRevision,
        '--toolkit',
        toolkit,
        '--candidate-policy',
        'docs/wiki-policy/policy.json',
        '--candidate-mapping',
        'docs/wiki-policy/modules.json',
        '--review-record',
        join(out, 'absent-review.json'),
        '--audit-strata',
        join(out, 'absent-strata.json'),
        '--destination',
        join(out, 'activation'),
        '--work',
        join(out, 'work'),
        '--resource-lane',
        'lane.consumer-fixture',
        '--cwd-identity',
        'cwd.consumer-fixture',
      ]),
    ).toThrow('toolkit role differs from toolkit.json: launcher.sh');
  });
});
