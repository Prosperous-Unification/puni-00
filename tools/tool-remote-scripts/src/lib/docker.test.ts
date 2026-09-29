import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderTemplate, tierComposeTmpl } from '@tools/compose';
import { scratchSync } from '@tools/test-scratch';
import { Database } from 'bun:sqlite';
import { describe, expect, it } from 'bun:test';

import {
  assertDigestPinnedRef,
  assertOidcEnvAllowed,
  assertTierEnvAllowed,
  assertTierEnvComplete,
  composeUpArgs,
  containerName,
  deriveTierSecrets,
  envKeysOf,
  envLayout,
  grantAliasCommands,
  holdKindsCommand,
  isDigest,
  manifestInspectArgs,
  migrateCommand,
  migrateDownCommand,
  migrateStatusCommand,
  NETWORK,
  psColorsFrom,
  relationshipTypesCommand,
  revokeAliasCommands,
  ROOT,
  SHARED_ENV_PATH,
  SOLVER_SUPERVISOR_CONTAINER_DIRECTORY,
  SOLVER_SUPERVISOR_HOST_DIRECTORY,
  storedHoldsCommand,
  storedRelationshipTypesCommand,
  tierComposeContext,
  tierComposeFile,
  tierEnvFiles,
  tierHasSecrets,
  tierSecretsFile,
} from './docker';

const DIGEST = 'sha256:' + 'a'.repeat(64);

