import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ValidationError } from '@shared/validation';
import { afterEach, describe, expect, it } from 'bun:test';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import { readBunToolkit, readToolkit, verifyToolkit } from './toolkit';
import { hashTrustedModules } from './trusted-modules';

const roots: string[] = [];
const commonRoles = [
  'snapshotter.ts',
  'validator.mjs',
  'prepare-activation.mjs',
  'prepare-relocation-activation.mjs',
];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function createFixture(schemaVersion: 1 | 2, bunVersion = Bun.version) {
  const directory = mkdtempSync(join(tmpdir(), 'puni-toolkit-version-'));
  roots.push(directory);
  const closure = join(directory, 'trusted-node-modules');
  mkdirSync(closure);
  writeFileSync(join(closure, 'declaration.d.ts'), 'export {};\n');
  const names = [schemaVersion === 1 ? 'launcher.sh' : 'launcher.mjs', ...commonRoles];
  const roles: Record<string, string> = {};
  for (const name of names) {
    const bytes = new TextEncoder().encode('reviewed role ' + name + '\n');
    writeFileSync(join(directory, name), bytes);
    roles[name] = hashBytes(bytes);
  }
  const descriptor = {
    schemaVersion,
    tag: 'puni-v1.0.0',
    sourceRevision: 'a'.repeat(40),
    bunVersion,
    roles,
    trustedNodeModules: ['reviewed-package'],
    trustedNodeModulesIdentity: hashTrustedModules(closure),
  };
  const path = join(directory, 'toolkit.json');
  const writeDescriptor = () => {
    writeFileSync(path, serializeCanonical(descriptor));
  };
  writeDescriptor();
  return { directory, closure, descriptor, path, writeDescriptor };
}

