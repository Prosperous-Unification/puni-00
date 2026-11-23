import * as filesystem from 'node:fs';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as validation from '@shared/validation';
import { afterEach, describe, expect, it, spyOn } from 'bun:test';

import * as contentManifest from './evidence/content-manifest';
import { hashBytes, serializeCanonical } from './evidence/content-manifest';
import { LintActivationRefusal, readLintActivation } from './lint-activation';
import * as activationModule from './policy/activation';
import { prepareActivation, prepareBunActivation, selectActivation } from './policy/activation';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function writeFile(path: string, bytes: string) {
  writeFileSync(path, bytes);
  return path;
}
function overwriteFile(path: string, bytes: string) {
  chmodSync(path, 0o644);
  writeFileSync(path, bytes);
}
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni-lint-activation-'));
  roots.push(root);
  const candidate = join(root, 'candidate');
  const source = join(root, 'reviewed');
  const archive = join(root, 'archive');
  for (const path of [candidate, source, archive]) mkdirSync(path);
  const closure = join(archive, 'trusted-node-modules');
  mkdirSync(join(closure, 'typescript'), { recursive: true });
  writeFile(
    join(closure, 'typescript/package.json'),
    '{"name":"typescript","version":"fixture"}\n',
  );
  const roleSources = {
    authority: writeFile(join(source, 'authority.json'), '{}\n'),
    ciBinding: join(source, 'ci-binding.json'),
    evidence: writeFile(join(source, 'evidence.json'), '{}\n'),
    launcher: writeFile(join(source, 'launcher.mjs'), 'export {};\n'),
    localBinding: join(source, 'local-binding.json'),
    mapping: writeFile(join(source, 'mapping.json'), '{}\n'),
    policy: writeFile(join(source, 'policy.json'), '{}\n'),
    reviewReceipt: writeFile(join(source, 'review-receipt.json'), '{}\n'),
    snapshotter: writeFile(join(source, 'snapshotter.ts'), 'export {};\n'),
    validator: writeFile(join(source, 'validator.mjs'), 'export {};\n'),
  };
  const binding = JSON.stringify({
    policy: { path: 'policy.json', sha256: hashBytes(readFileSync(roleSources.policy)) },
    authority: {
      artifact: { path: 'authority.json', sha256: hashBytes(readFileSync(roleSources.authority)) },
    },
    validator: {
      artifacts: [
        { path: 'validator.mjs', sha256: hashBytes(readFileSync(roleSources.validator)) },
      ],
    },
  });
  writeFile(roleSources.ciBinding, binding);
  writeFile(roleSources.localBinding, binding);
  const prepared = prepareBunActivation({
    candidateRepository: candidate,
    destination: join(archive, 'v1'),
    roleSources,
    sourceRevision: 'a'.repeat(40),
    policyIdentity: hashBytes(readFileSync(roleSources.policy)),
    mappingIdentity: hashBytes(readFileSync(roleSources.mapping)),
    validatorIdentity: hashBytes(readFileSync(roleSources.validator)),
    reviewReceiptIdentity: hashBytes(readFileSync(roleSources.reviewReceipt)),
  });
  selectActivation(archive, prepared.directory, prepared.identity);
  const context = {
    candidateRoot: candidate,
    callerDirectory: root,
    activationRoot: archive,
    trustedNodeModules: undefined,
    required: false,
  };
  return { root, candidate, archive, closure, prepared, context };
}

