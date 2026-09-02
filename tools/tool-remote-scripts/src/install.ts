// Ships the two bundles the server actually executes to /srv/wbs/bin/:
//
//   - swap.js  — the blue/green executor, run directly by the host's bun
//     (tool-deploy's deploy.ts does `ssh <host> 'cd /srv/wbs && bun
//     bin/swap.js ...'`). Built by this project's own `build` target.
//   - smoke.js — tool-smoke's bundle, run inside an ephemeral container
//     after every deploy (deploy.ts's buildSmokeCommand). Built by
//     tool-smoke's `build` target.
//
// Before this, both files "got there by hand" — scp'd once, manually, and
// never touched again — so a change to swap.ts or tool-smoke's sources
// would silently NOT reach the server until someone remembered to re-copy
// it. This makes that reproducible instead of remembered, and verifies the
// copy actually landed rather than trusting scp's exit code alone.
//
// Default is dry-run (prints the plan, touches nothing); --execute performs
// the real scp + atomic rename + chmod + checksum verification. Same
// dry-run-by-default shape as tool-bootstrap's push.ts and tool-deploy's
// deploy.ts.
import { ROOT } from './lib/docker';

export interface InstallArgs {
  host: string;
  execute: boolean;
}

export function parseInstallArgs(argv: string[], defaults?: Partial<InstallArgs>): InstallArgs {
  let host = defaults?.host ?? 'h2puni';
  let execute = defaults?.execute ?? false;

  for (const raw of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(raw);
    if (!m) continue;
    const key = m[1];
    const val = (m[2] as string | undefined) ?? '';
    if (key === 'host') host = val;
    else if (key === 'execute') execute = true;
    else if (key === 'dry-run') execute = false;
  }

  return { host, execute };
}

export interface BundleFile {
  /** Local dist/ path, relative to the repo root — this process's cwd. */
  local: string;
  /** Final path on the server. */
  remote: string;
}

// Not imported from tool-smoke, and that stands: these are the paths **this**
// installer writes, and tool-smoke names its own bundle for its own reasons.
// The reasoning that used to be here — that no `@wbs/*` entry point exists —
// was already false and is now gone: `@wbs/deploy-contract` is this project's,
// and it carries the vocabulary four projects have to agree about. These two
// path strings are not that: nothing else reads them.
export const BUNDLE_FILES: BundleFile[] = [
  { local: 'dist/tool-remote-scripts/swap.js', remote: `${ROOT}/bin/swap.js` },
  { local: 'dist/tool-smoke/smoke.js', remote: `${ROOT}/bin/smoke.js` },
];

export interface InstallStep {
  description: string;
  argv: string[];
}

/**
 * scp to a `.tmp` sibling, then chmod + rename into place remotely in one
 * ssh round trip — `mv` within the same directory is atomic, so a deploy
 * that reads bin/swap.js concurrently with an install never sees a
 * partially-written file. Mirrors this project's own writeAtomic (see
 * lib/atomic.ts) for the same reason, one level up (remote FS, not local).
 */
export function buildInstallPlan(host: string, files: BundleFile[] = BUNDLE_FILES): InstallStep[] {
  const steps: InstallStep[] = [];
  for (const f of files) {
    const tmp = `${f.remote}.tmp`;
    steps.push({
      description: `scp ${f.local} -> ${host}:${tmp}`,
      argv: ['scp', f.local, `${host}:${tmp}`],
    });
    steps.push({
      description: `install ${f.remote} (chmod 0755 + atomic rename)`,
      argv: ['ssh', host, `chmod 0755 ${tmp} && mv ${tmp} ${f.remote}`],
    });
  }
  return steps;
}

async function sha256File(path: string): Promise<string> {
  const buf = await Bun.file(path).arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Buffer.from(digest).toString('hex');
}

/** Parses coreutils `sha256sum` output (`<hex>␠␠<path>` per line) into a path -> hash map. */
export function parseSha256sumOutput(out: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of out.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    const sp = trimmed.indexOf(' ');
    if (sp === -1) continue;
    const hash = trimmed.slice(0, sp);
    const path = trimmed.slice(sp).trimStart();
    result[path] = hash;
  }
  return result;
}

async function sha256Remote(host: string, paths: string[]): Promise<Record<string, string>> {
  const p = Bun.spawn(['ssh', host, `sha256sum ${paths.join(' ')}`], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const out = await new Response(p.stdout).text();
  const code = await p.exited;
  if (code !== 0) {
    const err = await new Response(p.stderr).text();
    throw new Error(`failed to read remote checksums from ${host}: ${err.trim()}`);
  }
  return parseSha256sumOutput(out);
}

/**
 * Fails loudly (not the exit code of the whole install command, a specific
 * message) if the file that landed on the server doesn't match the local
 * build byte-for-byte — a scp interrupted mid-transfer already fails its
 * own exit code, but this also catches "installed the wrong build" and
 * "the remote file was touched by something else after install".
 */
export async function verifyInstalled(
  host: string,
  files: BundleFile[] = BUNDLE_FILES,
): Promise<void> {
  const remoteHashes = await sha256Remote(
    host,
    files.map((f) => f.remote),
  );
  for (const f of files) {
    const local = await sha256File(f.local);
    // Indexing a plain Record returns `string` here (noUncheckedIndexedAccess
    // is off in this repo), but at runtime a key sha256sum never printed —
    // i.e. the file is missing on the server — comes back `undefined`, which
    // trivially fails this comparison too.
    if (remoteHashes[f.remote] !== local) {
      throw new Error(
        `${f.remote} on ${host} does not match the local build (missing or checksum mismatch) — install did not land cleanly`,
      );
    }
  }
}

async function main(): Promise<void> {
  const args = parseInstallArgs(process.argv.slice(2));

  for (const f of BUNDLE_FILES) {
    if (!(await Bun.file(f.local).exists())) {
      throw new Error(
        `${f.local} not found — build it first ` +
          '(nx run tool-remote-scripts:build and nx run tool-smoke:build)',
      );
    }
  }

  const steps = buildInstallPlan(args.host);
  console.log(`[tool-remote-scripts] install host=${args.host} execute=${String(args.execute)}`);
  for (const s of steps) console.log(`  ${s.description}`);

  if (!args.execute) {
    console.log('[tool-remote-scripts] dry-run only. re-run with --execute to install for real.');
    return;
  }

  for (const s of steps) {
    const p = Bun.spawn(s.argv, { stdout: 'inherit', stderr: 'inherit' });
    const code = await p.exited;
    if (code !== 0) {
      throw new Error(`install step failed (exit ${String(code)}): ${s.description}`);
    }
  }

  await verifyInstalled(args.host);
  console.log('[tool-remote-scripts] install ok — checksums verified against the local build.');
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error('[tool-remote-scripts] failed:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
