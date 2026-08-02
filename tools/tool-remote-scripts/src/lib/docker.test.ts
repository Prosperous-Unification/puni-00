import { describe, expect, it } from 'bun:test';

import {
  composeUpArgs,
  containerName,
  digestRef,
  grantAliasCommands,
  isDigest,
  NETWORK,
  psColorsFrom,
  revokeAliasCommands,
  ROOT,
  tierComposeContext,
  tierComposeFile,
} from './docker';

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

describe('digestRef', () => {
  const digest = 'sha256:' + 'c'.repeat(64);

  it('builds a registry-qualified ref pinned by digest, never a tag', () => {
    expect(digestRef('registry.infra.bulletpoints.club', 'be', digest)).toBe(
      `registry.infra.bulletpoints.club/wbs-be-01@${digest}`,
    );
  });

  it('rejects anything that is not a well-formed sha256 digest', () => {
    expect(() => digestRef('r.example.com', 'be', 'sha256:tooshort')).toThrow(/digest/);
    expect(() => digestRef('r.example.com', 'be', 'abc1234')).toThrow(/digest/);
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
      'registry.infra.bulletpoints.club',
      'sha256:' + 'a'.repeat(64),
    );
    expect(ctx['TIER']).toBe('be-01');
    expect(ctx['COLOR']).toBe('green');
    expect(ctx['IMAGE']).toBe(
      `registry.infra.bulletpoints.club/wbs-be-01@sha256:${'a'.repeat(64)}`,
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