describe('versioned toolkit verification and Bun execution compatibility', () => {
  it('verifies original historical bytes and hash under a different current runtime', () => {
    const fixture = createFixture(1, '0.0.1-historical');
    const bytes = readFileSync(fixture.path);
    const verified = verifyToolkit(fixture.directory);
    expect(verified.schemaVersion).toBe(1);
    if (verified.schemaVersion !== 1)
      throw new Error('fixture did not verify as historical toolkit');
    expect(verified.bunVersion).toBe('0.0.1-historical');
    expect(verified.digest).toBe(hashBytes(bytes));
    expect(readFileSync(fixture.path)).toEqual(bytes);
    expect(verified.roleBytes['launcher.sh']).toEqual(
      readFileSync(join(fixture.directory, 'launcher.sh')),
    );
  });

  it('refuses historical execution format before considering runtime compatibility', () => {
    const fixture = createFixture(1, '0.0.1-historical');
    expect(() => readBunToolkit(fixture.directory)).toThrow(
      'Bun execution requires toolkit schema 2',
    );
  });

  it('refuses historical execution format even with the exact current Bun', () => {
    const fixture = createFixture(1);
    expect(() => readBunToolkit(fixture.directory)).toThrow(
      'Bun execution requires toolkit schema 2',
    );
  });

  it('reads a current Bun toolkit with its original identity and exact runtime', () => {
    const fixture = createFixture(2);
    const verified = readBunToolkit(fixture.directory);
    expect(verified.schemaVersion).toBe(2);
    expect(verified.bunVersion).toBe(Bun.version);
    expect(verified.digest).toBe(hashBytes(readFileSync(fixture.path)));
    expect(Object.keys(verified.roleBytes).sort()).toEqual(
      Object.keys(fixture.descriptor.roles).sort(),
    );
  });

  it('verifies current bytes independently from refusing incompatible execution runtime', () => {
    const fixture = createFixture(2, '0.0.1-incompatible');
    expect(verifyToolkit(fixture.directory).schemaVersion).toBe(2);
    expect(() => readBunToolkit(fixture.directory)).toThrow('toolkit was built with another Bun');
  });

  for (const version of [1, 2] as const) {
    for (const role of [version === 1 ? 'launcher.sh' : 'launcher.mjs', ...commonRoles]) {
      it('refuses missing descriptor role ' + String(version) + ':' + role, () => {
        const fixture = createFixture(version);
        Reflect.deleteProperty(fixture.descriptor.roles, role);
        fixture.writeDescriptor();
        expect(() => verifyToolkit(fixture.directory)).toThrow(ValidationError);
      });
      it('refuses changed role bytes ' + String(version) + ':' + role, () => {
        const fixture = createFixture(version);
        writeFileSync(join(fixture.directory, role), 'substituted');
        expect(() => verifyToolkit(fixture.directory)).toThrow(
          'toolkit role differs from toolkit.json: ' + role,
        );
      });
      it('refuses unreadable role ' + String(version) + ':' + role, () => {
        const fixture = createFixture(version);
        rmSync(join(fixture.directory, role));
        expect(() => verifyToolkit(fixture.directory)).toThrow(
          'toolkit role is unreadable: ' + role,
        );
      });
    }

    it('refuses an extra descriptor role for schema ' + String(version), () => {
      const fixture = createFixture(version);
      fixture.descriptor.roles['unexpected.mjs'] = 'b'.repeat(64);
      fixture.writeDescriptor();
      expect(() => verifyToolkit(fixture.directory)).toThrow(ValidationError);
    });
    it('refuses a mixed launcher layout for schema ' + String(version), () => {
      const fixture = createFixture(version);
      const old = version === 1 ? 'launcher.sh' : 'launcher.mjs';
      const mixed = version === 1 ? 'launcher.mjs' : 'launcher.sh';
      fixture.descriptor.roles[mixed] = hashBytes(readFileSync(join(fixture.directory, old)));
      Reflect.deleteProperty(fixture.descriptor.roles, old);
      fixture.writeDescriptor();
      expect(() => verifyToolkit(fixture.directory)).toThrow(ValidationError);
    });
    it('refuses a changed closure for schema ' + String(version), () => {
      const fixture = createFixture(version);
      writeFileSync(join(fixture.closure, 'declaration.d.ts'), 'changed');
      expect(() => verifyToolkit(fixture.directory)).toThrow(
        'toolkit runtime closure differs from toolkit.json',
      );
    });
  }

  for (const field of [
    'schemaVersion',
    'tag',
    'sourceRevision',
    'bunVersion',
    'roles',
    'trustedNodeModules',
    'trustedNodeModulesIdentity',
  ]) {
    it('requires descriptor field ' + field, () => {
      const fixture = createFixture(2);
      const descriptor: Record<string, unknown> = { ...fixture.descriptor };
      Reflect.deleteProperty(descriptor, field);
      writeFileSync(fixture.path, serializeCanonical(descriptor));
      expect(() => verifyToolkit(fixture.directory)).toThrow(ValidationError);
    });
  }

  for (const version of [1, 2] as const) {
    it('refuses an unsupported schema version with layout ' + String(version), () => {
      const fixture = createFixture(version);
      writeFileSync(
        fixture.path,
        serializeCanonical({ ...fixture.descriptor, schemaVersion: 999 }),
      );
      expect(() => verifyToolkit(fixture.directory)).toThrow(ValidationError);
    });
    it('refuses an unknown descriptor field with layout ' + String(version), () => {
      const fixture = createFixture(version);
      writeFileSync(
        fixture.path,
        serializeCanonical({ ...fixture.descriptor, extra: 'unreviewed' }),
      );
      expect(() => verifyToolkit(fixture.directory)).toThrow(ValidationError);
    });
  }
  it('refuses malformed JSON and invalid UTF-8 without replacing descriptor bytes', () => {
    const fixture = createFixture(2);
    writeFileSync(fixture.path, '{');
    expect(() => verifyToolkit(fixture.directory)).toThrow(SyntaxError);
    const bytes = new TextEncoder().encode(serializeCanonical(fixture.descriptor));
    const tag = new TextDecoder().decode(bytes).indexOf('puni-v1.0.0');
    bytes[tag] = 0xff;
    writeFileSync(fixture.path, bytes);
    expect(() => verifyToolkit(fixture.directory)).toThrow(TypeError);
  });
});

