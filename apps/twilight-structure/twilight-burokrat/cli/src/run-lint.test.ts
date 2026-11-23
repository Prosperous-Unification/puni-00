import { Buffer } from 'node:buffer';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { createShebang } from '@shared/bun-startup';
import * as validation from '@shared/validation';
import { parseOrThrow, type } from '@shared/validation';
import { afterEach, describe, expect, it, spyOn } from 'bun:test';

import * as childModule from './lint-child';
import { LintCleanupFailure } from './lint-child';
import { readLintRuntime } from './lint-runtime';
import { readLintCandidate, runLint } from './run-lint';
import { createLintFixture } from './testing/lint-fixtures';
import { decodeRequest as decodeValidatorRequest } from './validator-request';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function createFixture(validator: string, snapshotter?: string) {
  const fixture = createLintFixture(validator, snapshotter);
  roots.push(fixture.root);
  return fixture;
}

describe('Bun lint activation execution', () => {
  for (const kind of ['working', 'staged', 'committed'] as const) {
    it('captures and invokes the selected validator for ' + kind, async () => {
      const fixture = createFixture(
        'const envelope = JSON.parse(await Bun.stdin.text()); process.stdout.write(JSON.stringify({ envelope, environment: process.env, directory: process.cwd() }));',
      );
      const status = await runLint(
        { ...fixture.invocation, request: { ...fixture.invocation.request, kind } },
        fixture.context,
      );
      expect(status).toBe(0);
      const input: unknown = JSON.parse(Buffer.concat(fixture.stdout).toString());
      const report = parseOrThrow(
        type({ envelope: 'unknown', environment: { '[string]': 'string' }, directory: 'string' }),
        input,
      );
      const envelope = decodeValidatorRequest(Buffer.from(JSON.stringify(report.envelope)));
      expect(report.envelope).toEqual(envelope);
      expect(envelope.version).toBe(1);
      expect(envelope.callerDirectory).toBe(fixture.root);
      expect(envelope.request).toEqual(
        kind === 'committed'
          ? {
              command: 'lint-ci',
              kind,
              repository: fixture.candidate,
              revision: 'opaque revision',
              evidence: join(fixture.prepared.directory, fixture.prepared.manifest.roles.evidence),
            }
          : {
              command: 'lint-local',
              mode: kind === 'working' ? 'observe' : 'ratchet',
              kind,
              repository: fixture.candidate,
              revision: 'opaque revision',
              binding: join(
                fixture.prepared.directory,
                fixture.prepared.manifest.roles.localBinding,
              ),
              evidence: join(fixture.prepared.directory, fixture.prepared.manifest.roles.evidence),
            },
      );
      expect(report.environment['TOOL_WIKI_TRUSTED_NODE_MODULES']).toBe(
        join(fixture.archive, 'trusted-node-modules'),
      );
      if (kind === 'committed')
        expect(report.environment['TOOL_WIKI_CI_TRUSTED_BINDING']).toBe(
          join(fixture.prepared.directory, fixture.prepared.manifest.roles.ciBinding),
        );
      else expect(report.environment).not.toHaveProperty('TOOL_WIKI_CI_TRUSTED_BINDING');
      expect(report.directory.startsWith(fixture.scratch + '/puni-lint-')).toBe(true);
      expect(readdirSync(fixture.scratch)).toEqual([]);
      expect(Buffer.concat(fixture.stderr)).toHaveLength(0);
    });
  }
  it('preserves raw binary output and a nonzero validator verdict', async () => {
    const fixture = createFixture(
      'process.stdout.write(Uint8Array.from([255,0,65])); process.stderr.write(Uint8Array.from([254,66])); process.exitCode = 37;',
    );
    expect(await runLint(fixture.invocation, { ...fixture.context, required: true })).toBe(37);
    expect(Array.from(Buffer.concat(fixture.stdout))).toEqual([255, 0, 65]);
    expect(Array.from(Buffer.concat(fixture.stderr))).toEqual([254, 66]);
    expect(readdirSync(fixture.scratch)).toEqual([]);
  });
  it('keeps optional absence visible after supported Git and candidate preflight', async () => {
    const fixture = createFixture('export {};');
    expect(
      await runLint(fixture.invocation, { ...fixture.context, activationRoot: undefined }),
    ).toBe(0);
    expect(JSON.parse(Buffer.concat(fixture.stdout).toString())).toEqual({
      schemaVersion: 1,
      status: 'inactive',
      certified: false,
      reason: 'external activation root is not provisioned',
    });
    expect(readdirSync(fixture.scratch)).toEqual([]);
  });
  it('requires the complete enforce certificate while retaining exact report bytes', async () => {
    const bytes = JSON.stringify({
      schemaVersion: 1,
      mode: 'enforce',
      trustProvenance: 'ci-preselected',
      accepted: true,
      certified: true,
      extra: 'retained',
    });
    const fixture = createFixture('process.stdout.write(' + JSON.stringify(bytes) + ');');
    expect(await runLint(fixture.invocation, { ...fixture.context, required: true })).toBe(0);
    expect(Buffer.concat(fixture.stdout).toString()).toBe(bytes);
  });
  for (const field of ['schemaVersion', 'mode', 'trustProvenance', 'accepted', 'certified']) {
    it('refuses a zero verdict missing certificate field ' + field, async () => {
      const report: Record<string, unknown> = {
        schemaVersion: 1,
        mode: 'enforce',
        trustProvenance: 'ci-preselected',
        accepted: true,
        certified: true,
      };
      const bytes = JSON.stringify(
        Object.fromEntries(Object.entries(report).filter(([name]) => name !== field)),
      );
      const fixture = createFixture('process.stdout.write(' + JSON.stringify(bytes) + ');');
      expect(await runLint(fixture.invocation, { ...fixture.context, required: true })).toBe(78);
      expect(Buffer.concat(fixture.stdout).toString()).toBe(bytes);
      expect(Buffer.concat(fixture.stderr).toString()).toContain(
        'required admission did not return certified enforce output',
      );
      expect(readdirSync(fixture.scratch)).toEqual([]);
    });
  }
});