describe('current lint activation selection', () => {
  it('reads a real current writer package while defaulting the closure from the configured archive root', () => {
    const fixture = createFixture();
    const selected = readLintActivation(fixture.context);
    expect(selected.kind).toBe('active');
    if (selected.kind !== 'active') throw new Error('fixture did not select an activation');
    expect(selected.activation.identity).toBe(fixture.prepared.identity);
    expect(selected.activation.manifest.schemaVersion).toBe(4);
    expect(selected.trustedNodeModules).toBe(fixture.closure);
    expect(selected.configuredRoot).toBe(fixture.archive);
  });

  it('accepts a complete flat schema4 package with an explicit external closure', () => {
    const fixture = createFixture();
    const selected = readLintActivation({
      ...fixture.context,
      activationRoot: fixture.prepared.directory,
      trustedNodeModules: fixture.closure,
    });
    expect(selected.kind).toBe('active');
  });

  it('anchors configured root and closure paths against the captured caller without lexical collapse', () => {
    const fixture = createFixture();
    const selected = readLintActivation({
      ...fixture.context,
      activationRoot: 'archive',
      trustedNodeModules: 'archive/trusted-node-modules',
    });
    expect(selected.kind).toBe('active');
  });

  for (const activationRoot of [undefined, '', '/definitely-absent-puni-activation-fixture']) {
    it('models optional absent root ' + String(activationRoot), () => {
      const fixture = createFixture();
      expect(readLintActivation({ ...fixture.context, activationRoot })).toEqual({
        kind: 'inactive',
        reason: 'external activation root is not provisioned',
      });
    });
    it('refuses required absent root ' + String(activationRoot), () => {
      const fixture = createFixture();
      expect(() =>
        readLintActivation({ ...fixture.context, activationRoot, required: true }),
      ).toThrow(LintActivationRefusal);
    });
  }

  for (const kind of ['final', 'ancestor'] as const) {
    it('refuses a configured dangling root symlink at its ' + kind + ' component', () => {
      const fixture = createFixture();
      const link = join(fixture.root, 'dangling');
      symlinkSync(join(fixture.root, 'absent-target'), link);
      const activationRoot = kind === 'final' ? link : join(link, 'root');
      expect(() => readLintActivation({ ...fixture.context, activationRoot })).toThrow(
        LintActivationRefusal,
      );
    });
  }

  it('refuses a configured root that is a file', () => {
    const fixture = createFixture();
    const activationRoot = writeFile(join(fixture.root, 'root-file'), 'not a directory');
    expect(() => readLintActivation({ ...fixture.context, activationRoot })).toThrow(
      LintActivationRefusal,
    );
  });

  it('distinguishes an optional absent flat marker from a broken selected package', () => {
    const fixture = createFixture();
    rmSync(join(fixture.prepared.directory, 'active-v1'));
    expect(() => readLintActivation(fixture.context)).toThrow(LintActivationRefusal);
    rmSync(join(fixture.archive, 'selected.json'));
    expect(readLintActivation(fixture.context)).toEqual({
      kind: 'inactive',
      reason: 'external activation marker is not provisioned',
    });
    expect(() => readLintActivation({ ...fixture.context, required: true })).toThrow(
      LintActivationRefusal,
    );
  });

  for (const descriptor of [
    {
      schemaVersion: 2,
      directory: 'v1',
      identity: 'a'.repeat(64),
      checksumsIdentity: 'b'.repeat(64),
    },
    {
      schemaVersion: 1,
      directory: '../escape',
      identity: 'a'.repeat(64),
      checksumsIdentity: 'b'.repeat(64),
    },
    {
      schemaVersion: 1,
      directory: '/absolute',
      identity: 'a'.repeat(64),
      checksumsIdentity: 'b'.repeat(64),
    },
    {
      schemaVersion: 1,
      directory: 'v1//child',
      identity: 'a'.repeat(64),
      checksumsIdentity: 'b'.repeat(64),
    },
    { schemaVersion: 1, directory: 'v1', identity: 'bad', checksumsIdentity: 'b'.repeat(64) },
    { schemaVersion: 1, directory: 'v1', identity: 'a'.repeat(64), checksumsIdentity: 'bad' },
    {
      schemaVersion: 1,
      directory: 'v1',
      identity: 'a'.repeat(64),
      checksumsIdentity: 'b'.repeat(64),
      extra: true,
    },
  ]) {
    it(
      'refuses malformed selection ' + JSON.stringify(descriptor) + ' without a flat fallback',
      () => {
        const fixture = createFixture();
        overwriteFile(join(fixture.archive, 'selected.json'), JSON.stringify(descriptor));
        expect(() => readLintActivation(fixture.context)).toThrow(
          'activation selection is malformed',
        );
      },
    );
  }

  for (const role of [
    'selected.json',
    'manifest.json',
    'checksums.sha256',
    'launcher-path',
    'artifacts/snapshotter.ts',
    'artifacts/validator.mjs',
  ]) {
    it('refuses candidate-targeted authority/role symlinks for ' + role, () => {
      const fixture = createFixture();
      const path =
        role === 'selected.json'
          ? join(fixture.archive, role)
          : join(fixture.prepared.directory, role);
      const copy = join(fixture.candidate, 'candidate-owned');
      copyFileSync(path, copy);
      rmSync(path);
      symlinkSync(copy, path);
      expect(() => readLintActivation(fixture.context)).toThrow(LintActivationRefusal);
    });
  }

  it('refuses a closure containing a symlink into the candidate', () => {
    const fixture = createFixture();
    const candidateFile = writeFile(join(fixture.candidate, 'compiler.js'), 'unreviewed');
    symlinkSync(candidateFile, join(fixture.closure, 'typescript/compiler.js'));
    expect(() => readLintActivation(fixture.context)).toThrow(LintActivationRefusal);
  });

  it('refuses a candidate-contained configured root or closure', () => {
    const fixture = createFixture();
    expect(() =>
      readLintActivation({ ...fixture.context, activationRoot: fixture.candidate }),
    ).toThrow(LintActivationRefusal);
    expect(() =>
      readLintActivation({ ...fixture.context, trustedNodeModules: fixture.candidate }),
    ).toThrow(LintActivationRefusal);
  });

  it('refuses missing TypeScript and a legacy descriptor-only flat root', () => {
    const fixture = createFixture();
    rmSync(join(fixture.closure, 'typescript/package.json'));
    expect(() => readLintActivation(fixture.context)).toThrow(LintActivationRefusal);
    writeFile(join(fixture.closure, 'typescript/package.json'), '{}');
    rmSync(join(fixture.archive, 'selected.json'));
    writeFile(join(fixture.archive, 'active-v1'), 'tool-wiki-active-v1\n');
    expect(() => readLintActivation(fixture.context)).toThrow(LintActivationRefusal);
  });
});

