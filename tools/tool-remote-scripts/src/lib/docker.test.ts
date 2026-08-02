import { describe, expect, it } from 'bun:test';

import {
  assertDigestPinnedRef,
  composeUpArgs,
  containerName,
  grantAliasCommands,
  isDigest,
  manifestInspectArgs,
  NETWORK,
  psColorsFrom,
  revokeAliasCommands,
  ROOT,
  tierComposeContext,
  tierComposeFile,
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