it('retains owned scratch when process-group cleanup cannot be confirmed', async () => {
  const fixture = createFixture('export {};');
  const fault = new LintCleanupFailure(
    [new Error('injected group disappearance deadline')],
    'unconfirmed fixture cleanup',
  );
  const executeChild = childModule.runLintChild;
  const run = spyOn(childModule, 'runLintChild').mockImplementation((request) =>
    request.stage === 'snapshotter' ? Promise.reject(fault) : executeChild(request),
  );
  try {
    const failure: unknown = await runLint(fixture.invocation, fixture.context).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(failure).toBeInstanceOf(LintCleanupFailure);
    if (!(failure instanceof LintCleanupFailure)) throw new Error('cleanup failure lost its type');
    expect(failure.errors).toEqual([fault]);
    const retained = readdirSync(fixture.scratch);
    expect(retained).toHaveLength(1);
    expect(failure.message).toContain(join(fixture.scratch, retained[0]));
  } finally {
    run.mockRestore();
  }
});

it('does not resolve a relative Git PATH component from the caller candidate', async () => {
  const fixture = createFixture('export {};');
  const marker = join(fixture.root, 'candidate-git-executed');
  const executable = join(fixture.candidate, 'git');
  writeFileSync(
    executable,
    '#!' +
      process.execPath +
      '\nimport { writeFileSync } from "node:fs"; writeFileSync(' +
      JSON.stringify(marker) +
      ',"executed"); process.stdout.write(process.argv.includes("--version") ? "git version 2.43.0\\n" : ' +
      JSON.stringify(fixture.candidate + '\n') +
      ');',
  );
  chmodSync(executable, 0o755);
  await runLint(
    {
      ...fixture.invocation,
      callerDirectory: fixture.candidate,
      request: { ...fixture.invocation.request, repository: '.' },
    },
    { ...fixture.context, path: '.:/usr/bin:/bin', activationRoot: undefined },
  );
  expect(existsSync(marker)).toBe(false);
});

