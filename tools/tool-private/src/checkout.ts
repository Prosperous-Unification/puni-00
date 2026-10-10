import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { git, tryGit } from './git';

/** `<repo> [--ref <revision>]` as `bun run private:checkout` receives it. */
export interface CheckoutRequest {
  readonly repo: string;
  readonly ref: string | null;
}

const repoName = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Parses the command line, throwing on a missing, unsafe or extra argument. */
export function parseCheckoutRequest(args: readonly string[]): CheckoutRequest {
  if (args.length === 0) {
    throw new Error('usage: bun run private:checkout <repo> [--ref <revision>]');
  }
  const [repo, ...rest] = args;
  if (!repoName.test(repo) || repo.endsWith('.git')) {
    throw new Error('usage: bun run private:checkout <repo> [--ref <revision>]');
  }
  if (rest.length === 0) return { repo, ref: null };
  if (rest.length === 2 && rest[0] === '--ref' && rest[1] !== '' && !rest[1].startsWith('-')) {
    return { repo, ref: rest[1] };
  }
  throw new Error(`unexpected arguments: ${rest.join(' ')}`);
}

/**
 * The URL of `repo` beside the public repository: `origin` with its last path segment replaced,
 * so the scheme, host and organisation, and therefore the caller's own SSH key or credential
 * helper, are the ones the public checkout already uses. Nothing about the private repository is
 * committed. Throws when `origin` has no organisation segment to keep.
 */
export function siblingRemote(origin: string, repo: string): string {
  const match = /^(.*[/:][^/:]+[/:])[^/:]+?(?:\.git)?\/?$/.exec(origin);
  if (match === null) {
    throw new Error(`origin ${origin} has no organisation segment to derive ${repo} from`);
  }
  return `${match[1]}${repo}.git`;
}

/** What `checkoutPrivate` did to the nested checkout. */
export type CheckoutOutcome = 'cloned' | 'fast-forwarded';

/**
 * Clones `repo` beside the public `origin` into `private/<repo>/` of the checkout containing
 * `workspace`, or fetches and fast-forwards an existing clean clone; `ref` then detaches at that
 * revision.
 *
 * Throws, touching nothing, when `private/<repo>` is not ignored by the public repository, exists
 * without being that clone's root, has another `origin`, or has any uncommitted or untracked
 * change. It never resets, stashes or deletes anything in the nested tree.
 */
export function checkoutPrivate(workspace: string, request: CheckoutRequest): CheckoutOutcome {
  const top = git(workspace, ['rev-parse', '--show-toplevel']);
  const remote = siblingRemote(git(top, ['remote', 'get-url', 'origin']), request.repo);
  const relative = `private/${request.repo}`;
  const target = join(top, relative);
  if (tryGit(top, ['check-ignore', '--quiet', `${relative}/`]).exitCode !== 0) {
    // Proof: with this throw removed, checkout.test.ts `refuses a path the public repository
    // does not ignore` failed (8 pass / 1 fail) on 2026-10-06: the clone went ahead.
    throw new Error(`${relative} is not ignored by ${top}/.gitignore; add /private/ first`);
  }

  if (!existsSync(target)) {
    git(top, ['clone', '--quiet', remote, relative]);
    if (request.ref !== null) git(target, ['checkout', '--quiet', '--detach', request.ref]);
    return 'cloned';
  }

  if (tryGit(target, ['rev-parse', '--show-toplevel']).stdout.trim() !== target) {
    throw new Error(`${target} exists but is not a git checkout of its own`);
  }
  const nestedOrigin = git(target, ['remote', 'get-url', 'origin']);
  if (nestedOrigin !== remote) {
    throw new Error(`${target} tracks ${nestedOrigin}, not ${remote}`);
  }
  const changes = git(target, ['status', '--porcelain']);
  if (changes !== '') {
    // Proof: with this guard disabled, checkout.test.ts `refuses a dirty nested checkout and
    // leaves it untouched` failed (8 pass / 1 fail) on 2026-10-06: it returned `fast-forwarded`.
    throw new Error(
      `${target} has uncommitted changes; commit, stash or remove them first:\n${changes}`,
    );
  }
  git(target, ['fetch', '--quiet', 'origin']);
  if (request.ref !== null) git(target, ['checkout', '--quiet', '--detach', request.ref]);
  else git(target, ['merge', '--quiet', '--ff-only', '@{upstream}']);
  return 'fast-forwarded';
}

if (import.meta.main) {
  try {
    const request = parseCheckoutRequest(process.argv.slice(2));
    const outcome = checkoutPrivate(process.cwd(), request);
    console.log(`private/${request.repo}: ${outcome}`);
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exit(1);
  }
}
