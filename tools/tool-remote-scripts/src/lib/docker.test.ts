import { describe, expect, it } from 'bun:test';

import {
  assertDigestPinnedRef,
  assertTierEnvAllowed,
  composeUpArgs,
  containerName,
  deriveTierSecrets,
  envKeysOf,
  grantAliasCommands,
  isDigest,
  manifestInspectArgs,
  NETWORK,
  psColorsFrom,
  revokeAliasCommands,
  ROOT,
  tierComposeContext,
  tierComposeFile,
  tierEnvFiles,
  tierHasSecrets,
  tierSecretsFile,
} from './docker';

const DIGEST = 'sha256:' + 'a'.repeat(64);

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
    expect(ctx['TIER']).toBe('be-01');
    expect(ctx['COLOR']).toBe('green');
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
      `    env_file:\n      - ${ROOT}/gw-01.env\n      - ${ROOT}/gw-01.secrets.env\n`,
    );
    expect(ctx['VOLUMES']).toBe('');
  });

  it('gives be-01 its app-config file, its own secrets file, and the data volume', () => {
    const ctx = tierComposeContext(
      'be',
      'blue',
      `registry.infra.bulletpoints.club/wbs-be-01@${DIGEST}`,
    );
    expect(ctx['ENV_FILES']).toBe(
      `    env_file:\n      - ${ROOT}/be-01.env\n      - ${ROOT}/be-01.secrets.env\n`,
    );
    expect(ctx['VOLUMES']).toBe(`    volumes:\n      - ${ROOT}/data:/data\n`);
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

  it('be-01 and gw-01 get their app-config file then their secrets file, in that order', () => {
    expect(tierEnvFiles('be')).toEqual([`${ROOT}/be-01.env`, `${ROOT}/be-01.secrets.env`]);
    expect(tierEnvFiles('gw')).toEqual([`${ROOT}/gw-01.env`, `${ROOT}/gw-01.secrets.env`]);
  });
});

describe('deriveTierSecrets', () => {
  const SHARED =
    'INTERNAL_AUTH_SECRET=shared-secret-32-characters-long\n' +
    'JWT_SIGNING_KEY_CURRENT=jwt-current-32-characters-long!\n' +
    'REGISTRY_PASS=super-secret-registry-password\n';

  it('gives be-01 only INTERNAL_AUTH_SECRET', () => {
    expect(deriveTierSecrets('be', SHARED)).toBe(
      'INTERNAL_AUTH_SECRET=shared-secret-32-characters-long\n',
    );
  });

  it('gives gw-01 INTERNAL_AUTH_SECRET and the JWT signing key, but never REGISTRY_PASS', () => {
    const out = deriveTierSecrets('gw', SHARED);
    expect(out).toContain('INTERNAL_AUTH_SECRET=shared-secret-32-characters-long');
    expect(out).toContain('JWT_SIGNING_KEY_CURRENT=jwt-current-32-characters-long!');
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
      assertTierEnvAllowed('be', 'PORT=3100\nLOG_LEVEL=info\nGW_URL=x\nDB_PATH=/data/wbs.db\n');
    }).not.toThrow();
  });

  it('passes gw-01.env carrying only its allowed keys', () => {
    expect(() => {
      assertTierEnvAllowed('gw', 'PORT=3200\nLOG_LEVEL=info\nBE_URL=x\n');
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
