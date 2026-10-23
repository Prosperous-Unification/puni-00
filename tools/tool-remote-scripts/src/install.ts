import { type BundleFile, bundleFilesFor } from './lib/deploy-contract';
import { CURRENT_ENV, type EnvLayout, envLayout } from './lib/env';

export interface InstallArgs {
  host: string;
  execute: boolean;
  /**
   * Which environment's `bin/` to write, as a flag rather than only as
   * `WBS_ENV`.
   *
   * **The fault it was added for.** The installer read the environment from
   * `WBS_ENV` alone, and `deploy.ts`'s own message for a stale bundle told the
   * operator to run `install --host=<host> --execute` — no environment on it.
   * Following that while deploying dev installs into **prod's** root: prod's
   * `swap.js` and `smoke.js` overwritten underneath a running prod deploy,
   * while the dev bundle the deploy was complaining about stays stale. Both
   * messages name `--env` now.
   *
   * `WBS_ENV` remains the default, so every invocation that predates the flag
   * keeps its exact behaviour.
   */
  layout: EnvLayout;
}

export function parseInstallArgs(argv: string[], defaults?: Partial<InstallArgs>): InstallArgs {
  let host = defaults?.host ?? 'h2puni';
  let execute = defaults?.execute ?? false;
  let layout = defaults?.layout ?? CURRENT_ENV;

  for (const raw of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(raw);
    if (!m) continue;
    const key = m[1];
    const val = (m[2] as string | undefined) ?? '';
    if (key === 'host') host = val;
    else if (key === 'execute') execute = true;
    else if (key === 'dry-run') execute = false;
    // `envLayout` throws on anything it does not know, which is the whole
    // point of routing the flag through it rather than indexing a table here:
    // a typo must not install into prod (R5, and `envLayout`'s own contract).
    else if (key === 'env') layout = envLayout(val);
  }

  return { host, execute, layout };
}

// The paths themselves are `@tools/deploy-contract`'s: `tool-deploy` hashes the
// same two files before every swap, and the two copies disagreed about whether
// `remote` was absolute. See `BUNDLE_FILES` there.

export interface InstallStep {
  description: string;
  argv: string[];
}

function quoteShell(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

/**
 * Uploads invocation-owned siblings, then admits both replacements under the
 * canonical host edge lock. Staged and installed bytes must match the hashes
 * captured before upload. Each rename is atomic; the pair is not transactional.
 * Every retained owner path closes admission, regardless of its contents.
 * Transport failure can leave staging or a partial installation; never infer
 * rollback or successful publication from a disconnected SSH session.
 */
export async function buildInstallPlan(
  host: string,
  files: readonly BundleFile[],
): Promise<InstallStep[]> {
  // Proof: a fixed attempt ID made the second real CLI upload reuse two staging paths.
  const attempt = crypto.randomUUID();
  const hashes = await Promise.all(files.map((file) => sha256File(file.local)));
  const staged = files.map((file) => `${file.remote}.install-${attempt}`);
  const state = envLayout('prod').stateDir;
  const lock = quoteShell(`${state}/edge.lock`);
  const checkHashes = (paths: readonly string[]) =>
    paths
      .map(
        (path, index) =>
          `printf '%s  %s\\n' ${quoteShell(hashes[index])} ${quoteShell(path)} | sha256sum -c -`,
      )
      .join('\n');
  const shell = `set -eu
publishing=0
trap 'status=$?; if [ "$status" -ne 0 ] && [ "$publishing" -eq 1 ]; then printf "%s\\n" "partial or uncertain installed-executor replacement; inspect both installed hashes under edge.lock before retry" >&2; fi; rm -f -- ${staged.map(quoteShell).join(' ')}; exit "$status"' EXIT
# Proof: omitting this state-root guard let symlink state hide either retained marker and publish.
if [ ! -d ${quoteShell(state)} ] || [ -L ${quoteShell(state)} ]; then
  printf '%s\\n' 'invalid canonical edge state: expected a real directory' >&2
  exit 1
fi
# Proof: omitting the standalone regular-file requirement published with directory and FIFO locks.
# Each required predicate must stand alone: set -e exempts a failed non-final AND-list command.
test -f ${lock}
# Proof: omitting this predicate published through a symlink canonical lock in the real CLI negative.
test ! -L ${lock}
exec 9< ${lock}
# Proof: omitting flock made the real mv substitute acquire edge.lock during replacement.
flock -n 9
# Listing must succeed: inaccessible trusted state is not marker absence.
for marker in edge-owner.json edge-owner.pending; do
  retained=$(find ${quoteShell(state)} -mindepth 1 -maxdepth 1 -name "$marker" -print)
  # Proof: removing this refusal made retained JSON/pending CLI negatives replace installed bytes.
  if [ -n "$retained" ]; then printf '%s\\n' "shared edge owner admission closed: $marker; no activation" >&2; exit 1; fi
done
# Proof: removing staged verification made corrupted SCP bytes replace both original files.
${checkHashes(staged)}
chmod 0755 -- ${staged.map(quoteShell).join(' ')}
publishing=1
${files.map((file, index) => `mv -- ${quoteShell(staged[index])} ${quoteShell(file.remote)}`).join('\n')}
# Proof: removing installed readback made post-rename corruption report success.
${checkHashes(files.map((file) => file.remote))}
publishing=0`;
  return [
    ...files.map((file, index) => ({
      description: `stage ${file.local} -> ${host}:${staged[index]}`,
      argv: ['scp', file.local, `${host}:${staged[index]}`],
    })),
    {
      description: 'admit, replace and verify both executors under canonical edge.lock',
      argv: ['ssh', host, `sh -c ${quoteShell(shell)}`],
    },
  ];
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
export async function verifyInstalled(host: string, files: readonly BundleFile[]): Promise<void> {
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
  const files = bundleFilesFor(args.layout.root);

  for (const f of files) {
    if (!(await Bun.file(f.local).exists())) {
      throw new Error(
        `${f.local} not found — build it first ` +
          '(nx run tool-remote-scripts:build and nx run tool-smoke:build)',
      );
    }
  }

  const steps = await buildInstallPlan(args.host, files);
  // The environment is on the line, because it decides which `bin/` is
  // overwritten and a dry run is where an operator finds out.
  console.log(
    `[tool-remote-scripts] install host=${args.host} env=${args.layout.env} execute=${String(args.execute)}`,
  );
  for (const s of steps) console.log(`  ${s.description}`);

  if (!args.execute) {
    console.log('[tool-remote-scripts] dry-run only. re-run with --execute to install for real.');
    return;
  }

  for (const s of steps) {
    const p = Bun.spawn(s.argv, { stdout: 'inherit', stderr: 'inherit' });
    const code = await p.exited;
    if (code !== 0) {
      throw new Error(
        `install step failed (exit ${String(code)}): ${s.description}; publication may be partial or uncertain; inspect installed bytes and invocation staging before retry`,
      );
    }
  }

  console.log('[tool-remote-scripts] install ok — checksums verified against the local build.');
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error('[tool-remote-scripts] failed:', e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
