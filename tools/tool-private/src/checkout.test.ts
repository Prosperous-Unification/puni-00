import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

import { checkoutPrivate, parseCheckoutRequest, siblingRemote } from './checkout';
import { git } from './git';

const identity = ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid'];

function commit(checkout: string, file: string, contents: string): string {
  writeFileSync(join(checkout, file), contents);
  git(checkout, ['add', file]);
  git(checkout, [...identity, 'commit', '--quiet', '-m', file]);
  return git(checkout, ['rev-parse', 'HEAD']);
}

/**
 * An organisation directory holding a public and a private bare repository, a public working
 * clone whose `.gitignore` is `ignore`, and an author clone that pushes private commits.
 */
function organisation(ignore = '/private/\n') {
  const root = scratchSync('tool-private-');
  const org = join(root, 'Prosperous-Unification');
  for (const name of ['puni-00', 'puni-fleet']) {
    git(root, ['init', '--quiet', '--bare', '--initial-branch=main', join(org, `${name}.git`)]);
  }
  const author = join(root, 'author');
  git(root, ['clone', '--quiet', join(org, 'puni-fleet.git'), author]);
  const first = commit(author, 'README.md', 'one\n');
  git(author, ['push', '--quiet', 'origin', 'HEAD:main']);

  const seed = join(root, 'seed');
  git(root, ['clone', '--quiet', join(org, 'puni-00.git'), seed]);
  commit(seed, '.gitignore', ignore);
  git(seed, ['push', '--quiet', 'origin', 'HEAD:main']);
  const workspace = join(root, 'workspace');
  git(root, ['clone', '--quiet', join(org, 'puni-00.git'), workspace]);
  return { author, first, workspace, nested: join(workspace, 'private/puni-fleet') };
}

describe('parseCheckoutRequest', () => {
  it('reads a repository and an optional revision', () => {
    expect(parseCheckoutRequest(['puni-fleet'])).toEqual({ repo: 'puni-fleet', ref: null });
    expect(parseCheckoutRequest(['puni-fleet', '--ref', 'abc123'])).toEqual({
      repo: 'puni-fleet',
      ref: 'abc123',
    });
  });

  it('refuses a missing, path-like or suffixed name and stray arguments', () => {
    for (const args of [
      [],
      ['../x'],
      ['a/b'],
      ['.hidden'],
      ['x.git'],
      ['x', '--ref'],
      ['x', 'y'],
    ]) {
      expect(() => parseCheckoutRequest(args), args.join(' ')).toThrow();
    }
  });
});

describe('siblingRemote', () => {
  it('keeps the scheme, host and organisation of origin', () => {
    expect(siblingRemote('git@github.com:Org/puni-00.git', 'puni-fleet')).toBe(
      'git@github.com:Org/puni-fleet.git',
    );
    expect(siblingRemote('https://github.com/Org/puni-00', 'puni-fleet')).toBe(
      'https://github.com/Org/puni-fleet.git',
    );
    expect(siblingRemote('ssh://git@github.com/Org/puni-00.git/', 'puni-fleet')).toBe(
      'ssh://git@github.com/Org/puni-fleet.git',
    );
    expect(siblingRemote('/srv/git/Org/puni-00.git', 'puni-fleet')).toBe(
      '/srv/git/Org/puni-fleet.git',
    );
  });

  it('refuses an origin without an organisation segment', () => {
    expect(() => siblingRemote('puni-00', 'puni-fleet')).toThrow(/no organisation segment/);
  });
});

describe('checkoutPrivate', () => {
  it('clones beside origin, fast-forwards, and detaches at a revision', () => {
    const { author, first, workspace, nested } = organisation();

    expect(checkoutPrivate(workspace, { repo: 'puni-fleet', ref: null })).toBe('cloned');
    expect(git(nested, ['rev-parse', 'HEAD'])).toBe(first);
    expect(git(workspace, ['status', '--porcelain'])).toBe('');

    const second = commit(author, 'next.md', 'two\n');
    git(author, ['push', '--quiet', 'origin', 'HEAD:main']);
    expect(checkoutPrivate(workspace, { repo: 'puni-fleet', ref: null })).toBe('fast-forwarded');
    expect(git(nested, ['rev-parse', 'HEAD'])).toBe(second);

    expect(checkoutPrivate(workspace, { repo: 'puni-fleet', ref: first })).toBe('fast-forwarded');
    expect(git(nested, ['rev-parse', 'HEAD'])).toBe(first);
  });

  it('clones straight to a revision', () => {
    const { author, first, workspace, nested } = organisation();
    commit(author, 'next.md', 'two\n');
    git(author, ['push', '--quiet', 'origin', 'HEAD:main']);

    expect(checkoutPrivate(workspace, { repo: 'puni-fleet', ref: first })).toBe('cloned');
    expect(git(nested, ['rev-parse', 'HEAD'])).toBe(first);
  });

  it('refuses a dirty nested checkout and leaves it untouched', () => {
    const { author, first, workspace, nested } = organisation();
    checkoutPrivate(workspace, { repo: 'puni-fleet', ref: null });
    commit(author, 'next.md', 'two\n');
    git(author, ['push', '--quiet', 'origin', 'HEAD:main']);
    writeFileSync(join(nested, 'draft.yaml'), 'unsaved: true\n');

    expect(() => checkoutPrivate(workspace, { repo: 'puni-fleet', ref: null })).toThrow(
      /private\/puni-fleet has uncommitted changes/,
    );
    expect(git(nested, ['rev-parse', 'HEAD'])).toBe(first);
    expect(existsSync(join(nested, 'draft.yaml'))).toBe(true);
    expect(existsSync(join(nested, 'next.md'))).toBe(false);
  });

  it('refuses a path the public repository does not ignore', () => {
    const { workspace, nested } = organisation('node_modules/\n');

    expect(() => checkoutPrivate(workspace, { repo: 'puni-fleet', ref: null })).toThrow(
      /private\/puni-fleet is not ignored/,
    );
    expect(existsSync(nested)).toBe(false);
  });

  it('refuses a nested checkout of another repository', () => {
    const { workspace, nested } = organisation();
    git(workspace, ['init', '--quiet', nested]);
    git(nested, ['remote', 'add', 'origin', 'git@example.invalid:Other/puni-fleet.git']);

    expect(() => checkoutPrivate(workspace, { repo: 'puni-fleet', ref: null })).toThrow(
      /tracks git@example.invalid:Other\/puni-fleet.git/,
    );
  });
});