for (const [field, value] of [
  ['schemaVersion', 2],
  ['mode', 'observe'],
  ['trustProvenance', 'local-operator'],
  ['accepted', false],
  ['certified', false],
] as const) {
  it('refuses a zero verdict with wrong certificate ' + field, async () => {
    const report: Record<string, unknown> = {
      schemaVersion: 1,
      mode: 'enforce',
      trustProvenance: 'ci-preselected',
      accepted: true,
      certified: true,
      [field]: value,
    };
    const bytes = JSON.stringify(report);
    const fixture = createFixture('process.stdout.write(' + JSON.stringify(bytes) + ');');
    expect(await runLint(fixture.invocation, { ...fixture.context, required: true })).toBe(78);
    expect(Buffer.concat(fixture.stdout).toString()).toBe(bytes);
  });
}
for (const bytes of ['not JSON', '']) {
  it('refuses malformed required certificate ' + JSON.stringify(bytes), async () => {
    const fixture = createFixture('process.stdout.write(' + JSON.stringify(bytes) + ');');
    expect(await runLint(fixture.invocation, { ...fixture.context, required: true })).toBe(78);
    expect(Buffer.concat(fixture.stdout).toString()).toBe(bytes);
  });
}
it('refuses invalid UTF-8 certification while preserving its bytes', async () => {
  const fixture = createFixture('process.stdout.write(Uint8Array.from([255]));');
  expect(await runLint(fixture.invocation, { ...fixture.context, required: true })).toBe(78);
  expect(Array.from(Buffer.concat(fixture.stdout))).toEqual([255]);
});
it('refuses unsupported Git before optional inactive activation can return', async () => {
  const fixture = createFixture('export {};');
  const rootQueried = join(fixture.root, 'git-root-query.executed');
  const bin = join(fixture.root, 'bin');
  mkdirSync(bin);
  const git = join(bin, 'git');
  writeFileSync(
    git,
    '#!' +
      process.execPath +
      '\nimport{writeFileSync}from"node:fs";if(!process.argv.includes("--version"))writeFileSync(' +
      JSON.stringify(rootQueried) +
      ',"queried");process.stdout.write(process.argv.includes("--version") ? "git version 2.35.9\\n" : ' +
      JSON.stringify(fixture.candidate + '\n') +
      ');',
  );
  chmodSync(git, 0o755);
  const failure: unknown = await runLint(fixture.invocation, {
    ...fixture.context,
    path: bin + ':/usr/bin:/bin',
    activationRoot: undefined,
  }).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw failure;
  expect(failure.message).toBe('Git 2.36.0 or newer is required');
  expect(fixture.stdout).toHaveLength(0);
  expect(existsSync(rootQueried)).toBe(false);
});
it('refuses a nonrepository before optional inactive activation can return', async () => {
  const fixture = createFixture('export {};');
  const invocation = {
    ...fixture.invocation,
    request: { ...fixture.invocation.request, repository: fixture.root },
  };
  const failure: unknown = await runLint(invocation, {
    ...fixture.context,
    activationRoot: undefined,
  }).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(failure).toBeInstanceOf(Error);
  expect(fixture.stdout).toHaveLength(0);
});
it('refuses scratch inside the actual candidate before creating files', async () => {
  const fixture = createFixture('export {};');
  const before = readdirSync(fixture.candidate);
  const failure: unknown = await runLint(fixture.invocation, {
    ...fixture.context,
    scratchDirectory: fixture.candidate,
  }).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw failure;
  expect(failure.message).toBe('lint scratch root must be outside the candidate repository');
  expect(readdirSync(fixture.candidate)).toEqual(before);
});

