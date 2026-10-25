import { dirname, posix } from 'node:path';

import { fromMarkdown } from 'mdast-util-from-markdown';
import { visit } from 'unist-util-visit';

/** A complete Git tree change; both endpoints remain available for scope decisions. */
export interface Change {
  status: string;
  oldMode: string;
  newMode: string;
  oldPath: string | null;
  newPath: string | null;
}

/** An explained scope decision bound to the exact candidate and its validated ancestor. */
export interface Selection {
  schemaVersion: 1;
  base: string;
  head: string;
  scope: 'docs' | 'code';
  changes: Change[];
  reasons: string[];
}

/** Executes Git without replacements or shell interpolation; unexpected failures throw. */
function readGit(repository: string, ...args: string[]): string {
  const invocation = Bun.spawnSync(['git', '--no-replace-objects', '-C', repository, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0) {
    throw new Error(`CI selection Git ${args[0]} failed: ${invocation.stderr.toString()}`);
  }
  return invocation.stdout.toString();
}

/** Parses NUL-delimited raw changes, retaining rename endpoints and rejecting incomplete records. */
export function parseChanges(raw: string): Change[] {
  if (raw === '') return [];
  if (!raw.endsWith('\0')) throw new Error('Git changes lack a terminating NUL');
  const fields = raw.slice(0, -1).split('\0');
  const changes: Change[] = [];
  for (let offset = 0; offset < fields.length;) {
    const header = fields.at(offset++);
    if (header === undefined) throw new Error('Missing Git change header');
    const match = /^:([0-7]{6}) ([0-7]{6}) [0-9a-f]{40} [0-9a-f]{40} ([ACDMRT])(?:[0-9]+)?$/.exec(
      header,
    );
    if (match === null) throw new Error(`Malformed Git change header: ${header}`);
    const oldMode = match.at(1);
    const newMode = match.at(2);
    const status = match.at(3);
    if (oldMode === undefined || newMode === undefined || status === undefined) {
      throw new Error('Git change header omitted a required field');
    }
    const first = fields.at(offset++);
    if (first === undefined || first === '') throw new Error('Missing Git change path');
    const second = status === 'R' || status === 'C' ? fields.at(offset++) : first;
    if (second === undefined || second === '') throw new Error('Missing Git rename destination');
    changes.push({
      status,
      oldMode,
      newMode,
      oldPath: status === 'A' ? null : first,
      newPath: status === 'D' ? null : second,
    });
  }
  return changes;
}

/** Reviewed narrative namespaces, excluding fixture/template/evidence inputs even when Markdown. */
export function isProsePath(path: string): boolean {
  if (/(?:^|\/)(?:fixtures?|templates?|evidence)(?:\/|$)/.test(path)) return false;
  return (
    path === 'puni-assessment.md' ||
    /^docs\/(?:findings|plans|adr|superpowers\/(?:plans|specs))\/.+\.md$/.test(path)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads only index declarations; the documentation validator owns the complete index schema. */
function readDeclarations(content: string): Record<string, unknown>[] {
  const comments: string[] = [];
  // Proof: raw-source regex comparison accepted both fence removal and fence addition as docs;
  // the production CLI authority regressions failed twice (2026-10-22). Match index parser semantics.
  visit(fromMarkdown(content), 'html', (html) => {
    if (html.value.includes('module-index')) comments.push(html.value.trim());
  });
  if (comments.length > 1) throw new Error('Document has multiple module-index declarations');
  return comments.map((comment) => {
    const match = /^<!--\s*module-index\s+([\s\S]*?)-->$/.exec(comment);
    if (match === null) throw new Error('Malformed module-index envelope');
    const encoded = match.at(1);
    if (encoded === undefined) throw new Error('Index declaration has no content');
    const declaration: unknown = JSON.parse(encoded);
    if (!isRecord(declaration) || !Array.isArray(declaration['memberships'])) {
      throw new Error('Index declaration lacks an object and memberships array');
    }
    return declaration;
  });
}

function readMemberships(declaration: Record<string, unknown>): unknown[] {
  const memberships = declaration['memberships'];
  if (!Array.isArray(memberships)) throw new Error('Index memberships must be an array');
  return memberships;
}

/** Only narrative membership changes can stay in the docs scope; check/consumer authority cannot. */
function hasProseDeclarations(path: string, previous: string, current: string): boolean {
  const before = readDeclarations(previous);
  const after = readDeclarations(current);
  if (before.length !== after.length) return false;
  for (let index = 0; index < before.length; index++) {
    const oldDeclaration = before.at(index);
    const newDeclaration = after.at(index);
    if (oldDeclaration === undefined || newDeclaration === undefined)
      throw new Error('Missing paired index');
    if (
      JSON.stringify({ ...oldDeclaration, memberships: [] }) !==
      JSON.stringify({ ...newDeclaration, memberships: [] })
    )
      return false;
    const oldMemberships = readMemberships(oldDeclaration);
    const newMemberships = readMemberships(newDeclaration);
    const oldEncoded = new Set(oldMemberships.map((membership) => JSON.stringify(membership)));
    const newEncoded = new Set(newMemberships.map((membership) => JSON.stringify(membership)));
    const changed = [
      ...oldMemberships.filter((membership) => !newEncoded.has(JSON.stringify(membership))),
      ...newMemberships.filter((membership) => !oldEncoded.has(JSON.stringify(membership))),
    ];
    for (const membership of changed) {
      if (
        !isRecord(membership) ||
        membership['kind'] !== 'path' ||
        typeof membership['path'] !== 'string'
      )
        return false;
      const memberPath = membership['path'];
      if (
        posix.isAbsolute(memberPath) ||
        !isProsePath(posix.normalize(posix.join(dirname(path), memberPath)))
      )
        return false;
    }
  }
  return true;
}

/**
 * Classifies a complete immutable PR comparison. Callers must first validate the event's synthetic
 * merge identity; this boundary rechecks object existence, ancestry and the actual checkout.
 * Narrative paths still require document validation. A docs verdict makes no full-test or
 * externally trusted wiki certification claim. Unknown impact selects code checks explicitly.
 */
export function selectChanges(repository: string, base: string, head: string): Selection {
  for (const revision of [base, head]) {
    // Proof: removing SHA validation let the production CLI accept HEAD; immutable-base regression failed (2026-10-22).
    if (!/^[0-9a-f]{40}$/.test(revision))
      throw new Error('CI selection requires full immutable commit SHAs');
    readGit(repository, 'cat-file', '-e', `${revision}^{commit}`);
  }
  // Proof: removing the checkout comparison accepted an older head; candidate-identity regression failed (2026-10-22).
  if (readGit(repository, 'rev-parse', 'HEAD').trim() !== head)
    throw new Error('CI selection head differs from checkout');
  // Proof: removing ancestry validation accepted a future base; non-ancestor regression failed (2026-10-22).
  readGit(repository, 'merge-base', '--is-ancestor', base, head);
  const changes = parseChanges(
    readGit(
      repository,
      'diff',
      '--raw',
      '--no-abbrev',
      '--find-renames',
      '--no-ext-diff',
      '--no-textconv',
      '-z',
      base,
      head,
      '--',
    ),
  );
  const reasons: string[] = [];
  for (const change of changes) {
    const paths = [change.oldPath, change.newPath].filter((path): path is string => path !== null);
    // Proof: suppressing path classification exempted changed source/consumed docs; production CLI regressions failed (2026-10-22).
    if (paths.some((path) => !isProsePath(path))) {
      reasons.push(`Runtime or unreviewed input: ${paths.join(' -> ')}`);
      continue;
    }
    // Proof: removing mode checks exempted executable Markdown and symlinks; both CLI regressions failed (2026-10-22).
    if ([change.oldMode, change.newMode].some((mode) => mode !== '000000' && mode !== '100644')) {
      reasons.push(`Non-prose object mode: ${paths.join(' -> ')}`);
      continue;
    }
    if (change.oldPath !== null && change.newPath !== null && change.oldPath !== change.newPath) {
      reasons.push(`Renamed document requires consumer coverage: ${paths.join(' -> ')}`);
      continue;
    }
    const path = change.newPath ?? change.oldPath;
    if (path === null) throw new Error('Git change has no endpoint');
    const previous =
      change.oldPath === null ? '' : readGit(repository, 'show', `${base}:${change.oldPath}`);
    const current =
      change.newPath === null ? '' : readGit(repository, 'show', `${head}:${change.newPath}`);
    // Proof: bypassing declaration checks exempted check/consumer authority and code membership edits; CLI regressions failed (2026-10-22).
    if (!hasProseDeclarations(path, previous, current))
      reasons.push(`Document authority changed: ${path}`);
  }
  // Proof: removing the nonempty-diff condition granted a prose exemption to zero changes; CLI regression failed (2026-10-22).
  if (changes.length === 0)
    reasons.push('Empty diff does not establish a documentation-only change');
  const scope = reasons.length === 0 ? 'docs' : 'code';
  if (scope === 'docs')
    reasons.push(
      'Only reviewed narrative paths and supported index memberships changed; documentation validation required',
    );
  return { schemaVersion: 1, base, head, scope, changes, reasons };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const base = args.at(0);
  const head = args.at(1);
  const repository = args.at(2);
  if (base === undefined || head === undefined || repository === undefined || args.length !== 3) {
    throw new Error('Usage: ci-selection.ts <base-sha> <head-sha> <repository>');
  }
  process.stdout.write(`${JSON.stringify(selectChanges(repository, base, head))}\n`);
}