describe('toolkit descriptor field constraints', () => {
  for (const [field, value] of [
    ['tag', ''],
    ['bunVersion', ''],
    ['sourceRevision', 'not-a-sha'],
    ['trustedNodeModules', 'not-an-array'],
    ['trustedNodeModules', [42]],
    ['trustedNodeModulesIdentity', 'not-a-digest'],
    ['roles', []],
  ] as const) {
    it('refuses invalid ' + field + ': ' + JSON.stringify(value), () => {
      const fixture = createFixture(2);
      writeFileSync(fixture.path, serializeCanonical({ ...fixture.descriptor, [field]: value }));
      expect(() => verifyToolkit(fixture.directory)).toThrow(ValidationError);
    });
  }

  it('refuses an invalid role digest', () => {
    const fixture = createFixture(2);
    fixture.descriptor.roles['validator.mjs'] = 'not-a-digest';
    fixture.writeDescriptor();
    expect(() => verifyToolkit(fixture.directory)).toThrow(ValidationError);
  });

  it('retains original noncanonical historical descriptor bytes and identity', () => {
    const fixture = createFixture(1, '0.0.1-historical');
    const bytes = Buffer.from(JSON.stringify(fixture.descriptor, null, 2) + '\n');
    writeFileSync(fixture.path, bytes);
    expect(verifyToolkit(fixture.directory).digest).toBe(hashBytes(bytes));
    expect(readFileSync(fixture.path)).toEqual(bytes);
  });

  it('keeps the transitional legacy reader pinned and separated from current Bun execution', () => {
    const legacy = createFixture(1);
    expect(readToolkit(legacy.directory).schemaVersion).toBe(1);
    legacy.descriptor.bunVersion = '0.0.1-incompatible';
    legacy.writeDescriptor();
    expect(() => readToolkit(legacy.directory)).toThrow('toolkit was built with another Bun');
    const current = createFixture(2);
    expect(() => readToolkit(current.directory)).toThrow(
      'legacy execution requires toolkit schema 1',
    );
  });
});

describe('toolkit trusted-state readability', () => {
  it('refuses an absent descriptor before reading roles', () => {
    const fixture = createFixture(2);
    rmSync(fixture.path);
    expect(() => verifyToolkit(fixture.directory)).toThrow(/ENOENT/);
  });
  it('refuses a directory in place of a descriptor', () => {
    const fixture = createFixture(2);
    rmSync(fixture.path);
    mkdirSync(fixture.path);
    expect(() => verifyToolkit(fixture.directory)).toThrow(/EISDIR/);
  });
});

describe('supported historical toolkit profile', () => {
  for (const profile of ['earliest-four-role-unbound', 'five-role-unbound'] as const) {
    it('keeps already unsupported ' + profile + ' bytes unchanged on refusal', () => {
      const fixture = createFixture(1, '0.0.1-historical');
      const descriptor: Record<string, unknown> = { ...fixture.descriptor };
      Reflect.deleteProperty(descriptor, 'trustedNodeModulesIdentity');
      if (profile === 'earliest-four-role-unbound') {
        Reflect.deleteProperty(fixture.descriptor.roles, 'prepare-relocation-activation.mjs');
        rmSync(join(fixture.directory, 'prepare-relocation-activation.mjs'));
      }
      const bytes = Buffer.from(serializeCanonical(descriptor));
      writeFileSync(fixture.path, bytes);
      expect(() => verifyToolkit(fixture.directory)).toThrow(ValidationError);
      expect(readFileSync(fixture.path)).toEqual(bytes);
    });
  }
});