it('preserves recorded cancellation before optional activation preflight', async () => {
  const fixture = createFixture('export {};');
  const status = await runLint(fixture.invocation, {
    ...fixture.context,
    activationRoot: undefined,
    subscribeInterrupts: (listener) => {
      listener('SIGINT');
      return () => undefined;
    },
  });
  expect(status).toBe(130);
  expect(fixture.stdout).toHaveLength(0);
  expect(readdirSync(fixture.scratch)).toEqual([]);
});

it('retains a nonzero snapshotter verdict and never invokes the validator', async () => {
  const fixture = createFixture(
    'throw new Error("validator must not execute");',
    'process.stdout.write("snapshot partial"); process.stderr.write("snapshot error"); process.exitCode=73;',
  );
  expect(await runLint(fixture.invocation, fixture.context)).toBe(73);
  expect(Buffer.concat(fixture.stdout).toString()).toBe('snapshot partial');
  expect(Buffer.concat(fixture.stderr).toString()).toBe('snapshot error');
  expect(readdirSync(fixture.scratch)).toEqual([]);
});
for (const phase of ['schema', 'JSON'] as const) {
  it('preserves internal certificate ' + phase + ' TypeErrors', async () => {
    const bytes = JSON.stringify({
      schemaVersion: 1,
      mode: 'enforce',
      trustProvenance: 'ci-preselected',
      accepted: true,
      certified: true,
    });
    const fixture = createFixture('process.stdout.write(' + JSON.stringify(bytes) + ');');
    const fault = new TypeError('injected certificate ' + phase + ' implementation fault');
    const parse = JSON.parse.bind(JSON);
    const validate = validation.parseSecretsOrThrow;
    const interception: typeof validation.parseSecretsOrThrow = (schema, input) => {
      if (typeof input === 'object' && input !== null && 'certified' in input) throw fault;
      return validate(schema, input);
    };
    const spy =
      phase === 'schema'
        ? spyOn(validation, 'parseSecretsOrThrow').mockImplementation(interception)
        : spyOn(JSON, 'parse').mockImplementation((text, reviver) => {
            if (text === bytes) throw fault;
            const input: unknown = parse(text, reviver);
            return input;
          });
    try {
      const failure: unknown = await runLint(fixture.invocation, {
        ...fixture.context,
        required: true,
      }).then(
        () => undefined,
        (cause: unknown) => cause,
      );
      expect(failure).toBe(fault);
      expect(Buffer.concat(fixture.stdout).toString()).toBe(bytes);
      expect(readdirSync(fixture.scratch)).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
}

it('keeps the selected Git PATH identity when the captured validator changes cwd', async () => {
  const fixture = createFixture(
    'const git=Bun.spawnSync(["git","--version"],{stdout:"pipe",stderr:"pipe"});if(git.exitCode!==0)throw new Error("Git invocation failed");process.stdout.write(git.stdout);',
  );
  const bin = join(fixture.candidate, 'bin');
  mkdirSync(bin);
  const marker = join(fixture.root, 'candidate-path-git.executed');
  const git = join(bin, 'git');
  writeFileSync(
    git,
    '#!' +
      process.execPath +
      '\nimport{writeFileSync}from"node:fs";writeFileSync(' +
      JSON.stringify(marker) +
      ',"executed");process.stdout.write("candidate Git executed");',
  );
  chmodSync(git, 0o755);
  expect(
    await runLint(fixture.invocation, {
      ...fixture.context,
      path: '../../candidate/bin:/usr/bin:/bin',
    }),
  ).toBe(0);
  expect(existsSync(marker)).toBe(false);
  expect(Buffer.concat(fixture.stdout).toString()).toMatch(/^git version /u);
});

it('runs both Git probes from the trusted runtime cwd after PATH is frozen', async () => {
  const fixture = createFixture('export {};');
  const priorAmbient = process.env['PUNI_LINT_AMBIENT_SENTINEL'];
  process.env['PUNI_LINT_AMBIENT_SENTINEL'] = 'must-not-reach-Git-probes';
  try {
    const bin = join(fixture.root, 'observed-bin');
    mkdirSync(bin);
    const observed = join(fixture.root, 'git-cwds');
    const git = join(bin, 'git');
    writeFileSync(
      git,
      createShebang() +
        '\nimport{appendFileSync}from"node:fs";appendFileSync(' +
        JSON.stringify(observed) +
        ',JSON.stringify({directory:process.cwd(),global:process.env.GIT_CONFIG_GLOBAL,system:process.env.GIT_CONFIG_SYSTEM,protocol:process.env.GIT_ALLOW_PROTOCOL,hooks:process.env.GIT_CONFIG_VALUE_0,monitor:process.env.GIT_CONFIG_VALUE_1,hasAmbientSentinel:Object.hasOwn(process.env,"PUNI_LINT_AMBIENT_SENTINEL")})+"\\n");const child=Bun.spawnSync(["/usr/bin/git",...process.argv.slice(2)],{stdin:"ignore",stdout:"inherit",stderr:"inherit"});if(child.exitCode!==0)throw new Error("native fixture Git failed");',
    );
    chmodSync(git, 0o755);
    expect(
      await runLint(
        {
          ...fixture.invocation,
          callerDirectory: fixture.candidate,
          request: { ...fixture.invocation.request, repository: '.' },
        },
        {
          ...fixture.context,
          path: bin + ':' + dirname(process.execPath) + ':/usr/bin:/bin',
          activationRoot: undefined,
        },
      ),
    ).toBe(0);
    const observation = JSON.stringify({
      directory: fixture.root,
      global: '/dev/null',
      system: '/dev/null',
      protocol: '',
      hooks: '/dev/null',
      monitor: 'false',
      hasAmbientSentinel: false,
    });
    expect(readFileSync(observed, 'utf8')).toBe(observation + '\n' + observation + '\n');
  } finally {
    if (priorAmbient === undefined) delete process.env['PUNI_LINT_AMBIENT_SENTINEL'];
    else process.env['PUNI_LINT_AMBIENT_SENTINEL'] = priorAmbient;
  }
});

it('preserves cancellation of the optional inactive report without creating scratch', async () => {
  const fixture = createFixture('throw new Error("must not execute");');
  const status = await runLint(fixture.invocation, {
    ...fixture.context,
    activationRoot: undefined,
    stdout: () => Promise.resolve({ kind: 'cancelled', signal: 'SIGTERM' }),
  });
  expect(status).toBe(143);
  expect(readdirSync(fixture.scratch)).toEqual([]);
});

it('preserves cancellation of a required certificate refusal report', async () => {
  const fixture = createFixture('process.stdout.write("{}");');
  expect(
    await runLint(fixture.invocation, {
      ...fixture.context,
      required: true,
      stderr: () => Promise.resolve({ kind: 'cancelled', signal: 'SIGINT' }),
    }),
  ).toBe(130);
  expect(readdirSync(fixture.scratch)).toEqual([]);
});

it('preserves unconfirmed preflight cleanup without creating activation scratch', async () => {
  const fixture = createFixture('throw new Error("must not start after Git failure");');
  const fault = new LintCleanupFailure(
    [new Error('injected preflight group cleanup failure')],
    'preflight cleanup unconfirmed',
  );
  const executeChild = childModule.runLintChild;
  const run = spyOn(childModule, 'runLintChild').mockImplementation((request) =>
    request.stage === 'Git version' ? Promise.reject(fault) : executeChild(request),
  );
  try {
    const failure: unknown = await runLint(fixture.invocation, fixture.context).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(failure).toBe(fault);
    expect(readdirSync(fixture.scratch)).toEqual([]);
  } finally {
    run.mockRestore();
  }
});

it('does not spawn a Git probe after prior cancellation reaches its direct API', async () => {
  const fixture = createFixture('export {};');
  const candidate = await readLintCandidate(
    fixture.invocation,
    readLintRuntime('', fixture.root),
    (listener) => {
      listener('SIGINT');
      return () => undefined;
    },
  );
  expect(candidate).toEqual({ kind: 'cancelled', status: 130 });
  expect(readdirSync(fixture.scratch)).toEqual([]);
});
