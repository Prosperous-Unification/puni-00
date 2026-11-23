import { Buffer } from 'node:buffer';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { beforeAll, describe, expect, it, spyOn } from 'bun:test';

import { installedGrammar, readInvocation, UsageRefusal } from './cli-parser';
import { hashBytes } from './evidence/content-manifest';
import { runLintChild } from './lint-child';
import { prepareActivation, selectActivation } from './policy/activation';
import { buildLintLauncher } from './policy/build-lint-launcher';
import * as auditPolicy from './push-audit';
import { executePushAudit } from './runtime-facade';
import { createInstalledLintFixture } from './testing/installed-lint-fixtures';

let launcher: Uint8Array;
beforeAll(async () => {
  launcher = await buildLintLauncher();
});

const certificate =
  '{"schemaVersion":1,"mode":"enforce","trustProvenance":"ci-preselected","accepted":true,"certified":true}\n';
const inactive =
  '{"schemaVersion":1,"status":"inactive","certified":false,"reason":"external activation marker is not provisioned"}\n';
type Fixture = ReturnType<typeof createInstalledLintFixture>;

/** Keep an unexpected failed owner/assertion's private roots; never unlink possible retained stages. */
async function runFixture(
  act: (fixture: Fixture) => Promise<void>,
  validator: string | ((root: string) => string) = 'process.stdout.write(' +
    JSON.stringify(certificate) +
    ');',
  snapshotter?: string | ((root: string) => string),
): Promise<void> {
  const fixture = createInstalledLintFixture(launcher, validator, snapshotter);
  let primary: { readonly failure: unknown } | undefined;
  try {
    writeFileSync(
      join(fixture.archive, 'toolkit-release'),
      'puni-v0.3.0 ' + hashBytes(readFileSync(join(fixture.toolkit, 'toolkit.json'))) + '\n',
    );
    await act(fixture);
  } catch (failure: unknown) {
    primary = { failure };
  }
  if (primary !== undefined) {
    let reporting: { readonly failure: unknown } | undefined;
    try {
      console.info('Retained push audit fixture after failure: ' + fixture.root);
    } catch (failure: unknown) {
      reporting = { failure };
    }
    if (reporting !== undefined)
      throw new AggregateError(
        [primary.failure, reporting.failure],
        'push audit failure and retained-root reporting failed',
        { cause: primary.failure },
      );
    throw primary.failure;
  }
  rmSync(fixture.root, { recursive: true });
}

function createRequest(fixture: Fixture) {
  return {
    command: 'audit-push' as const,
    repository: fixture.candidate,
    revision: 'opaque revision',
  };
}

function readOutput(chunks: readonly Uint8Array[]): Buffer {
  return Buffer.concat(chunks);
}

/** Inject the exact synchronous unknown policy failure, including undefined, without conversion. */
function throwFailure(failure: unknown): never {
  throw failure;
}

async function expectFailure(pending: Promise<unknown>, diagnostic: string): Promise<void> {
  let caught: { readonly failure: unknown } | undefined;
  try {
    await pending;
  } catch (failure: unknown) {
    caught = { failure };
  }
  expect(caught).toBeDefined();
  if (caught === undefined) throw new Error('push audit unexpectedly fulfilled');
  expect(caught.failure).toBeInstanceOf(Error);
  if (!(caught.failure instanceof Error))
    throw new Error('push audit rejection is not an Error', { cause: caught.failure });
  expect(caught.failure.message).toContain(diagnostic);
}

it('keeps current audit-push out of the historical installed grammar', () => {
  expect(() =>
    readInvocation(installedGrammar, ['audit-push', '/absent/candidate', 'HEAD'], {
      stdout: () => {
        throw new Error('legacy audit unexpectedly printed discovery');
      },
      version: '0.2.1',
    }),
  ).toThrow(UsageRefusal);
});