describe('relationship type commands', () => {
  it('executes the present reader CLI', async () => {
    const directory = scratchSync('wbs-reader-present-');
    try {
      mkdirSync(join(directory, 'src'));
      writeFileSync(
        join(directory, 'src/relationship-types-cli.ts'),
        'console.log(JSON.stringify(["FS", "FF"]));\n',
      );
      const command = relationshipTypesCommand('be-01-green');
      const probe = Bun.spawn(command.slice(2), { cwd: directory, stdout: 'pipe' });
      expect(await probe.exited).toBe(0);
      expect(JSON.parse(await new Response(probe.stdout).text())).toEqual(['FS', 'FF']);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('treats an absent reader CLI as exactly FS', async () => {
    const directory = scratchSync('wbs-reader-types-');
    try {
      mkdirSync(join(directory, 'src'));
      const command = relationshipTypesCommand('be-01-green');
      expect(command.slice(0, 4)).toEqual(['exec', 'be-01-green', 'sh', '-c']);
      const probe = Bun.spawn(command.slice(2), { cwd: directory, stdout: 'pipe' });
      expect(await probe.exited).toBe(0);
      expect(JSON.parse(await new Response(probe.stdout).text())).toEqual(['FS']);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not treat a missing source directory as an older release', async () => {
    const directory = scratchSync('wbs-reader-unavailable-');
    try {
      const command = relationshipTypesCommand('be-01-green');
      const probe = Bun.spawn(command.slice(2), { cwd: directory });
      expect(await probe.exited).toBe(74);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a nonregular reader CLI path', async () => {
    const directory = scratchSync('wbs-reader-nonregular-');
    try {
      mkdirSync(join(directory, 'src/relationship-types-cli.ts'), { recursive: true });
      const probe = Bun.spawn(relationshipTypesCommand('be-01-green').slice(2), {
        cwd: directory,
      });
      expect(await probe.exited).toBe(73);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects an unreadable source directory', async () => {
    const directory = scratchSync('wbs-reader-unreadable-');
    const source = join(directory, 'src');
    try {
      mkdirSync(source);
      chmodSync(source, 0o000);
      const probe = Bun.spawn(relationshipTypesCommand('be-01-green').slice(2), {
        cwd: directory,
      });
      expect(await probe.exited).toBe(74);
    } finally {
      chmodSync(source, 0o700);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('reads stored types from SQLite and treats an absent table as empty', async () => {
    const directory = scratchSync('wbs-stored-types-');
    try {
      const path = join(directory, 'wbs.db');
      const db = new Database(path);
      const command = storedRelationshipTypesCommand('be-01-green');
      expect(command.slice(0, 4)).toEqual(['exec', 'be-01-green', 'bun', '-e']);
      const readTypes = async () => {
        const probe = Bun.spawn(command.slice(2), {
          env: { ...process.env, DB_PATH: path },
          stdout: 'pipe',
          stderr: 'pipe',
        });
        const output = await new Response(probe.stdout).text();
        expect(await probe.exited).toBe(0);
        const parsed: unknown = JSON.parse(output);
        return parsed;
      };
      expect(await readTypes()).toEqual([]);
      db.run('CREATE TABLE typed_dependency (type text NOT NULL)');
      db.run("INSERT INTO typed_dependency (type) VALUES ('FF'), ('FF'), ('FS')");
      expect(await readTypes()).toEqual([
        { type: 'FF', count: 2 },
        { type: 'FS', count: 1 },
      ]);
      db.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a missing database file', async () => {
    const directory = scratchSync('wbs-stored-missing-');
    try {
      const probe = Bun.spawn(storedRelationshipTypesCommand('be-01-green').slice(2), {
        env: { ...process.env, DB_PATH: join(directory, 'missing.db') },
        stderr: 'pipe',
      });
      expect(await probe.exited).not.toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects an unset DB_PATH', async () => {
    const { DB_PATH: _dbPath, ...environment } = process.env;
    const probe = Bun.spawn(storedRelationshipTypesCommand('be-01-green').slice(2), {
      env: environment,
      stderr: 'pipe',
    });
    expect(await probe.exited).not.toBe(0);
  });
});

describe('hold kind commands', () => {
  it('executes the present hold kinds CLI', async () => {
    const directory = scratchSync('wbs-holds-present-');
    try {
      mkdirSync(join(directory, 'src'));
      writeFileSync(
        join(directory, 'src/hold-kinds-cli.ts'),
        'console.log(JSON.stringify(["on_hold", "blocked"]));\n',
      );
      const command = holdKindsCommand('be-01-green');
      expect(command.slice(0, 4)).toEqual(['exec', 'be-01-green', 'sh', '-c']);
      const probe = Bun.spawn(command.slice(2), { cwd: directory, stdout: 'pipe' });
      expect(await probe.exited).toBe(0);
      expect(JSON.parse(await new Response(probe.stdout).text())).toEqual(['on_hold', 'blocked']);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('treats an absent hold kinds CLI as reading no holds', async () => {
    const directory = scratchSync('wbs-holds-absent-');
    try {
      mkdirSync(join(directory, 'src'));
      const probe = Bun.spawn(holdKindsCommand('be-01-green').slice(2), {
        cwd: directory,
        stdout: 'pipe',
      });
      expect(await probe.exited).toBe(0);
      expect(JSON.parse(await new Response(probe.stdout).text())).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not treat a missing source directory as an older release', async () => {
    const directory = scratchSync('wbs-holds-unavailable-');
    try {
      const probe = Bun.spawn(holdKindsCommand('be-01-green').slice(2), { cwd: directory });
      expect(await probe.exited).toBe(74);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a nonregular hold kinds CLI path', async () => {
    const directory = scratchSync('wbs-holds-nonregular-');
    try {
      mkdirSync(join(directory, 'src/hold-kinds-cli.ts'), { recursive: true });
      const probe = Bun.spawn(holdKindsCommand('be-01-green').slice(2), { cwd: directory });
      expect(await probe.exited).toBe(73);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('reads stored holds from SQLite, empty before the table or the column exists', async () => {
    const directory = scratchSync('wbs-stored-holds-');
    try {
      const path = join(directory, 'wbs.db');
      const db = new Database(path);
      const command = storedHoldsCommand('be-01-green');
      expect(command.slice(0, 4)).toEqual(['exec', 'be-01-green', 'bun', '-e']);
      const readHolds = async () => {
        const probe = Bun.spawn(command.slice(2), {
          env: { ...process.env, DB_PATH: path },
          stdout: 'pipe',
          stderr: 'pipe',
        });
        const output = await new Response(probe.stdout).text();
        expect(await probe.exited).toBe(0);
        const parsed: unknown = JSON.parse(output);
        return parsed;
      };
      expect(await readHolds()).toEqual([]);
      db.run('CREATE TABLE work_item (id text PRIMARY KEY)');
      expect(await readHolds()).toEqual([]);
      db.run('ALTER TABLE work_item ADD hold text');
      db.run(
        "INSERT INTO work_item (id, hold) VALUES ('a', 'on_hold'), ('b', 'on_hold'), ('c', 'blocked'), ('d', NULL)",
      );
      expect(await readHolds()).toEqual([
        { kind: 'blocked', count: 1 },
        { kind: 'on_hold', count: 2 },
      ]);
      db.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a missing database file and an unset DB_PATH', async () => {
    const directory = scratchSync('wbs-stored-holds-missing-');
    try {
      const missing = Bun.spawn(storedHoldsCommand('be-01-green').slice(2), {
        env: { ...process.env, DB_PATH: join(directory, 'missing.db') },
        stderr: 'pipe',
      });
      expect(await missing.exited).not.toBe(0);
      const { DB_PATH: _dbPath, ...environment } = process.env;
      const unset = Bun.spawn(storedHoldsCommand('be-01-green').slice(2), {
        env: environment,
        stderr: 'pipe',
      });
      expect(await unset.exited).not.toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

/**
 * The prod layout is not "whatever envLayout returns for prod" — it is the set
 * of literals that were hardcoded in this module before `WBS_ENV` existed. A
 * deploy to prod must be byte-identical after the parameterisation, so these
 * are written out longhand rather than derived: a test that asks the code what
 * it thinks prod is would pass no matter what the code broke.
 */
describe('envLayout', () => {
  it('defaults to prod when WBS_ENV is unset', () => {
    expect(envLayout(undefined)).toEqual({
      env: 'prod',
      root: '/home/puni1/wbs',
      network: 'wbs-net',
      containerPrefix: '',
      sharedEnvPath: '/home/puni1/wbs/.env',
      oidcEnvPath: '/home/puni1/wbs/oidc.env',
      stateDir: '/home/puni1/wbs/state',
      siteCaddyPath: '/home/puni1/wbs/caddy/site.caddy',
      siteAddress: 'wbs.bulletpoints.club',
    });
  });

  it('treats an empty WBS_ENV as unset', () => {
    expect(envLayout('')).toEqual(envLayout(undefined));
  });

  it('gives prod the values that were hardcoded before WBS_ENV existed', () => {
    expect(envLayout('prod')).toEqual(envLayout(undefined));
    expect(ROOT).toBe('/home/puni1/wbs');
    expect(NETWORK).toBe('wbs-net');
    expect(SHARED_ENV_PATH).toBe('/home/puni1/wbs/.env');
    expect(containerName('be', 'blue')).toBe('be-01-blue');
  });

  it('gives dev a layout disjoint from prod, except the mounted caddy dir', () => {
    expect(envLayout('dev')).toEqual({
      env: 'dev',
      root: '/home/puni1/wbs-dev',
      network: 'wbs-dev-net',
      containerPrefix: 'dev-',
      sharedEnvPath: '/home/puni1/wbs-dev/.env',
      oidcEnvPath: '/home/puni1/wbs-dev/oidc-dev.env',
      stateDir: '/home/puni1/wbs-dev/state',
      // Deliberately under prod's root: that caddy directory is the one the
      // single edge container mounts, so dev's site file has to live there.
      siteCaddyPath: '/home/puni1/wbs/caddy/site-dev.caddy',
      siteAddress: 'dev.wbs.bulletpoints.club',
    });
  });

  it('gives the two environments different public addresses', () => {
    expect(envLayout('dev').siteAddress).not.toBe(envLayout('prod').siteAddress);
  });

  it('shares no path or name between the two environments except the caddy dir', () => {
    const prod = envLayout('prod');
    const dev = envLayout('dev');
    expect(dev.root).not.toBe(prod.root);
    expect(dev.network).not.toBe(prod.network);
    expect(dev.sharedEnvPath).not.toBe(prod.sharedEnvPath);
    expect(dev.stateDir).not.toBe(prod.stateDir);
    expect(dev.siteCaddyPath).not.toBe(prod.siteCaddyPath);
  });

  /**
   * R5: unknown is not OK. An unrecognised WBS_ENV must not fall through to
   * prod (which would deploy a dev commit onto the live site) and must not
   * resolve to nothing.
   *
   * Proof: with the `hasOwnProperty` guard and its `throw` deleted from
   * `envLayout`, both tests below fail — `envLayout('staging')` returns
   * `undefined` rather than throwing. Worse, and the reason the guard sits at
   * resolve time rather than at use time: importing the module at all under
   * `WBS_ENV=staging` then dies with `TypeError: undefined is not an object
   * (evaluating 'CURRENT_ENV.network')` at docker.ts:80 — a stack trace with
   * no mention of the environment name that caused it. Both observed, guard
   * removed, on 2026-08-04.
   */
  it('refuses an environment it does not know', () => {
    expect(() => envLayout('staging')).toThrow(/staging/);
  });

  it('refuses an unknown environment by name, not by falling back to prod', () => {
    let layout: unknown;
    try {
      layout = envLayout('staging');
    } catch {
      layout = 'threw';
    }
    expect(layout).toBe('threw');
  });
});

describe('isDigest', () => {
  it('accepts a well-formed sha256 digest', () => {
    expect(isDigest('sha256:' + 'a'.repeat(64))).toBe(true);
  });

  it('rejects tags, short hashes, and empty strings', () => {
    expect(isDigest('abc1234')).toBe(false);
    expect(isDigest('sha256:tooshort')).toBe(false);
    expect(isDigest('')).toBe(false);
  });
});

describe('containerName', () => {
  it('names containers <tier>-<color>', () => {
    expect(containerName('be', 'green')).toBe('be-01-green');
    expect(containerName('gw', 'blue')).toBe('gw-01-blue');
    expect(containerName('fe', 'blue')).toBe('fe-01-blue');
  });
});

describe('assertDigestPinnedRef', () => {
  it('passes a well-formed digest-pinned ref straight through, address and all', () => {
    const ref = `registry.infra.bulletpoints.club/wbs-be-01@${DIGEST}`;
    expect(assertDigestPinnedRef(ref, 'be')).toBe(ref);
  });

  it('accepts a registry address carrying a port', () => {
    const ref = `127.0.0.1:5000/wbs-gw-01@${DIGEST}`;
    expect(assertDigestPinnedRef(ref, 'gw')).toBe(ref);
  });

  // Design decision 4: a rebuild on another host can move a tag, never a digest.
  it('rejects a tagged ref rather than deploying something movable', () => {
    expect(() => assertDigestPinnedRef('r.example.com/wbs-be-01:abc1234', 'be')).toThrow(
      /digest-pinned/,
    );
  });

  it('rejects a bare digest with no registry address', () => {
    expect(() => assertDigestPinnedRef(DIGEST, 'be')).toThrow(/digest-pinned/);
  });

  it('rejects a malformed digest', () => {
    expect(() => assertDigestPinnedRef('r.example.com/wbs-be-01@sha256:short', 'be')).toThrow(
      /digest-pinned/,
    );
  });

  it('rejects an empty ref, naming what was missing', () => {
    expect(() => assertDigestPinnedRef('', 'be')).toThrow(/missing/);
  });

  // The one mistake carrying the whole ref across the wire newly makes
  // possible: handing a tier some other tier's image.
  it("rejects another tier's image", () => {
    expect(() => assertDigestPinnedRef(`r.example.com/wbs-gw-01@${DIGEST}`, 'be')).toThrow(
      /tier "be" deploys "wbs-be-01"/,
    );
  });
});

describe('manifestInspectArgs', () => {
  it('checks the registry without downloading layers', () => {
    const ref = `registry.infra.bulletpoints.club/wbs-be-01@${DIGEST}`;
    expect(manifestInspectArgs(ref)).toEqual(['manifest', 'inspect', ref]);
  });
});

describe('tierComposeFile', () => {
  it('places the rendered per-colour compose file under ROOT/compose', () => {
    expect(tierComposeFile('be', 'green')).toBe(`${ROOT}/compose/be-01-green.yml`);
  });
});

describe('tierComposeContext', () => {
  it('uses the app name (be-01), not the short tier code, so the container name and the', () => {
    // existing per-app env file (/srv/wbs/be-01.env, per deploy.sh) line up.
    const ctx = tierComposeContext(
      'be',
      'green',
      `registry.infra.bulletpoints.club/wbs-be-01@${DIGEST}`,
    );
    expect(ctx['CONTAINER']).toBe('be-01-green');
    expect(ctx['NETWORK']).toBe('wbs-net');
  });

  // The C1 regression: this file used to rebuild the ref from its own
  // REGISTRY default, so the address the image was actually published to
  // never reached the pull.
  it('renders the image ref it was given, without reconstructing the address', () => {
    const ref = `some-other-registry.example.com:5000/wbs-fe-01@${DIGEST}`;
    expect(tierComposeContext('fe', 'blue', ref)['IMAGE']).toBe(ref);
  });

  it('refuses a ref that is not digest-pinned', () => {
    expect(() => tierComposeContext('be', 'blue', 'r.example.com/wbs-be-01:abc')).toThrow(
      /digest-pinned/,
    );
  });

  // Finding I7 (secrets over-distribution): fe-01 is a static Caddy server
  // and must get neither a secrets env_file nor a data mount at all — not
  // even an empty one.
  it('gives fe-01 only its own app-config env file, no secrets file and no volumes', () => {
    const ctx = tierComposeContext(
      'fe',
      'blue',
      `registry.infra.bulletpoints.club/wbs-fe-01@${DIGEST}`,
    );
    expect(ctx['ENV_FILES']).toBe(`    env_file:\n      - ${ROOT}/fe-01.env\n`);
    expect(ctx['VOLUMES']).toBe('');
  });

  it('gives gw-01 its app-config file plus its own derived secrets file, no data volume', () => {
    const ctx = tierComposeContext(
      'gw',
      'blue',
      `registry.infra.bulletpoints.club/wbs-gw-01@${DIGEST}`,
    );
    expect(ctx['ENV_FILES']).toBe(
      `    env_file:\n      - ${ROOT}/gw-01.env\n      - ${ROOT}/oidc.env\n      - ${ROOT}/gw-01.secrets.env\n`,
    );
    expect(ctx['VOLUMES']).toBe('');
  });

  it('gives be-01 its app-config, secrets, data, and directory-only supervisor mount', () => {
    const ctx = tierComposeContext(
      'be',
      'blue',
      `registry.infra.bulletpoints.club/wbs-be-01@${DIGEST}`,
    );
    expect(ctx['ENV_FILES']).toBe(
      `    env_file:\n      - ${ROOT}/be-01.env\n      - ${ROOT}/oidc.env\n      - ${ROOT}/be-01.secrets.env\n`,
    );
    expect(ctx['VOLUMES']).toBe(
      `    volumes:\n` +
        `      - ${ROOT}/data:/data\n` +
        `      - ${SOLVER_SUPERVISOR_HOST_DIRECTORY}:${SOLVER_SUPERVISOR_CONTAINER_DIRECTORY}:ro\n`,
    );
    expect(ctx['VOLUMES']).not.toContain('supervisor.sock');
  });
});

describe('tierSecretsFile', () => {
  it('names the derived secrets file after the app name', () => {
    expect(tierSecretsFile('gw')).toBe(`${ROOT}/gw-01.secrets.env`);
  });
});

describe('tierEnvFiles', () => {
  it('fe-01 gets only its app-config file', () => {
    expect(tierEnvFiles('fe')).toEqual([`${ROOT}/fe-01.env`]);
  });

  it('be-01 and gw-01 get their app-config file, the OIDC carrier, then their secrets file', () => {
    expect(tierEnvFiles('be')).toEqual([
      `${ROOT}/be-01.env`,
      `${ROOT}/oidc.env`,
      `${ROOT}/be-01.secrets.env`,
    ]);
    expect(tierEnvFiles('gw')).toEqual([
      `${ROOT}/gw-01.env`,
      `${ROOT}/oidc.env`,
      `${ROOT}/gw-01.secrets.env`,
    ]);
  });

  it('gives a layout without a carrier only the app-config and secrets files', () => {
    const bare = { ...envLayout('prod'), oidcEnvPath: null };
    expect(tierEnvFiles('be', bare)).toEqual([`${ROOT}/be-01.env`, `${ROOT}/be-01.secrets.env`]);
  });

  it('gives dev be and gw the OIDC config before their derived secrets, but never gives it to fe', () => {
    const dev = envLayout('dev');
    expect(tierEnvFiles('be', dev)).toEqual([
      '/home/puni1/wbs-dev/be-01.env',
      '/home/puni1/wbs-dev/oidc-dev.env',
      '/home/puni1/wbs-dev/be-01.secrets.env',
    ]);
    expect(tierEnvFiles('gw', dev)).toEqual([
      '/home/puni1/wbs-dev/gw-01.env',
      '/home/puni1/wbs-dev/oidc-dev.env',
      '/home/puni1/wbs-dev/gw-01.secrets.env',
    ]);
    expect(tierEnvFiles('fe', dev)).toEqual(['/home/puni1/wbs-dev/fe-01.env']);
  });
});

describe('deriveTierSecrets', () => {
  const SHARED =
    'INTERNAL_AUTH_SECRET=shared-secret-32-characters-long\n' +
    'JWT_SIGNING_KEY_CURRENT=jwt-current-secret-is-at-least-32-chars!\n' +
    'REGISTRY_PASS=super-secret-registry-password\n';

  it('gives be-01 INTERNAL_AUTH_SECRET and the JWT signing key, but never REGISTRY_PASS', () => {
    expect(deriveTierSecrets('be', SHARED)).toBe(
      'INTERNAL_AUTH_SECRET=shared-secret-32-characters-long\n' +
        'JWT_SIGNING_KEY_CURRENT=jwt-current-secret-is-at-least-32-chars!\n',
    );
  });

  it('gives gw-01 INTERNAL_AUTH_SECRET and the JWT signing key, but never REGISTRY_PASS', () => {
    const out = deriveTierSecrets('gw', SHARED);
    expect(out).toContain('INTERNAL_AUTH_SECRET=shared-secret-32-characters-long');
    expect(out).toContain('JWT_SIGNING_KEY_CURRENT=jwt-current-secret-is-at-least-32-chars!');
    expect(out).not.toContain('REGISTRY_PASS');
  });

  // The finding this whole change fixes, stated as a direct assertion: no
  // tier's allowlist can ever produce a file containing REGISTRY_PASS — it
  // belongs to the host docker daemon and the build client only.
  it('never emits REGISTRY_PASS for any tier, including fe-01', () => {
    expect(deriveTierSecrets('be', SHARED)).not.toContain('REGISTRY_PASS');
    expect(deriveTierSecrets('gw', SHARED)).not.toContain('REGISTRY_PASS');
    expect(deriveTierSecrets('fe', SHARED)).not.toContain('REGISTRY_PASS');
  });

  it('fe-01 gets an empty string — no secrets file is written for it at all', () => {
    expect(deriveTierSecrets('fe', SHARED)).toBe('');
  });

  it('ignores comments and blank lines in the shared file', () => {
    const shared = '# a comment\n\nINTERNAL_AUTH_SECRET=x-32-characters-long-enough-ok\n';
    expect(deriveTierSecrets('be', shared)).toBe(
      'INTERNAL_AUTH_SECRET=x-32-characters-long-enough-ok\n',
    );
  });

  it('omits an optional key the shared file does not carry (JWT_SIGNING_KEY_PREVIOUS)', () => {
    expect(deriveTierSecrets('gw', SHARED)).not.toContain('JWT_SIGNING_KEY_PREVIOUS');
  });

  it("constructs a complete BeConfig from app config plus be's derived shared secrets", async () => {
    // This is deliberately a runtime cross-project contract check. A static
    // infra -> app import would make the deploy library depend on an app;
    // the computed specifier keeps that exception inside this test only.
    // Proof: the active-path sweep found the deleted `apps/be-01` import; the
    // owning suite failed both real BeConfig consumers with MODULE_NOT_FOUND.
    // Pinning its moved external read then failed this test 0/1 until the real
    // cached target declared `apps/wbs/be-01/src/config.ts` as an input.
    // Proof: omitting the imported libraries below let a warmed target replay
    // 1/1 from local cache after `define-config.ts` was changed to throw. With
    // these inputs restored, that fault missed cache and failed 277/1 in
    // "boots local backend configuration..."; restoring the source passed.
    const manifest = readFileSync(new URL('../../project.json', import.meta.url), 'utf8');
    for (const input of [
      '{workspaceRoot}/apps/wbs/be-01/src/config.ts',
      '{workspaceRoot}/libs/wbs/adapters/auth/src/*.ts',
      '!{workspaceRoot}/libs/wbs/adapters/auth/src/*.test.ts',
      '{workspaceRoot}/libs/wbs/adapters/config/src/*.ts',
      '!{workspaceRoot}/libs/wbs/adapters/config/src/*.test.ts',
      '{workspaceRoot}/libs/wbs/domain/validation/src/*.ts',
      '!{workspaceRoot}/libs/wbs/domain/validation/src/*.test.ts',
    ]) {
      expect(manifest).toContain(JSON.stringify(input));
    }
    const beModule: unknown = await import(['../../../..', 'apps/wbs/be-01/src/config'].join('/'));
    if (
      typeof beModule !== 'object' ||
      beModule === null ||
      !('BeConfig' in beModule) ||
      typeof beModule.BeConfig !== 'function'
    ) {
      throw new Error('apps/wbs/be-01/src/config does not export BeConfig');
    }
    const validateBeConfig = beModule.BeConfig as (env: Record<string, string>) => unknown;
    const derived = Object.fromEntries(
      deriveTierSecrets('be', SHARED)
        .trimEnd()
        .split('\n')
        .map((line) => {
          const separator = line.indexOf('=');
          return [line.slice(0, separator), line.slice(separator + 1)];
        }),
    );

    expect(
      validateBeConfig({
        PORT: '3100',
        LOG_LEVEL: 'info',
        GW_URL: 'http://gw-01:3200',
        DB_PATH: '/data/wbs.db',
        AUTH_MODE: 'oidc',
        ...derived,
      }),
    ).not.toHaveProperty('summary');
  });
});

describe('tierHasSecrets', () => {
  it('is true for be and gw, false for fe', () => {
    expect(tierHasSecrets('be')).toBe(true);
    expect(tierHasSecrets('gw')).toBe(true);
    expect(tierHasSecrets('fe')).toBe(false);
  });
});

// Item 3(c): the app-config env file (/srv/wbs/<app>.env) is authored by an
// operator/configure.sh, not derived by this codebase — nothing previously
// stopped a disallowed key (most dangerously REGISTRY_PASS) from being put
// there directly, bypassing SECRET_KEYS's allowlist entirely.
describe('envKeysOf', () => {
  it('extracts key names, ignoring comments and blank lines', () => {
    expect(envKeysOf('# comment\n\nPORT=3100\nLOG_LEVEL=info\n')).toEqual(['PORT', 'LOG_LEVEL']);
  });

  it('returns an empty list for a comment-only file (fe-01.env)', () => {
    expect(envKeysOf('# fe-01 needs no env vars\n')).toEqual([]);
  });
});

describe('assertTierEnvAllowed', () => {
  it('passes be-01.env carrying only its allowed keys', () => {
    expect(() => {
      assertTierEnvAllowed(
        'be',
        'PORT=3100\nLOG_LEVEL=info\nGW_URL=x\nDB_PATH=/data/wbs.db\nAUTH_MODE=oidc\nSOLVER_BUDGET_MS=120000\nSOLVER_SEARCH_WORKERS=2\nSOLVER_MEMORY_LIMIT_MB=512\n',
      );
    }).not.toThrow();
  });

  it('passes gw-01.env carrying only its allowed keys', () => {
    expect(() => {
      assertTierEnvAllowed('gw', 'PORT=3200\nLOG_LEVEL=info\nBE_URL=x\nAUTH_MODE=oidc\n');
    }).not.toThrow();
  });

  it('passes a comment-only fe-01.env', () => {
    expect(() => {
      assertTierEnvAllowed('fe', '# fe-01 needs no env vars\n');
    }).not.toThrow();
  });

  // The exact defect item 3(c) fixes: REGISTRY_PASS put directly in a
  // tier's app-config file bypasses SECRET_KEYS entirely.
  it('rejects REGISTRY_PASS in be-01.env, naming the key but never a value', () => {
    let message = '';
    try {
      assertTierEnvAllowed(
        'be',
        'PORT=3100\nLOG_LEVEL=info\nGW_URL=x\nDB_PATH=x\nREGISTRY_PASS=hunter2\n',
      );
    } catch (e: unknown) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toContain('REGISTRY_PASS');
    expect(message).not.toContain('hunter2');
  });

  it('rejects any key outside the allowlist for fe-01, which allows none', () => {
    expect(() => {
      assertTierEnvAllowed('fe', 'PORT=80\n');
    }).toThrow(/PORT/);
  });

  it('rejects a secret key placed in the app-config file instead of the derived secrets file', () => {
    expect(() => {
      assertTierEnvAllowed(
        'gw',
        'PORT=3200\nLOG_LEVEL=info\nBE_URL=x\nJWT_SIGNING_KEY_CURRENT=x\n',
      );
    }).toThrow(/JWT_SIGNING_KEY_CURRENT/);
  });
});

describe('assertOidcEnvAllowed', () => {
  const intended =
    'AUTH_AUDIENCE=x\nAUTH_CLIENT_ID=x\nAUTH_CLIENT_SECRET=x\n' +
    'AUTH_ISSUER_DISCOVERY_URL=https://issuer.example/.well-known/openid-configuration\n' +
    'AUTH_REDIRECT_URI=https://dev.example/callback\n';

  it('passes the five provider keys carried by oidc-dev.env', () => {
    expect(() => {
      assertOidcEnvAllowed(intended);
    }).not.toThrow();
  });

  it('rejects an app-config override without printing its value', () => {
    let message = '';
    try {
      assertOidcEnvAllowed(`${intended}AUTH_MODE=local-should-stay-secret\n`);
    } catch (e: unknown) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toContain('AUTH_MODE');
    expect(message).not.toContain('local-should-stay-secret');
  });

  it('rejects an unrelated secret without printing its value', () => {
    let message = '';
    try {
      assertOidcEnvAllowed(`${intended}REGISTRY_PASS=hunter2\n`);
    } catch (e: unknown) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toContain('REGISTRY_PASS');
    expect(message).not.toContain('hunter2');
  });
});

/**
 * The preflight's key lists against the releases themselves: a set it admits
 * must boot be-01 and gw-01 under the image's NODE_ENV=production, and every
 * key it demands must be one the release refuses to boot without.
 */
describe('assertTierEnvComplete against the release configuration', () => {
  const APP = {
    be: { PORT: '3100', LOG_LEVEL: 'error', GW_URL: 'http://gw', DB_PATH: '/data/wbs.db' },
    gw: { PORT: '3200', LOG_LEVEL: 'error', BE_URL: 'http://be-01.internal:3100' },
  } as const;
  const SHARED = {
    INTERNAL_AUTH_SECRET: 's'.repeat(32),
    JWT_SIGNING_KEY_CURRENT: 'k'.repeat(32),
  };
  const OIDC = {
    AUTH_ISSUER_DISCOVERY_URL: 'https://issuer.example.test/',
    AUTH_CLIENT_ID: 'client',
    AUTH_CLIENT_SECRET: 'secret',
    AUTH_REDIRECT_URI: 'https://wbs.example.test/api/auth/okta/callback',
    AUTH_AUDIENCE: 'https://api.example.test',
  };
  const envText = (values: Record<string, string>): string =>
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}\n`)
      .join('');

  /** Boots the tier's own config the way its image does; returns the exit code and stderr. */
  function bootRelease(tier: 'be' | 'gw', env: Record<string, string>) {
    const script =
      tier === 'be'
        ? `import { loadConfig } from './apps/wbs/be-01/src/config.ts';
           import { oidcRouteOptionsFromEnv } from './apps/wbs/be-01/src/controller/oidc-options.ts';
           const env = JSON.parse(process.env['RELEASE_ENV']);
           const cfg = loadConfig(env);
           if (cfg.AUTH_MODE === 'oidc') oidcRouteOptionsFromEnv(env);`
        : `import { loadConfig } from './apps/wbs/gw-01/src/config.ts';
           loadConfig(JSON.parse(process.env['RELEASE_ENV']));`;
    const probe = Bun.spawnSync([process.execPath, '--no-env-file', '--eval', script], {
      cwd: new URL('../../../../', import.meta.url).pathname,
      env: { RELEASE_ENV: JSON.stringify(env) },
    });
    return { exitCode: probe.exitCode, stderr: new TextDecoder().decode(probe.stderr) };
  }

  function preflightMessage(tier: 'be' | 'gw', env: Record<string, string>): string {
    const app = Object.fromEntries(
      Object.entries(env).filter(([key]) => key in APP[tier] || key === 'AUTH_MODE'),
    );
    const shared = Object.fromEntries(Object.entries(env).filter(([key]) => key in SHARED));
    const oidc = Object.fromEntries(Object.entries(env).filter(([key]) => key in OIDC));
    try {
      assertTierEnvComplete(tier, {
        appEnvText: envText(app),
        sharedEnvText: envText(shared),
        oidcEnvText: envText(oidc),
      });
    } catch (e: unknown) {
      return e instanceof Error ? e.message : String(e);
    }
    return '';
  }

  const complete = (tier: 'be' | 'gw'): Record<string, string> => ({
    ...APP[tier],
    AUTH_MODE: 'oidc',
    ...SHARED,
    ...OIDC,
    NODE_ENV: 'production',
    // The rendered Compose environment supplies this for be (tierComposeContext).
    APP_ORIGIN: 'https://wbs.example.test',
  });

  for (const tier of ['be', 'gw'] as const) {
    it(`admits an env set that boots ${tier} under NODE_ENV=production`, () => {
      expect(preflightMessage(tier, complete(tier))).toBe('');
      expect(bootRelease(tier, complete(tier)).exitCode).toBe(0);
    });

    it(`demands only keys the ${tier} release refuses to boot without`, () => {
      const demanded = [
        ...Object.keys(APP[tier]),
        'AUTH_MODE',
        ...Object.keys(SHARED),
        ...Object.keys(OIDC),
      ];
      for (const key of demanded) {
        const env = complete(tier);
        const { [key]: _removed, ...rest } = env;
        expect(preflightMessage(tier, rest)).toContain(key);
        expect({ key, exitCode: bootRelease(tier, rest).exitCode }).not.toEqual({
          key,
          exitCode: 0,
        });
      }
    });

    it(`refuses only value shapes the ${tier} release also refuses`, () => {
      const cases: Record<string, string> = {
        PORT: '32o0',
        LOG_LEVEL: 'verbose',
        INTERNAL_AUTH_SECRET: 's'.repeat(31),
        JWT_SIGNING_KEY_CURRENT: 'k'.repeat(20),
        // gw reads only the callback's origin, but the carrier it shares with
        // be must hold be's mounted callback route, so only be is asked here.
        ...(tier === 'be' ? { AUTH_REDIRECT_URI: 'https://wbs.example.test/other' } : {}),
      };
      for (const [key, value] of Object.entries(cases)) {
        const env = { ...complete(tier), [key]: value };
        expect({ key, message: preflightMessage(tier, env) }).toEqual({
          key,
          message: expect.stringContaining(`${key} (`) as string,
        });
        expect({ key, exitCode: bootRelease(tier, env).exitCode }).not.toEqual({
          key,
          exitCode: 0,
        });
      }
    });

    it(`refuses AUTH_MODE=local, which the ${tier} release refuses under NODE_ENV=production`, () => {
      const env = { ...complete(tier), AUTH_MODE: 'local' };
      expect(preflightMessage(tier, env)).toContain('AUTH_MODE=local, which the');
      expect(preflightMessage(tier, env)).toContain('NODE_ENV=production');
      expect(bootRelease(tier, env).stderr).toContain('AUTH_MODE=local is forbidden in production');
    });
  }

  it('reads NODE_ENV=production from both images, which is why local mode is refused', () => {
    const root = new URL('../../../../', import.meta.url).pathname;
    for (const app of ['be-01', 'gw-01']) {
      const dockerfile = readFileSync(join(root, `apps/wbs/${app}/Dockerfile`), 'utf8');
      expect(dockerfile).toMatch(/^ENV NODE_ENV=production$/m);
    }
  });
});

describe('composeUpArgs', () => {
  it('merges base.yml with the rendered per-colour file and starts only that service', () => {
    const args = composeUpArgs('be', 'green');
    expect(args).toEqual([
      'compose',
      '-f',
      `${ROOT}/base.yml`,
      '-f',
      `${ROOT}/compose/be-01-green.yml`,
      'up',
      '-d',
      '--pull',
      'always',
      'be-01-green',
    ]);
  });
});

describe('psColorsFrom', () => {
  it('extracts running colours from `docker ps` output', () => {
    const out = 'be-01-blue\nbe-01-green\ngw-01-blue\n';
    expect(psColorsFrom(out, 'be')).toEqual(['blue', 'green']);
  });

  it('returns an empty list when the tier has nothing running', () => {
    expect(psColorsFrom('gw-01-blue\n', 'fe')).toEqual([]);
  });

  it('ignores container names that merely contain the target as a substring', () => {
    // e.g. some other tier's or project's container should never false-match.
    expect(psColorsFrom('xbe-01-blue\n', 'be')).toEqual([]);
  });
});

describe('grantAliasCommands', () => {
  it('disconnects the incoming colour then reconnects it with both its own alias and BE_ALIAS', () => {
    const [disconnect, connect] = grantAliasCommands('green');
    expect(disconnect).toEqual(['network', 'disconnect', NETWORK, 'be-01-green']);
    expect(connect).toEqual([
      'network',
      'connect',
      '--alias',
      'be-01-green',
      '--alias',
      'be-01.internal',
      NETWORK,
      'be-01-green',
    ]);
  });

  // Always required, first deploy or not: tier.compose.tmpl attaches every
  // colour to wbs-net at `docker compose up` time, so the container always
  // already has an endpoint here — `network connect` would fail outright
  // without the disconnect first, regardless of deploy history.
  it('disconnects unconditionally even for what would be a first-ever deploy', () => {
    const [disconnect] = grantAliasCommands('blue');
    expect(disconnect).toEqual(['network', 'disconnect', NETWORK, 'be-01-blue']);
  });
});

describe('revokeAliasCommands', () => {
  it('disconnects the outgoing colour then restores only its own alias, dropping BE_ALIAS', () => {
    const [disconnect, connect] = revokeAliasCommands('blue');
    expect(disconnect).toEqual(['network', 'disconnect', NETWORK, 'be-01-blue']);
    expect(connect).toEqual(['network', 'connect', '--alias', 'be-01-blue', NETWORK, 'be-01-blue']);
    expect(connect.join(' ')).not.toContain('be-01.internal');
  });
});

/**
 * The rendered per-tier compose file is where an environment either stays in
 * its own lane or does not. Before this, the template hardcoded `wbs-net` and
 * built the container name from tier+colour alone, so a dev swap would have
 * attached dev's container to PROD's network under prod's container name —
 * the one failure mode the whole separate-network decision exists to prevent.
 */
describe('tierComposeContext across environments', () => {
  const IMG = 'registry.infra.bulletpoints.club/wbs-be-01@sha256:' + 'a'.repeat(64);

  it('names prod’s container and network exactly as before', () => {
    const ctx = tierComposeContext('be', 'green', IMG, envLayout('prod'));
    expect(ctx['CONTAINER']).toBe('be-01-green');
    expect(ctx['NETWORK']).toBe('wbs-net');
  });

  it('gives dev its own container name and network', () => {
    const ctx = tierComposeContext('be', 'green', IMG, envLayout('dev'));
    expect(ctx['CONTAINER']).toBe('dev-be-01-green');
    expect(ctx['NETWORK']).toBe('wbs-dev-net');
  });

  it('never renders prod’s network into a dev compose file', () => {
    const ctx = tierComposeContext('gw', 'blue', IMG.replace('be-01', 'gw-01'), envLayout('dev'));
    expect(ctx['NETWORK']).not.toBe('wbs-net');
    expect(ctx['ENV_FILES']).not.toContain('/home/puni1/wbs/');
  });
});

describe('migration rollback commands', () => {
  it('runs the stable migration entrypoint in the incoming container', () => {
    expect(migrateCommand('be-01-green')).toEqual([
      'exec',
      'be-01-green',
      'bun',
      'run',
      'src/migrate-cli.ts',
    ]);
  });

  it('reads the applied set from the container that is about to migrate', () => {
    // Not from the outgoing colour: it runs the old code, which need not have
    // the status CLI at all.
    expect(migrateStatusCommand('be-01-green')).toEqual([
      'exec',
      'be-01-green',
      'bun',
      'run',
      'src/migrate-status-cli.ts',
    ]);
  });

  it('names the baseline to return to rather than a number of steps', () => {
    expect(migrateDownCommand('be-01-green', '20260426171432_init')).toEqual([
      'exec',
      'be-01-green',
      'bun',
      'run',
      'src/migrate-down-cli.ts',
      '--to=20260426171432_init',
    ]);
  });

  it('passes "none" through, which means the database had no migrations applied', () => {
    expect(migrateDownCommand('be-01-green', 'none').at(-1)).toBe('--to=none');
  });

  it('refuses an empty baseline instead of rolling back an unknown amount', () => {
    expect(() => migrateDownCommand('be-01-green', '')).toThrow(/needs a baseline/);
  });
});

describe('backend browser origin carrier', () => {
  it('allows APP_ORIGIN only in backend app config', () => {
    expect(() => {
      assertTierEnvAllowed('be', 'APP_ORIGIN=https://wbs.bulletpoints.club\n');
    }).not.toThrow();
    expect(() => {
      assertTierEnvAllowed('gw', 'APP_ORIGIN=https://wbs.bulletpoints.club\n');
    }).toThrow('APP_ORIGIN');
    expect(() => {
      assertTierEnvAllowed('fe', 'APP_ORIGIN=https://wbs.bulletpoints.club\n');
    }).toThrow('APP_ORIGIN');
    expect(() => {
      assertOidcEnvAllowed('APP_ORIGIN=https://wbs.bulletpoints.club\n');
    }).toThrow('APP_ORIGIN');
    expect(deriveTierSecrets('be', 'APP_ORIGIN=https://wbs.bulletpoints.club\n')).not.toContain(
      'APP_ORIGIN',
    );
  });

  it('refuses layout addresses that cannot denote one trusted HTTP origin', () => {
    for (const siteAddress of [
      'https://user:pass@example.test',
      'https://example.test/path',
      'https://example.test?q=x',
      'https://example.test#x',
      'ftp://example.test',
      'two hosts.test',
      'https://exam\nple.test',
      'https://*.example.test',
      '',
    ]) {
      expect(() =>
        tierComposeContext('be', 'green', `registry.test/wbs-be-01@${DIGEST}`, {
          ...envLayout('dev'),
          siteAddress,
        }),
      ).toThrow('siteAddress');
    }
  });
});

for (const [environment, expected] of [
  ['prod', 'https://wbs.bulletpoints.club'],
  ['dev', 'https://dev.wbs.bulletpoints.club'],
] as const) {
  it(`renders the trusted ${environment} browser origin into backend Compose only`, () => {
    for (const tier of ['be', 'gw', 'fe'] as const) {
      const context = tierComposeContext(
        tier,
        'green',
        `registry.test/wbs-${tier}-01@${DIGEST}`,
        envLayout(environment),
      );
      const rendered = renderTemplate(tierComposeTmpl, context);
      const compose = Bun.YAML.parse(rendered) as {
        services: Record<string, { environment?: Record<string, string> }>;
      };
      const service = Object.values(compose.services)[0];
      expect(service.environment?.['APP_ORIGIN']).toBe(tier === 'be' ? expected : undefined);
    }
  });
}

it('boots local backend configuration from the rendered environment and keeps OIDC callback origin authoritative', () => {
  const context = tierComposeContext(
    'be',
    'green',
    `registry.test/wbs-be-01@${DIGEST}`,
    envLayout('dev'),
  );
  const compose = Bun.YAML.parse(renderTemplate(tierComposeTmpl, context)) as {
    services: Record<string, { environment?: Record<string, string> }>;
  };
  const service = Object.values(compose.services)[0];
  const script = `
    import { loadConfig } from './apps/wbs/be-01/src/config.ts';
    const config = loadConfig(JSON.parse(process.env['ORIGIN_CONFIG']));
    console.log(config.appOrigin);
  `;
  for (const mode of ['local', 'oidc']) {
    const config = {
      PORT: '3100',
      LOG_LEVEL: 'error',
      GW_URL: 'http://gw',
      DB_PATH: '/data/wbs.db',
      INTERNAL_AUTH_SECRET: 's'.repeat(32),
      JWT_SIGNING_KEY_CURRENT: 'k'.repeat(32),
      AUTH_MODE: mode,
      NODE_ENV: 'development',
      ...service.environment,
      AUTH_REDIRECT_URI: 'https://oidc.example.test/api/auth/okta/callback',
    };
    const probe = Bun.spawnSync([process.execPath, '--no-env-file', '--eval', script], {
      cwd: new URL('../../../../', import.meta.url).pathname,
      env: { ORIGIN_CONFIG: JSON.stringify(config) },
    });
    expect(probe.exitCode).toBe(0);
    expect(new TextDecoder().decode(probe.stdout).trim()).toBe(
      mode === 'local' ? 'https://dev.wbs.bulletpoints.club' : 'https://oidc.example.test',
    );
  }
});

it('retains an explicitly configured HTTP scheme and port for a local Caddy address', () => {
  const context = tierComposeContext('be', 'green', `registry.test/wbs-be-01@${DIGEST}`, {
    ...envLayout('dev'),
    siteAddress: 'http://localhost:8080',
  });
  const compose = Bun.YAML.parse(renderTemplate(tierComposeTmpl, context)) as {
    services: Record<string, { environment: Record<string, string> }>;
  };
  expect(Object.values(compose.services)[0].environment['APP_ORIGIN']).toBe(
    'http://localhost:8080',
  );
});
