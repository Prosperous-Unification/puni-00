import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import type { CheckRunner, CheckTools } from './check';
import { readCheckTools } from './check';
import { readToolchain } from './contracts';

interface Artifact {
  readonly name: string;
  readonly version: string;
  readonly url: string;
  readonly sha256: string;
  /** Path of the executable inside the archive, or `null` when the download is the binary. */
  readonly member: string | null;
}

/** Where locked validation tools are cached: `PUNI_TOOL_CACHE`, else the XDG cache. */
export function toolCacheDirectory(env: Readonly<Record<string, string | undefined>>): string {
  const explicit = env['PUNI_TOOL_CACHE'];
  if (explicit !== undefined && explicit !== '') return explicit;
  const xdg = env['XDG_CACHE_HOME'];
  return join(xdg !== undefined && xdg !== '' ? xdg : join(homedir(), '.cache'), 'puni/tools');
}

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * The cached artifact at `archive` whose SHA-256 equals the lock, downloading it when absent or
 * different. A download with any other digest throws before anything is extracted or run.
 */
async function verifiedArchive(artifact: Artifact, archive: string): Promise<void> {
  const cached = await readFile(archive).catch((cause: unknown) => {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw cause;
  });
  if (cached !== null && sha256Of(cached) === artifact.sha256) return;
  const response = await fetch(artifact.url, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok) {
    throw new Error(`${artifact.name}: ${artifact.url} answered HTTP ${String(response.status)}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = sha256Of(bytes);
  // Proof: check.test.ts `refuses a download whose digest differs from the lock` served other
  // bytes; with this comparison removed they were installed as the tool.
  if (actual !== artifact.sha256) {
    throw new Error(
      `${artifact.name} ${artifact.version} from ${artifact.url} has sha256 ${actual}; ` +
        `the lock requires ${artifact.sha256}`,
    );
  }
  await writeFile(`${archive}.partial`, bytes);
  await rename(`${archive}.partial`, archive);
}

/** Installs one locked tool into `cache` and returns the executable path. */
export async function installLockedTool(
  artifact: Artifact,
  cache: string,
  run: CheckRunner,
): Promise<string> {
  const directory = join(cache, `${artifact.name}-${artifact.version}`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const archive = join(directory, basename(new URL(artifact.url).pathname));
  await verifiedArchive(artifact, archive);
  if (artifact.member === null) {
    await chmod(archive, 0o755);
    return archive;
  }
  const extracted = join(directory, 'extracted');
  await rm(extracted, { recursive: true, force: true });
  await mkdir(extracted);
  const untar = await run(['tar', '-xf', archive, '-C', extracted, artifact.member], {
    timeoutMs: 120_000,
  });
  if (untar.exitCode !== 0) {
    throw new Error(`${artifact.name}: cannot extract ${artifact.member}: ${untar.stderr.trim()}`);
  }
  return join(extracted, artifact.member);
}

/**
 * The version a tool reports must be the locked one. `probe` is the argv after the executable;
 * `expected` must appear in its output.
 */
export async function assertToolVersion(
  name: string,
  executable: string,
  probe: readonly string[],
  expected: string,
  run: CheckRunner,
): Promise<void> {
  const reported = await run([executable, ...probe], { timeoutMs: 60_000 });
  const output = reported.stdout + reported.stderr;
  if (reported.exitCode !== 0 || !output.includes(expected)) {
    throw new Error(
      `${name} at ${executable} does not report ${expected}: ${output.trim().slice(0, 300)}`,
    );
  }
}

/**
 * Provisions every tool `tool-fleet:check` runs, at the exact locked versions: kubectl and helm
 * from `infra/versions/toolchain.json`, shellcheck and actionlint from `check-tools.json`, and the
 * digest-pinned fleet controller image, which must already be loaded (it is built, not pulled).
 */
export async function provisionCheckTools(
  root: string,
  env: Readonly<Record<string, string | undefined>>,
  run: CheckRunner,
): Promise<CheckTools> {
  const toolchain = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const locks = await readCheckTools(join(root, 'tools/tool-fleet/src/check-tools.json'));
  const cache = toolCacheDirectory(env);
  const { kubectl: kubectlLock, helm: helmLock } = toolchain.binaries;

  const kubectl = await installLockedTool(
    { name: 'kubectl', ...kubectlLock, member: null },
    cache,
    run,
  );
  await assertToolVersion(
    'kubectl',
    kubectl,
    ['version', '--client'],
    `Client Version: ${kubectlLock.version}`,
    run,
  );
  const helm = await installLockedTool(
    { name: 'helm', ...helmLock, member: 'linux-amd64/helm' },
    cache,
    run,
  );
  await assertToolVersion('helm', helm, ['version', '--short'], helmLock.version, run);
  const shellcheck = await installLockedTool(
    { name: 'shellcheck', ...locks.shellcheck },
    cache,
    run,
  );
  await assertToolVersion(
    'shellcheck',
    shellcheck,
    ['--version'],
    `version: ${locks.shellcheck.version}`,
    run,
  );
  const actionlint = await installLockedTool(
    { name: 'actionlint', ...locks.actionlint },
    cache,
    run,
  );
  await assertToolVersion('actionlint', actionlint, ['-version'], locks.actionlint.version, run);

  const controllerImage = await resolveController(
    toolchain.controller.image,
    toolchain.controller.digest,
    join(root, 'dist/tool-fleet/controller.oci'),
    run,
  );
  return { kubectl, helm, shellcheck, actionlint, controllerImage };
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function archiveBlob(archive: string, path: string, run: CheckRunner): Promise<Uint8Array> {
  const read = await run(['tar', '-xOf', archive, path], { timeoutMs: 120_000 });
  if (read.exitCode !== 0)
    throw new Error(`cannot read ${path} from ${archive}: ${read.stderr.trim()}`);
  return new TextEncoder().encode(read.stdout);
}

/**
 * The docker reference that runs the locked controller. A containerd image store keeps the
 * manifest digest, so `name@digest` resolves. The classic overlay2 store (GitHub-hosted runners)
 * keeps no RepoDigests after `docker load`; there the loaded archive itself is verified instead:
 * its index must name the locked manifest, the manifest bytes must hash to it, and the image is
 * addressed by the config digest that manifest names, which is the loaded image's ID.
 */
export async function resolveController(
  image: string,
  digest: string,
  archive: string,
  run: CheckRunner,
): Promise<string> {
  const byDigest = `${image.replace(/:[^/:]+$/, '')}@${digest}`;
  if ((await run(['docker', 'image', 'inspect', byDigest], { timeoutMs: 60_000 })).exitCode === 0) {
    return byDigest;
  }
  if (!existsSync(archive)) {
    throw new Error(
      `fleet controller ${byDigest} is not loaded and ${archive} does not exist; build it with ` +
        '`bunx nx run tool-fleet:controller-image` and `docker load --input` that archive',
    );
  }
  const index = JSON.parse(
    new TextDecoder().decode(await archiveBlob(archive, 'index.json', run)),
  ) as {
    manifests?: { digest?: string }[];
  };
  const manifestDigest = index.manifests?.[0]?.digest;
  // Proof: check.test.ts `refuses a loaded archive whose manifest is not the locked digest`
  // resolved another build's image with this comparison removed.
  if (manifestDigest !== digest) {
    throw new Error(
      `${archive} names manifest ${String(manifestDigest)}, not the locked ${digest}`,
    );
  }
  const manifestBytes = await archiveBlob(archive, `blobs/sha256/${digest.slice(7)}`, run);
  if (`sha256:${sha256Hex(manifestBytes)}` !== digest) {
    throw new Error(`${archive} manifest bytes do not hash to ${digest}`);
  }
  const config = (
    JSON.parse(new TextDecoder().decode(manifestBytes)) as { config?: { digest?: string } }
  ).config?.digest;
  if (config === undefined || !/^sha256:[0-9a-f]{64}$/.test(config)) {
    throw new Error(`${archive} manifest ${digest} names no config digest`);
  }
  const id = await run(['docker', 'image', 'inspect', '--format', '{{.Id}}', config], {
    timeoutMs: 60_000,
  });
  if (id.exitCode !== 0 || id.stdout.trim() !== config) {
    throw new Error(
      `the image loaded from ${archive} (config ${config}) is not in docker: ${id.stderr.trim()}`,
    );
  }
  return config;
}

/** Verify a prepared archive privately through the existing installer, then bind selected executable bytes before invocation. Missing preparation never downloads. */
export async function authenticatePreparedHelm(
  root: string,
  tools: string,
  run: CheckRunner,
  archive?: string,
) {
  const lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const pin = lock.binaries.helm;
  const name = basename(new URL(pin.url).pathname);
  const prepared = archive ?? join(toolCacheDirectory(process.env), `helm-${pin.version}`, name);
  // Proof: Task25c2a archive-source substitution admitted explicitly missing, unreadable and changed archives.
  const bytes = await readFile(prepared);
  // Proof: Task25c2a archive-hash removal reached the prohibited-download fault instead of refusing bad bytes.
  if (sha256Of(bytes) !== pin.sha256) throw new Error('Rehearsal Helm archive integrity differs');
  const directory = await mkdtemp(join(tmpdir(), 'rehearsal-helm-identity-'));
  try {
    const cache = join(directory, 'cache');
    await mkdir(join(cache, `helm-${pin.version}`), { recursive: true });
    await writeFile(join(cache, `helm-${pin.version}`, name), bytes);
    const executable = await installLockedTool(
      { name: 'helm', ...pin, member: 'linux-amd64/helm' },
      cache,
      run,
    );
    const executableSHA256 = sha256Of(await readFile(executable));
    // Proof: Task25c2a selected-executable removal admitted the same-version substitute before invocation.
    if (sha256Of(await readFile(join(resolve(tools), 'helm'))) !== executableSHA256)
      throw new Error('Rehearsal Helm executable integrity differs');
    return {
      version: pin.version,
      archiveSHA256: pin.sha256,
      executableSHA256,
      member: 'linux-amd64/helm' as const,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Authenticate the already prepared kubectl bytes and version; no installation or fallback is allowed. */
export async function authenticatePreparedKubectl(root: string, tools: string, run: CheckRunner) {
  const lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const executable = join(resolve(tools), 'kubectl');
  // Proof: Task25c3d kubectl-digest removal admitted a same-version substitute before its probe.
  if (sha256Of(await readFile(executable)) !== lock.binaries.kubectl.sha256)
    throw new Error('Rehearsal kubectl integrity differs');
  // Proof: Task25c3d kubectl-version removal lost the changed reported-version refusal.
  const reported = await run([executable, 'version', '--client'], { timeoutMs: 60_000 });
  if (
    reported.exitCode !== 0 ||
    !reported.stdout.includes(`Client Version: ${lock.binaries.kubectl.version}`)
  )
    throw new Error('Rehearsal kubectl version differs');
  return lock.binaries.kubectl;
}