describe('current installed push audit', () => {
  it('joins the configured root release and runs committed certification through one installed launcher', async () =>
    runFixture(
      async (fixture) => {
        expect(fixture.context.required).toBe(false);
        expect(await executePushAudit(createRequest(fixture), fixture.context)).toBe(0);
        expect(readOutput(fixture.stdout).toString()).toBe(certificate);
        expect(readOutput(fixture.stderr).length).toBe(0);
        expect(fixture.launches).toEqual([join(fixture.toolkit, 'launcher.mjs')]);
        const copiedValidator = readFileSync(join(fixture.root, 'snapshot destination'), 'utf8');
        expect(dirname(dirname(copiedValidator))).toBe(fixture.scratch);
        expect(basename(dirname(copiedValidator))).toMatch(/^puni-lint-/);
        expect(basename(copiedValidator)).toBe('validator.mjs');
        const binding = join(fixture.prepared.directory, fixture.prepared.manifest.roles.ciBinding);
        expect(readFileSync(join(fixture.root, 'snapshot argv'), 'utf8')).toBe(
          JSON.stringify([
            binding,
            join(fixture.prepared.directory, fixture.prepared.manifest.roles.validator),
            fixture.candidate,
            copiedValidator,
          ]),
        );
        expect(readFileSync(join(fixture.root, 'validator invocation'), 'utf8')).toBe(
          JSON.stringify({
            version: 1,
            callerDirectory: fixture.root,
            request: {
              command: 'lint-ci',
              kind: 'committed',
              repository: fixture.candidate,
              revision: 'opaque revision',
              evidence: join(fixture.prepared.directory, fixture.prepared.manifest.roles.evidence),
            },
          }),
        );
        expect(readFileSync(join(fixture.root, 'validator binding'), 'utf8')).toBe(binding);
        expect(readdirSync(fixture.scratch)).toEqual([]);
      },
      (root) =>
        'import{writeFileSync}from"node:fs";' +
        'writeFileSync(' +
        JSON.stringify(join(root, 'validator invocation')) +
        ',await Bun.stdin.text());' +
        'writeFileSync(' +
        JSON.stringify(join(root, 'validator binding')) +
        ',process.env.TOOL_WIKI_CI_TRUSTED_BINDING);' +
        'process.stdout.write(' +
        JSON.stringify(certificate) +
        ');',
      (root) =>
        'await import("node:fs").then(({writeFileSync})=>{' +
        'writeFileSync(' +
        JSON.stringify(join(root, 'snapshot argv')) +
        ',JSON.stringify(process.argv.slice(2)));' +
        'writeFileSync(' +
        JSON.stringify(join(root, 'snapshot destination')) +
        ',process.argv[5]);});\n' +
        readFileSync(new URL('./policy/snapshot-validator.ts', import.meta.url), 'utf8'),
    ));

  for (const activationRoot of [undefined, '']) {
    it(
      'reports only wholly absent activation as explicit inactivity: ' + String(activationRoot),
      async () =>
        runFixture(async (fixture) => {
          fixture.context.activationRoot = activationRoot;
          rmSync(join(fixture.archive, 'toolkit-release'));
          expect(await executePushAudit(createRequest(fixture), fixture.context)).toBe(0);
          expect(readOutput(fixture.stdout).toString()).toBe(inactive);
          expect(readOutput(fixture.stderr).length).toBe(0);
          expect(fixture.launches).toEqual([]);
          expect(readdirSync(fixture.scratch)).toEqual([]);
        }),
    );
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    it('preserves inactive stdout cancellation as ' + signal, async () =>
      runFixture(async (fixture) => {
        fixture.context.activationRoot = undefined;
        let writes = 0;
        fixture.context.stdout = (bytes) => {
          writes += 1;
          fixture.stdout.push(bytes.slice());
          return { kind: 'cancelled', signal };
        };
        expect(await executePushAudit(createRequest(fixture), fixture.context)).toBe(
          signal === 'SIGINT' ? 130 : 143,
        );
        expect(writes).toBe(1);
        expect(readOutput(fixture.stdout).toString()).toBe(inactive);
        expect(readOutput(fixture.stderr).length).toBe(0);
        expect(fixture.launches).toEqual([]);
        expect(readdirSync(fixture.scratch)).toEqual([]);
      }),
    );

    it('preserves configured refusal stderr cancellation as ' + signal, async () =>
      runFixture(async (fixture) => {
        fixture.context.activationRoot = join(fixture.root, 'missing archive');
        let writes = 0;
        fixture.context.stderr = (bytes) => {
          writes += 1;
          fixture.stderr.push(bytes.slice());
          return { kind: 'cancelled', signal };
        };
        expect(await executePushAudit(createRequest(fixture), fixture.context)).toBe(
          signal === 'SIGINT' ? 130 : 143,
        );
        expect(writes).toBe(1);
        expect(readOutput(fixture.stderr).toString()).toBe(
          'tool-wiki push audit: cannot read configured push audit authority\n',
        );
        expect(readOutput(fixture.stdout).length).toBe(0);
        expect(fixture.launches).toEqual([]);
        expect(readdirSync(fixture.scratch)).toEqual([]);
      }),
    );
  }

  it('preflights the installation before optional inactivity', async () =>
    runFixture(async (fixture) => {
      fixture.context.activationRoot = undefined;
      fixture.context.installedDirectory = join(fixture.root, 'absent installation');
      await expectFailure(executePushAudit(createRequest(fixture), fixture.context), 'ENOENT');
      expect(readOutput(fixture.stdout).length).toBe(0);
      expect(fixture.launches).toEqual([]);
    }));

  it('preflights the actual candidate before optional inactivity', async () =>
    runFixture(async (fixture) => {
      fixture.context.activationRoot = '';
      await expectFailure(
        executePushAudit(
          { ...createRequest(fixture), repository: join(fixture.root, 'absent candidate') },
          fixture.context,
        ),
        'candidate',
      );
      expect(readOutput(fixture.stdout).length).toBe(0);
      expect(fixture.launches).toEqual([]);
    }));

  it('anchors relative configured archive and candidate operands at the caller', async () =>
    runFixture(async (fixture) => {
      fixture.context.activationRoot = 'archive';
      expect(
        await executePushAudit(
          { ...createRequest(fixture), repository: 'candidate' },
          fixture.context,
        ),
      ).toBe(0);
      expect(readOutput(fixture.stdout).toString()).toBe(certificate);
      expect(fixture.launches).toEqual([join(fixture.toolkit, 'launcher.mjs')]);
    }));

  it('refuses a nonempty missing root instead of returning optional inactivity', async () =>
    runFixture(async (fixture) => {
      fixture.context.activationRoot = join(fixture.root, 'missing archive');
      expect(await executePushAudit(createRequest(fixture), fixture.context)).toBe(78);
      expect(readOutput(fixture.stderr).toString()).toContain(
        'cannot read configured push audit authority',
      );
      expect(readOutput(fixture.stdout).length).toBe(0);
      expect(fixture.launches).toEqual([]);
    }));

  it('refuses a configured file root through its required release lookup before roles', async () =>
    runFixture(async (fixture) => {
      const path = join(fixture.root, 'configured archive file');
      writeFileSync(path, 'not a directory');
      fixture.context.activationRoot = path;
      expect(await executePushAudit(createRequest(fixture), fixture.context)).toBe(78);
      expect(readOutput(fixture.stderr).toString()).toContain(
        'cannot read configured push audit authority',
      );
      expect(fixture.launches).toEqual([]);
    }));

  it('refuses a candidate release even when the configured archive contains that candidate', async () =>
    runFixture(async (fixture) => {
      const nested = join(fixture.archive, 'actual candidate');
      renameSync(fixture.candidate, nested);
      const release = join(fixture.archive, 'toolkit-release');
      const candidateRelease = join(nested, 'candidate release');
      writeFileSync(candidateRelease, readFileSync(release));
      rmSync(release);
      symlinkSync(candidateRelease, release);
      expect(
        await executePushAudit({ ...createRequest(fixture), repository: nested }, fixture.context),
      ).toBe(78);
      expect(readOutput(fixture.stderr).toString()).toContain(
        'toolkit release escapes its archive authority',
      );
      expect(fixture.launches).toEqual([]);
    }));

  it('does not take a release record from the selected version directory', async () =>
    runFixture(async (fixture) => {
      const release = readFileSync(join(fixture.archive, 'toolkit-release'));
      rmSync(join(fixture.archive, 'toolkit-release'));
      writeFileSync(join(fixture.prepared.directory, 'toolkit-release'), release);
      expect(await executePushAudit(createRequest(fixture), fixture.context)).toBe(78);
      expect(readOutput(fixture.stderr).toString()).toContain(
        'cannot read configured push audit authority',
      );
      expect(fixture.launches).toEqual([]);
    }));

  for (const malformed of [
    'wrong tag',
    'wrong digest',
    'missing LF',
    'extra LF',
    'trailing record',
    'invalid UTF8',
  ]) {
    it('refuses the whole release record with ' + malformed + ' before role execution', async () =>
      runFixture(async (fixture) => {
        const path = join(fixture.archive, 'toolkit-release');
        const original = readFileSync(path).toString();
        const changed =
          malformed === 'wrong tag'
            ? original.replace('puni-v0.3.0', 'puni-v0.4.0')
            : malformed === 'wrong digest'
              ? 'puni-v0.3.0 ' + 'f'.repeat(64) + '\n'
              : malformed === 'missing LF'
                ? original.slice(0, -1)
                : malformed === 'extra LF'
                  ? original + '\n'
                  : malformed === 'trailing record'
                    ? original + original
                    : Buffer.from([255]);
        writeFileSync(path, changed);
        expect(await executePushAudit(createRequest(fixture), fixture.context)).toBe(78);
        expect(readOutput(fixture.stderr).toString()).toContain(
          'toolkit release differs from the installed toolkit',
        );
        expect(readOutput(fixture.stdout).length).toBe(0);
        expect(fixture.launches).toEqual([]);
      }),
    );
  }

  it('refuses a release directory before reading it', async () =>
    runFixture(async (fixture) => {
      const path = join(fixture.archive, 'toolkit-release');
      rmSync(path);
      mkdirSync(path);
      expect(await executePushAudit(createRequest(fixture), fixture.context)).toBe(78);
      expect(readOutput(fixture.stderr).toString()).toContain(
        'toolkit release is not a regular file',
      );
      expect(fixture.launches).toEqual([]);
    }));

  it('refuses a FIFO release before its owned valid-record feeder can supply bytes', async () =>
    runFixture(async (fixture) => {
      const path = join(fixture.archive, 'toolkit-release');
      const record = readFileSync(path);
      rmSync(path);
      const created = Bun.spawnSync(['mkfifo', path], {
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 1000,
      });
      expect(created.exitCode, created.stderr.toString()).toBe(0);
      const feeder = join(fixture.root, 'fifo feeder.mjs');
      const marker = join(fixture.root, 'fifo feeder ready');
      writeFileSync(
        feeder,
        'import{writeFileSync}from"node:fs";writeFileSync(' +
          JSON.stringify(marker) +
          ',JSON.stringify(process.pid));writeFileSync(' +
          JSON.stringify(path) +
          ',Buffer.from(' +
          JSON.stringify([...record]) +
          '));',
      );
      const stdout: Uint8Array[] = [],
        stderr: Uint8Array[] = [];
      const observation = { hasReturned: false };
      // Borrow only the existing stage lifecycle for this test feeder, not an authenticated role.
      const pending = runLintChild({
        argv: fixture.context.launch(feeder),
        directory: fixture.root,
        environment: fixture.context.runtime.environment,
        stage: 'snapshotter',
        stdin: undefined,
        stdout: (chunk) => {
          stdout.push(chunk.slice());
          return { kind: 'written' };
        },
        stderr: (chunk) => {
          stderr.push(chunk.slice());
          return { kind: 'written' };
        },
        subscribeInterrupts: fixture.context.subscribeInterrupts,
      }).then(
        (outcome) => {
          observation.hasReturned = true;
          return { kind: 'returned' as const, outcome };
        },
        (failure: unknown) => {
          observation.hasReturned = true;
          return { kind: 'failure' as const, failure };
        },
      );
      let primary: { readonly kind: 'assertion' | 'feeder'; readonly failure: unknown } | undefined;
      let selectedPid: number | undefined;
      try {
        for (let poll = 0; poll < 500 && !existsSync(marker) && !observation.hasReturned; poll++)
          await Bun.sleep(20);
        if (observation.hasReturned) {
          const early = await pending;
          if (early.kind === 'failure') {
            primary = { kind: 'feeder', failure: early.failure };
            throw early.failure;
          }
          throw new Error('FIFO feeder returned before a reader could open its pipe');
        }
        expect(existsSync(marker)).toBe(true);
        const pid: unknown = JSON.parse(readFileSync(marker, 'utf8'));
        if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0)
          throw new Error('actual FIFO feeder PID is malformed');
        selectedPid = pid;
        expect(await executePushAudit(createRequest(fixture), fixture.context)).toBe(78);
        expect(readOutput(fixture.stderr).toString()).toContain(
          'toolkit release is not a regular file',
        );
        expect(fixture.launches).toEqual([feeder]);
      } catch (failure: unknown) {
        primary ??= { kind: 'assertion', failure };
      }
      const cleanup: unknown[] = [];
      try {
        fixture.interrupt('SIGTERM');
      } catch (failure: unknown) {
        cleanup.push(failure);
      }
      const settled = await pending;
      if (settled.kind === 'failure') {
        if (primary?.kind !== 'feeder') cleanup.push(settled.failure);
        if (primary !== undefined) {
          if (cleanup.length > 0)
            throw new AggregateError(
              [primary.failure, ...cleanup],
              'FIFO audit assertion and feeder settlement failed',
              { cause: primary.failure },
            );
          throw primary.failure;
        }
        throw new AggregateError(cleanup, 'FIFO feeder settlement failed', { cause: cleanup[0] });
      }
      if (settled.outcome.kind === 'exited' && settled.outcome.status !== 0)
        cleanup.push(
          new Error('FIFO feeder failed with status ' + String(settled.outcome.status), {
            cause: readOutput(stderr).toString(),
          }),
        );
      if (primary !== undefined) {
        if (cleanup.length > 0)
          throw new AggregateError(
            [primary.failure, ...cleanup],
            'FIFO audit assertion and feeder settlement failed',
            { cause: primary.failure },
          );
        throw primary.failure;
      }
      if (cleanup.length > 0)
        throw new AggregateError(cleanup, 'FIFO feeder settlement failed', { cause: cleanup[0] });
      expect(settled.outcome).toMatchObject({ kind: 'cancelled', status: 143, signal: 'SIGTERM' });
      expect(readOutput(stdout).length).toBe(0);
      expect(readOutput(stderr).length).toBe(0);
      if (selectedPid === undefined) throw new Error('actual FIFO feeder PID was not retained');
      let absence: unknown;
      try {
        process.kill(selectedPid, 0);
      } catch (failure: unknown) {
        absence = failure;
      }
      expect(absence).toMatchObject({ code: 'ESRCH' });
    }));

  it('refuses an unreadable release while retaining configured required policy', async () =>
    runFixture(async (fixture) => {
      const path = join(fixture.archive, 'toolkit-release');
      chmodSync(path, 0);
      let denial: unknown;
      try {
        readFileSync(path);
      } catch (failure: unknown) {
        denial = failure;
      }
      expect(denial).toMatchObject({ code: 'EACCES' });
      expect(await executePushAudit(createRequest(fixture), fixture.context)).toBe(78);
      expect(readOutput(fixture.stderr).toString()).toContain(
        'cannot read configured push audit authority',
      );
      expect(fixture.launches).toEqual([]);
    }));

  for (const destination of ['outside archive', 'inside candidate']) {
    it('refuses a release symlink ' + destination + ' before role execution', async () =>
      runFixture(async (fixture) => {
        const release = join(fixture.archive, 'toolkit-release');
        const elsewhere = join(
          destination === 'inside candidate' ? fixture.candidate : fixture.root,
          'selected release',
        );
        writeFileSync(elsewhere, readFileSync(release));
        rmSync(release);
        symlinkSync(elsewhere, release);
        expect(await executePushAudit(createRequest(fixture), fixture.context)).toBe(78);
        expect(readOutput(fixture.stderr).toString()).toContain(
          'toolkit release escapes its archive authority',
        );
        expect(fixture.launches).toEqual([]);
      }),
    );
  }

  for (const broken of ['marker', 'selection', 'validator', 'closure']) {
    it('retains current configured activation validation for a broken ' + broken, async () =>
      runFixture(async (fixture) => {
        if (broken === 'marker') rmSync(join(fixture.prepared.directory, 'active-v1'));
        if (broken === 'selection' || broken === 'validator') {
          const path =
            broken === 'selection'
              ? join(fixture.archive, 'selected.json')
              : join(fixture.prepared.directory, fixture.prepared.manifest.roles.validator);
          const corruption = broken === 'selection' ? '{}' : 'changed';
          chmodSync(path, 0o600);
          writeFileSync(path, corruption);
          chmodSync(path, 0o444);
          expect(statSync(path).mode & 0o777).toBe(0o444);
          expect(readFileSync(path, 'utf8')).toBe(corruption);
        }
        if (broken === 'closure')
          rmSync(join(fixture.archive, 'trusted-node-modules/typescript/package.json'));
        expect(await executePushAudit(createRequest(fixture), fixture.context)).toBe(78);
        expect(readOutput(fixture.stdout).length).toBe(0);
        expect(fixture.launches).toEqual([join(fixture.toolkit, 'launcher.mjs')]);
        expect(readdirSync(fixture.scratch)).toEqual([]);
      }),
    );
  }

  it('refuses a complete historical activation without executing its legacy launcher', async () =>
    runFixture(async (fixture) => {
      const marker = join(fixture.root, 'legacy launcher entered');
      const legacyLauncher = join(fixture.root, 'legacy launcher fixture.mjs');
      writeFileSync(
        legacyLauncher,
        'import{writeFileSync}from"node:fs";writeFileSync(' +
          JSON.stringify(marker) +
          ',"entered");',
      );
      const legacy = prepareActivation({
        ...fixture.prepared.request,
        roleSources: { ...fixture.prepared.request.roleSources, launcher: legacyLauncher },
        destination: join(fixture.archive, 'legacy'),
      });
      selectActivation(fixture.archive, legacy.directory, legacy.identity);
      expect(await executePushAudit(createRequest(fixture), fixture.context)).toBe(78);
      expect(readOutput(fixture.stderr).toString()).toBe(
        'tool-wiki lint: cannot verify current lint activation\n',
      );
      expect(readOutput(fixture.stdout).length).toBe(0);
      expect(fixture.launches).toEqual([join(fixture.toolkit, 'launcher.mjs')]);
      expect(existsSync(marker)).toBe(false);
    }));

  for (const failure of [new Error('unexpected audit policy failure'), undefined]) {
    it('preserves an unexpected policy dependency failure exactly: ' + String(failure), async () =>
      runFixture(async (fixture) => {
        const policy = spyOn(auditPolicy, 'readPushAudit').mockImplementation(() =>
          throwFailure(failure),
        );
        let primary: { readonly failure: unknown } | undefined;
        try {
          let caught: { readonly failure: unknown } | undefined;
          try {
            await executePushAudit(createRequest(fixture), fixture.context);
          } catch (cause: unknown) {
            caught = { failure: cause };
          }
          expect(caught).toBeDefined();
          if (caught === undefined)
            throw new Error('unexpected audit policy failure was swallowed');
          expect(caught.failure).toBe(failure);
          expect(readOutput(fixture.stdout).length).toBe(0);
          expect(fixture.launches).toEqual([]);
        } catch (cause: unknown) {
          primary = { failure: cause };
        }
        let cleanup: { readonly failure: unknown } | undefined;
        try {
          policy.mockRestore();
        } catch (cause: unknown) {
          cleanup = { failure: cause };
        }
        if (primary !== undefined && cleanup !== undefined)
          throw new AggregateError(
            [primary.failure, cleanup.failure],
            'audit dependency assertion and restoration failed',
            { cause: primary.failure },
          );
        if (primary !== undefined) throw primary.failure;
        if (cleanup !== undefined) throw cleanup.failure;
      }),
    );
  }

  for (const stdout of ['{}\n', certificate.replace('"certified":true', '"certified":false')]) {
    it(
      'forces required certification despite a reusable caller required=false: ' + stdout.trim(),
      async () =>
        runFixture(
          async (fixture) => {
            expect(fixture.context.required).toBe(false);
            expect(await executePushAudit(createRequest(fixture), fixture.context)).toBe(78);
            expect(readOutput(fixture.stdout).toString()).toBe(stdout);
            expect(readOutput(fixture.stderr).toString()).toContain(
              'required admission did not return certified enforce output',
            );
            expect(readdirSync(fixture.scratch)).toEqual([]);
          },
          'process.stdout.write(' + JSON.stringify(stdout) + ');',
        ),
    );
  }

  it('preserves original binary nonzero verdicts without certificate normalization', async () =>
    runFixture(async (fixture) => {
      expect(await executePushAudit(createRequest(fixture), fixture.context)).toBe(37);
      expect(readOutput(fixture.stdout)).toEqual(Buffer.from([0, 255, 65, 10]));
      expect(readOutput(fixture.stderr)).toEqual(Buffer.from([0, 254, 66, 10]));
      expect(readdirSync(fixture.scratch)).toEqual([]);
    }, 'process.stdout.write(Buffer.from([0,255,65,10]));process.stderr.write(Buffer.from([0,254,66,10]));process.exitCode=37;'));

  it('returns prior cancellation before absent installation or configured authority IO', async () =>
    runFixture(async (fixture) => {
      fixture.context.installedDirectory = '/absent/prior-cancel-installation';
      fixture.context.activationRoot = '/absent/prior-cancel-archive';
      fixture.interrupt('SIGTERM');
      expect(await executePushAudit(createRequest(fixture), fixture.context)).toBe(143);
      expect(readOutput(fixture.stdout).length).toBe(0);
      expect(fixture.launches).toEqual([]);
    }));

  it('settles its actual snapshotter cancellation before any validator and releases owned scratch', async () =>
    runFixture(
      async (fixture) => {
        const observation = { hasReturned: false };
        const pending = executePushAudit(createRequest(fixture), fixture.context).then(
          (status) => {
            observation.hasReturned = true;
            return { kind: 'verdict' as const, status };
          },
          (failure: unknown) => {
            observation.hasReturned = true;
            return { kind: 'failure' as const, failure };
          },
        );
        const marker = join(fixture.root, 'snapshotter started');
        let primary: { readonly failure: unknown } | undefined;
        let hasSentInterrupt = false;
        let hasObservedOwner = false;
        try {
          for (let poll = 0; poll < 500 && !existsSync(marker) && !observation.hasReturned; poll++)
            await Bun.sleep(20);
          if (observation.hasReturned) {
            const early = await pending;
            hasObservedOwner = true;
            if (early.kind === 'failure') throw early.failure;
            throw new Error('audit returned before actual snapshotter readiness');
          }
          expect(existsSync(marker)).toBe(true);
          const selectedPid: unknown = JSON.parse(readFileSync(marker, 'utf8'));
          if (
            typeof selectedPid !== 'number' ||
            !Number.isSafeInteger(selectedPid) ||
            selectedPid <= 0
          )
            throw new Error('actual snapshotter PID is malformed');
          hasSentInterrupt = true;
          fixture.interrupt('SIGTERM');
          const observed = await pending;
          hasObservedOwner = true;
          if (observed.kind === 'failure') throw observed.failure;
          expect(observed.status).toBe(143);
          let absence: unknown;
          try {
            process.kill(selectedPid, 0);
          } catch (failure: unknown) {
            absence = failure;
          }
          expect(absence).toMatchObject({ code: 'ESRCH' });
          expect(existsSync(join(fixture.root, 'validator started'))).toBe(false);
          expect(readdirSync(fixture.scratch)).toEqual([]);
        } catch (failure: unknown) {
          primary = { failure };
        }
        const cleanup: unknown[] = [];
        if (!hasSentInterrupt) {
          try {
            fixture.interrupt('SIGTERM');
          } catch (failure: unknown) {
            cleanup.push(failure);
          }
        }
        const settled = await pending;
        if (!hasObservedOwner && settled.kind === 'failure') cleanup.push(settled.failure);
        if (primary !== undefined) {
          if (cleanup.length > 0)
            throw new AggregateError(
              [primary.failure, ...cleanup],
              'push audit test and owner settlement failed',
              { cause: primary.failure },
            );
          throw primary.failure;
        }
        if (cleanup.length > 0)
          throw new AggregateError(cleanup, 'push audit owner settlement failed', {
            cause: cleanup[0],
          });
      },
      (root) =>
        'import{writeFileSync}from"node:fs";writeFileSync(' +
        JSON.stringify(join(root, 'validator started')) +
        ',"validator");',
      (root) =>
        'import{writeFileSync}from"node:fs";process.on("SIGTERM",()=>process.exit(0));writeFileSync(' +
        JSON.stringify(join(root, 'snapshotter started')) +
        ',JSON.stringify(process.pid));setInterval(()=>{},1000);',
    ));
});