describe('lint authority boundary details', () => {
  it('preserves native symlink/parent resolution for configured host inputs', () => {
    const fixture = createFixture();
    const native = join(fixture.root, 'native');
    mkdirSync(join(native, 'inner'), { recursive: true });
    cpSync(fixture.archive, join(native, 'archive'), { recursive: true });
    cpSync(fixture.closure, join(native, 'closure'), { recursive: true });
    cpSync(fixture.closure, join(fixture.root, 'closure'), { recursive: true });
    symlinkSync(join(native, 'inner'), join(fixture.root, 'alias'));
    const selected = readLintActivation({
      ...fixture.context,
      activationRoot: 'alias/../archive',
      trustedNodeModules: 'alias/../closure',
    });
    expect(selected.kind).toBe('active');
    if (selected.kind !== 'active') throw new Error('native fixture did not activate');
    expect(selected.configuredRoot).toBe(join(native, 'archive'));
    expect(selected.trustedNodeModules).toBe(join(native, 'closure'));
  });

  it('models an explicitly empty optional closure override as the configured-root default', () => {
    const fixture = createFixture();
    const selected = readLintActivation({ ...fixture.context, trustedNodeModules: '' });
    expect(selected.kind).toBe('active');
    if (selected.kind !== 'active') throw new Error('fixture did not activate');
    expect(selected.trustedNodeModules).toBe(fixture.closure);
  });

  for (const field of ['identity', 'checksumsIdentity'] as const) {
    it('binds the selected raw ' + field + ' before reading role descriptors', () => {
      const fixture = createFixture();
      const bytes = JSON.parse(
        readFileSync(join(fixture.archive, 'selected.json'), 'utf8'),
      ) as Record<string, unknown>;
      overwriteFile(
        join(fixture.archive, 'selected.json'),
        JSON.stringify({ ...bytes, [field]: 'b'.repeat(64) }),
      );
      expect(() => readLintActivation(fixture.context)).toThrow(
        'selected activation package failed digest verification',
      );
    });
  }

  it('refuses a selected version symlink that leaves its configured archive root', () => {
    const fixture = createFixture();
    const escaped = join(fixture.root, 'escaped');
    cpSync(fixture.prepared.directory, escaped, { recursive: true });
    symlinkSync(escaped, join(fixture.archive, 'linked'));
    overwriteFile(
      join(fixture.archive, 'selected.json'),
      JSON.stringify({
        schemaVersion: 1,
        directory: 'linked',
        identity: fixture.prepared.identity,
        checksumsIdentity: hashBytes(readFileSync(join(escaped, 'checksums.sha256'))),
      }),
    );
    expect(() => readLintActivation(fixture.context)).toThrow(
      'selected activation escapes its external root',
    );
  });

  it('refuses a selected version symlink that resolves to its configured root itself', () => {
    const fixture = createFixture();
    const root = fixture.prepared.directory;
    symlinkSync(root, join(root, 'same'));
    writeFile(
      join(root, 'selected.json'),
      JSON.stringify({
        schemaVersion: 1,
        directory: 'same',
        identity: fixture.prepared.identity,
        checksumsIdentity: hashBytes(readFileSync(join(root, 'checksums.sha256'))),
      }),
    );
    expect(() =>
      readLintActivation({
        ...fixture.context,
        activationRoot: root,
        trustedNodeModules: fixture.closure,
      }),
    ).toThrow('selected activation escapes its external root');
  });

  for (const name of ['selected.json', 'manifest.json', 'checksums.sha256', 'launcher-path']) {
    it('keeps authority metadata inside its own root for ' + name, () => {
      const fixture = createFixture();
      const path =
        name === 'selected.json'
          ? join(fixture.archive, name)
          : join(fixture.prepared.directory, name);
      const external = join(fixture.root, 'outside-authority');
      copyFileSync(path, external);
      rmSync(path);
      symlinkSync(external, path);
      expect(() => readLintActivation(fixture.context)).toThrow('escapes its authority root');
    });
  }

  it('refuses a candidate role even when a flat package is an ancestor of the candidate', () => {
    const fixture = createFixture();
    const nestedCandidate = join(fixture.prepared.directory, 'candidate');
    renameSync(fixture.candidate, nestedCandidate);
    const path = join(fixture.prepared.directory, 'artifacts/snapshotter.ts');
    const target = join(nestedCandidate, 'snapshotter.ts');
    copyFileSync(path, target);
    rmSync(path);
    symlinkSync(target, path);
    expect(() =>
      readLintActivation({
        ...fixture.context,
        candidateRoot: nestedCandidate,
        activationRoot: fixture.prepared.directory,
        trustedNodeModules: fixture.closure,
      }),
    ).toThrow('activation role snapshotter must be outside the candidate repository');
  });

  it('refuses an otherwise provisioned candidate-owned closure', () => {
    const fixture = createFixture();
    const closure = join(fixture.candidate, 'trusted');
    cpSync(fixture.closure, closure, { recursive: true });
    expect(() => readLintActivation({ ...fixture.context, trustedNodeModules: closure })).toThrow(
      'trusted runtime closure must be outside the candidate repository',
    );
  });

  it('retains historical verification while refusing a real legacy writer package for current lint', () => {
    const fixture = createFixture();
    const legacy = prepareActivation({
      ...fixture.prepared.request,
      destination: join(fixture.archive, 'legacy'),
    });
    selectActivation(fixture.archive, legacy.directory, legacy.identity);
    expect(() => readLintActivation(fixture.context)).toThrow(LintActivationRefusal);
  });

  it('propagates unexpected implementation failures instead of relabeling them as activation refusals', () => {
    const fixture = createFixture();
    const fault = new Error('injected trusted verifier failure');
    const spy = spyOn(activationModule, 'readBunActivation').mockImplementation(() => {
      throw fault;
    });
    try {
      try {
        readLintActivation(fixture.context);
      } catch (cause) {
        expect(cause).toBe(fault);
        return;
      }
      throw new Error('unexpected failure was swallowed');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('reviewed activation refusal boundaries', () => {
  it('refuses a trusted closure that contains the candidate workspace', () => {
    const fixture = createFixture();
    const candidate = join(fixture.closure, 'typescript', 'candidate');
    renameSync(fixture.candidate, candidate);
    writeFile(join(candidate, 'typescript.js'), 'candidate-controlled compiler bytes');
    expect(() => readLintActivation({ ...fixture.context, candidateRoot: candidate })).toThrow(
      'trusted runtime closure overlaps the candidate repository',
    );
  });

  it('preserves unexpected failures arising inside artifact hashing', () => {
    const fixture = createFixture();
    const fault = new Error('injected internal artifact hash failure');
    const original = contentManifest.hashBytes;
    const spy = spyOn(contentManifest, 'hashBytes').mockImplementation((bytes) => {
      if ((typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes)) === 'export {};\n')
        throw fault;
      return original(bytes);
    });
    try {
      try {
        readLintActivation(fixture.context);
      } catch (cause) {
        expect(cause).toBe(fault);
        return;
      }
      throw new Error('internal hash failure was swallowed');
    } finally {
      spy.mockRestore();
    }
  });

  it('models a self-consistent package with malformed validator syntax as an activation refusal', () => {
    const fixture = createFixture();
    const directory = fixture.prepared.directory;
    const previous = fixture.prepared.manifest;
    const validator = join(directory, previous.roles.validator);
    overwriteFile(validator, 'export const = ;');
    const validatorIdentity = hashBytes(readFileSync(validator));
    const binding = JSON.stringify({
      policy: { path: 'policy.json', sha256: previous.policyIdentity },
      authority: {
        artifact: {
          path: 'authority.json',
          sha256: hashBytes(readFileSync(join(directory, previous.roles.authority))),
        },
      },
      validator: { artifacts: [{ path: 'validator.mjs', sha256: validatorIdentity }] },
    });
    for (const role of ['ciBinding', 'localBinding'] as const)
      overwriteFile(join(directory, previous.roles[role]), binding);
    const manifest = {
      ...previous,
      validatorIdentity,
      artifacts: previous.artifacts.map((artifact) => ({
        ...artifact,
        identity: hashBytes(readFileSync(join(directory, artifact.path))),
      })),
    };
    const bytes = serializeCanonical(manifest);
    overwriteFile(join(directory, 'manifest.json'), bytes);
    const entries = manifest.artifacts.map((artifact) => ({
      path: artifact.path,
      identity: artifact.identity,
    }));
    for (const path of [
      'active-v1',
      'ci-binding-path',
      'evidence-path',
      'launcher-path',
      'local-binding-path',
      'snapshotter-path',
      'validator-path',
    ])
      entries.push({ path, identity: hashBytes(readFileSync(join(directory, path))) });
    const checksums =
      entries
        .sort((left, right) => (left.path < right.path ? -1 : 1))
        .map((entry) => entry.identity + '  ' + entry.path)
        .join('\n') + '\n';
    overwriteFile(join(directory, 'checksums.sha256'), checksums);
    overwriteFile(
      join(fixture.archive, 'selected.json'),
      JSON.stringify({
        schemaVersion: 1,
        directory: 'v1',
        identity: hashBytes(bytes),
        checksumsIdentity: hashBytes(checksums),
      }),
    );
    expect(() => readLintActivation(fixture.context)).toThrow(LintActivationRefusal);
  });

  for (const field of ['schemaVersion', 'directory', 'identity', 'checksumsIdentity']) {
    it('requires selected descriptor member ' + field, () => {
      const fixture = createFixture();
      const descriptor: Record<string, unknown> = {
        schemaVersion: 1,
        directory: 'v1',
        identity: fixture.prepared.identity,
        checksumsIdentity: hashBytes(
          readFileSync(join(fixture.prepared.directory, 'checksums.sha256')),
        ),
      };
      Reflect.deleteProperty(descriptor, field);
      overwriteFile(join(fixture.archive, 'selected.json'), JSON.stringify(descriptor));
      expect(() => readLintActivation(fixture.context)).toThrow(
        'activation selection is malformed',
      );
    });
  }

  for (const directory of ['', '.', '..', 'v1/../v1', 'v1/./child', 'v1/', 'v1\\child']) {
    it('rejects noncanonical selection directory ' + JSON.stringify(directory), () => {
      const fixture = createFixture();
      overwriteFile(
        join(fixture.archive, 'selected.json'),
        JSON.stringify({
          schemaVersion: 1,
          directory,
          identity: fixture.prepared.identity,
          checksumsIdentity: 'a'.repeat(64),
        }),
      );
      expect(() => readLintActivation(fixture.context)).toThrow(
        'activation selection is malformed',
      );
    });
  }

  it('rejects invalid UTF-8 inside an otherwise valid selected-directory string', () => {
    const fixture = createFixture();
    const bytes = readFileSync(join(fixture.archive, 'selected.json'));
    const position = bytes.toString().indexOf('v1');
    bytes[position] = 0xff;
    chmodSync(join(fixture.archive, 'selected.json'), 0o644);
    writeFileSync(join(fixture.archive, 'selected.json'), bytes);
    expect(() => readLintActivation(fixture.context)).toThrow('activation selection is malformed');
  });
});

describe('unexpected dependency failures retain their identity', () => {
  it('does not wrap an internal manifest read failure as unavailable activation', () => {
    const fixture = createFixture();
    const fault = new Error('injected internal manifest read failure');
    const original = filesystem.readFileSync;
    const target = join(fixture.prepared.directory, 'manifest.json');
    // The fixture forwards the original overloaded fs call unchanged except for this one injected read failure.
    const interceptedRead = ((...args: Parameters<typeof filesystem.readFileSync>) => {
      const [path] = args;
      const options: unknown = args[1];
      if (path === target && options === 'utf8') throw fault;
      return original(...args);
    }) as typeof filesystem.readFileSync;
    const spy = spyOn(filesystem, 'readFileSync').mockImplementation(interceptedRead);
    try {
      try {
        readLintActivation(fixture.context);
      } catch (cause) {
        expect(cause).toBe(fault);
        return;
      }
      throw new Error('internal manifest read failure was swallowed');
    } finally {
      spy.mockRestore();
    }
  });

  it('does not mistake an unrelated scanner AggregateError for malformed reviewed code', () => {
    const fixture = createFixture();
    const fault = new AggregateError(
      [new Error('internal parser dependency failure')],
      'unexpected parser failure',
    );
    const spy = spyOn(Bun.Transpiler.prototype, 'scanImports').mockImplementation(() => {
      throw fault;
    });
    try {
      try {
        readLintActivation(fixture.context);
      } catch (cause) {
        expect(cause).toBe(fault);
        return;
      }
      throw new Error('unexpected aggregate failure was swallowed');
    } finally {
      spy.mockRestore();
    }
  });

  it('does not normalize a trusted selection-schema implementation failure', () => {
    const fixture = createFixture();
    const fault = new Error('injected selection-schema implementation failure');
    const spy = spyOn(validation, 'parseSecretsOrThrow').mockImplementation(() => {
      throw fault;
    });
    try {
      try {
        readLintActivation(fixture.context);
      } catch (cause) {
        expect(cause).toBe(fault);
        return;
      }
      throw new Error('selection implementation failure was swallowed');
    } finally {
      spy.mockRestore();
    }
  });
});

for (const phase of ['schema', 'JSON'] as const) {
  it('preserves an internal TypeError from the selection ' + phase + ' phase', () => {
    const fixture = createFixture();
    const fault = new TypeError('injected internal selection ' + phase + ' TypeError');
    const spy =
      phase === 'schema'
        ? spyOn(validation, 'parseSecretsOrThrow').mockImplementation(() => {
            throw fault;
          })
        : spyOn(JSON, 'parse').mockImplementation(() => {
            throw fault;
          });
    try {
      try {
        readLintActivation(fixture.context);
      } catch (cause) {
        expect(cause).toBe(fault);
        return;
      }
      throw new Error('selection TypeError was swallowed');
    } finally {
      spy.mockRestore();
    }
  });
}

it('models a NUL in the selected directory as malformed authority', () => {
  const fixture = createFixture();
  const path = join(fixture.archive, 'selected.json');
  const selected: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof selected !== 'object' || selected === null)
    throw new Error('fixture selection malformed');
  overwriteFile(path, JSON.stringify({ ...selected, directory: 'bad\0directory' }));
  expect(() => readLintActivation(fixture.context)).toThrow(LintActivationRefusal);
});

for (const role of ['selected.json', 'trusted-node-modules/typescript/package.json']) {
  it('refuses unreadable configured authority ' + role + ' without optional absence', () => {
    const fixture = createFixture();
    const path = join(fixture.archive, role);
    chmodSync(path, 0o000);
    try {
      expect(() => readLintActivation(fixture.context)).toThrow(LintActivationRefusal);
    } finally {
      chmodSync(path, 0o644);
    }
  });
}
for (const code of [
  'ENOENT',
  'EACCES',
  'EPERM',
  'EISDIR',
  'ENOTDIR',
  'ELOOP',
  'EEXIST',
  'ENAMETOOLONG',
]) {
  it('models the configured read boundary filesystem failure ' + code, () => {
    const fixture = createFixture();
    const fault = Object.assign(new Error('injected path/access failure'), { code });
    const read = spyOn(filesystem, 'readFileSync').mockImplementation(() => {
      throw fault;
    });
    try {
      expect(() => readLintActivation(fixture.context)).toThrow(LintActivationRefusal);
    } finally {
      read.mockRestore();
    }
  });
}
for (const fault of [
  Object.assign(new Error('host resource failure'), { code: 'ENOMEM' }),
  { code: 'EACCES' },
  Object.assign(new Error('nonstring internal code'), { code: 42 }),
]) {
  it('preserves an unmodeled filesystem dependency failure ' + JSON.stringify(fault), () => {
    const fixture = createFixture();
    const read = spyOn(filesystem, 'readFileSync').mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- The native boundary is deliberately broken to throw a non-Error value.
      throw fault;
    });
    try {
      try {
        readLintActivation(fixture.context);
      } catch (cause) {
        expect(cause).toBe(fault);
        return;
      }
      throw new Error('unmodeled dependency failure was swallowed');
    } finally {
      read.mockRestore();
    }
  });
}

it('refuses a FIFO authority file before attempting to read its bytes', () => {
  const fixture = createFixture();
  const pipe = join(fixture.archive, 'selected.json');
  rmSync(pipe);
  const created = Bun.spawnSync(['mkfifo', pipe], { stdout: 'pipe', stderr: 'pipe' });
  expect(created.exitCode, created.stderr.toString()).toBe(0);
  const probe =
    'const {readLintActivation,LintActivationRefusal}=await import(' +
    JSON.stringify(join(import.meta.dir, 'lint-activation.ts')) +
    '); try{readLintActivation(' +
    JSON.stringify(fixture.context) +
    ')}catch(cause){if(!(cause instanceof LintActivationRefusal))throw cause;process.stderr.write(cause.message);process.exit(78)}throw new Error("FIFO authority admitted");';
  const child = Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', probe],
    { stdout: 'pipe', stderr: 'pipe', timeout: 2000 },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(78);
  expect(child.stderr.toString()).toContain('is not a regular file');
});

const buildMessage = Object.assign(new Error('fixture Bun source diagnostic'), {
  name: 'BuildMessage',
  level: 'error',
});
const nonarray = new AggregateError([], 'nonarray internal aggregate');
Object.defineProperty(nonarray, 'errors', { value: null });
for (const [name, fault] of [
  [
    'non-aggregate wrapper',
    Object.assign(new Error('unrelated wrapped errors'), { errors: [buildMessage] }),
  ],
  ['nonarray errors', nonarray],
  ['empty errors', new AggregateError([], 'empty internal aggregate')],
  [
    'non-error entry',
    new AggregateError([{ name: 'BuildMessage', level: 'error' }], 'plain internal entry'),
  ],
  [
    'wrong diagnostic name',
    new AggregateError(
      [Object.assign(new Error('other diagnostic'), { name: 'InternalMessage', level: 'error' })],
      'unrelated named diagnostic',
    ),
  ],
  [
    'missing diagnostic level',
    new AggregateError(
      [Object.assign(new Error('no level diagnostic'), { name: 'BuildMessage' })],
      'incomplete diagnostic',
    ),
  ],
  [
    'warning diagnostic',
    new AggregateError(
      [Object.assign(new Error('warning diagnostic'), { name: 'BuildMessage', level: 'warning' })],
      'unexpected warning',
    ),
  ],
] as const) {
  it('preserves an unmodeled scanner ' + name, () => {
    const fixture = createFixture();
    const scan = spyOn(Bun.Transpiler.prototype, 'scanImports').mockImplementation(() => {
      throw fault;
    });
    try {
      try {
        readLintActivation(fixture.context);
      } catch (cause) {
        expect(cause).toBe(fault);
        return;
      }
      throw new Error('unmodeled scanner failure was normalized');
    } finally {
      scan.mockRestore();
    }
  });
}
it('does not interpret inaccessible configured ancestors as optional absence', () => {
  const fixture = createFixture();
  const denied = join(fixture.archive, 'denied');
  mkdirSync(denied);
  chmodSync(denied, 0o000);
  try {
    expect(() =>
      readLintActivation({ ...fixture.context, activationRoot: join(denied, 'unseen') }),
    ).toThrow(LintActivationRefusal);
  } finally {
    chmodSync(denied, 0o755);
  }
});

it('preserves an internal manifest JSON TypeError', () => {
  const fixture = createFixture();
  const manifest = readFileSync(join(fixture.prepared.directory, 'manifest.json'), 'utf8');
  const fault = new TypeError('injected manifest JSON implementation failure');
  const parse = JSON.parse.bind(JSON);
  const json = spyOn(JSON, 'parse').mockImplementation((text, reviver) => {
    if (text === manifest) throw fault;
    const input: unknown = parse(text, reviver);
    return input;
  });
  try {
    try {
      readLintActivation(fixture.context);
    } catch (cause) {
      expect(cause).toBe(fault);
      return;
    }
    throw new Error('manifest JSON implementation fault was normalized');
  } finally {
    json.mockRestore();
  }
});

it('preserves an internal binding JSON TypeError', () => {
  const fixture = createFixture();
  const binding = readFileSync(
    join(fixture.prepared.directory, fixture.prepared.manifest.roles.ciBinding),
    'utf8',
  );
  const fault = new TypeError('injected binding JSON implementation failure');
  const parse = JSON.parse.bind(JSON);
  const json = spyOn(JSON, 'parse').mockImplementation((text, reviver) => {
    if (text === binding) throw fault;
    const input: unknown = parse(text, reviver);
    return input;
  });
  try {
    try {
      readLintActivation(fixture.context);
    } catch (cause) {
      expect(cause).toBe(fault);
      return;
    }
    throw new Error('binding JSON implementation fault was normalized');
  } finally {
    json.mockRestore();
  }
});
it('preserves an unexpected current activation role-source resolution failure', () => {
  const fixture = createFixture();
  const fault = new Error('injected source realpath implementation failure');
  const original = filesystem.realpathSync;
  // The fixture forwards the original overloaded native boundary except for its one owned role path.
  const intercepted = ((...args: Parameters<typeof filesystem.realpathSync>) => {
    if (args[0] === fixture.prepared.request.roleSources.launcher) throw fault;
    return original(...args);
  }) as typeof filesystem.realpathSync;
  const read = spyOn(filesystem, 'realpathSync').mockImplementation(intercepted);
  try {
    try {
      prepareBunActivation({
        ...fixture.prepared.request,
        destination: join(fixture.archive, 'fresh-source-fault'),
      });
    } catch (cause) {
      expect(cause).toBe(fault);
      return;
    }
    throw new Error('activation source failure was normalized');
  } finally {
    read.mockRestore();
  }
});
it('preserves an unexpected current activation package-copy failure', () => {
  const fixture = createFixture();
  const fault = new Error('injected package copy implementation failure');
  const copy = spyOn(filesystem, 'copyFileSync').mockImplementation(() => {
    throw fault;
  });
  try {
    try {
      prepareBunActivation({
        ...fixture.prepared.request,
        destination: join(fixture.archive, 'fresh-copy-fault'),
      });
    } catch (cause) {
      expect(cause).toBe(fault);
      return;
    }
    throw new Error('activation package copy failure was normalized');
  } finally {
    copy.mockRestore();
  }
});
