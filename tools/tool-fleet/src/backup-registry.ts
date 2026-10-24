import { createHash } from 'node:crypto';
import { access, lstat, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

/** Reject malformed external JSON before using it to select or mutate a live resource. */
function field(value: unknown, ...keys: string[]): unknown {
  let selected = value;
  for (const key of keys) {
    if (typeof selected !== 'object' || selected === null || !(key in selected)) return undefined;
    // JSON objects are indexed only after the object/key boundary checks above.
    selected = (selected as Record<string, unknown>)[key];
  }
  return selected;
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid ${name}`);
  return value;
}

function requireArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Expected Kubernetes array');
  return value;
}

function requireEnv(name: string): string {
  return requireText(process.env[name], name);
}

/** Owner-only files must belong to the invoking service user; symlinks are refused. */
async function requirePrivateFile(path: string) {
  const metadata = await lstat(path);
  // Proof: owner-only credentials test breaks backup.env mode; no cluster consumer runs.
  if (!metadata.isFile() || metadata.uid !== process.getuid?.() || (metadata.mode & 0o077) !== 0) {
    throw new Error(`Expected owner-only regular file: ${path}`);
  }
  await access(path, 4);
}

/**
 * Stop only the named registry during a full-volume restic snapshot. An existing,
 * initialized repository is mandatory. Signals and failures restore the replica and
 * both Flux suspend flags before returning; failed recovery prints manual commands.
 * A receipt is replaced only after full archive verification and successful recovery.
 */
async function backupRegistry(directory: string) {
  const lock: unknown = JSON.parse(
    await readFile(join(import.meta.dir, 'backup-registry.lock.json'), 'utf8'),
  );
  const restic = requireText(field(lock, 'executable'), 'restic executable');
  const digest = createHash('sha256')
    .update(await readFile(restic))
    .digest('hex');
  // Proof: pinned executable test changes the consumer bytes; preflight refuses before mutation.
  if (digest !== field(lock, 'sha256')) throw new Error('Restic executable differs from lock');
  await requirePrivateFile(join(directory, 'backup.env'));
  await requirePrivateFile(requireEnv('RESTIC_PASSWORD_FILE'));
  for (const name of [
    'RESTIC_REPOSITORY',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_DEFAULT_REGION',
  ])
    requireEnv(name);

  const state = { cancelled: false, recovering: false };
  let cancellationTimer: ReturnType<typeof setTimeout> | undefined;
  let active: ReturnType<typeof Bun.spawn> | undefined;
  function cancel() {
    state.cancelled = true;
    if (!state.recovering && active !== undefined) {
      const child = active;
      child.kill('SIGTERM');
      cancellationTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, 5_000);
    }
  }
  process.on('SIGTERM', cancel);
  process.on('SIGINT', cancel);
  try {
    async function execute(command: string[], timeout = 60_000) {
      if (state.cancelled && !state.recovering) throw new Error('Backup cancelled');
      const child = Bun.spawn(command, { stdout: 'pipe', stderr: 'pipe' });
      active = child;
      const timing = { expired: false };
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const timer = setTimeout(() => {
        timing.expired = true;
        child.kill('SIGTERM');
        killTimer = setTimeout(() => {
          child.kill('SIGKILL');
        }, 5_000);
      }, timeout);
      // Dependency output can include service credentials; failures expose only command/exit status.
      try {
        const [code, stdout] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        if (code !== 0 || timing.expired || (state.cancelled && !state.recovering)) {
          throw new Error(
            `${command[0] === restic ? 'restic ' + command[1] : 'k3s kubectl'} failed (exit ${String(code)}${timing.expired ? ', timeout' : ''}${state.cancelled && !state.recovering ? ', cancelled' : ''})`,
          );
        }
        return stdout;
      } finally {
        clearTimeout(timer);
        clearTimeout(killTimer);
        clearTimeout(cancellationTimer);
        active = undefined;
      }
    }
    const kubectl = (...arguments_: string[]) =>
      execute(['k3s', 'kubectl', '--request-timeout=45s', ...arguments_]);
    const get = async (namespace: string, kind: string, name: string): Promise<unknown> =>
      JSON.parse(await kubectl('-n', namespace, 'get', kind, name, '-o', 'json'));
    const patch = (name: string, suspended: boolean) => [
      '-n',
      'flux-system',
      'patch',
      'kustomization',
      name,
      '--type=merge',
      '-p',
      JSON.stringify({ spec: { suspend: suspended } }),
    ];
    const scale = ['-n', 'puni-registry', 'scale', 'deployment', 'registry', '--replicas=1'];
    const rollout = [
      '-n',
      'puni-registry',
      'rollout',
      'status',
      'deployment/registry',
      '--timeout=45s',
    ];
    let receipt: object | undefined;
    let failure: unknown;
    const recovery: string[][] = [];
    const errors: unknown[] = [];
    try {
      // Proof: repository dependency failure is refused before the first Kubernetes mutation.
      await execute([restic, 'cat', 'config']);
      const root = await get('flux-system', 'kustomization', 'puni-cluster');
      const platform = await get('flux-system', 'kustomization', 'platform');
      function suspendState(resource: unknown, name: string, path: string): boolean {
        const suspended = field(resource, 'spec', 'suspend');
        // Proof: malformed/source/ownership fixture negatives leave all cluster state unchanged.
        if (
          field(resource, 'metadata', 'name') !== name ||
          field(resource, 'metadata', 'namespace') !== 'flux-system' ||
          field(resource, 'spec', 'sourceRef', 'kind') !== 'GitRepository' ||
          field(resource, 'spec', 'sourceRef', 'name') !== 'puni-platform' ||
          field(resource, 'spec', 'path') !== path ||
          (suspended !== undefined && typeof suspended !== 'boolean')
        )
          throw new Error(`Unexpected Flux source/state: ${name}`);
        // Kubernetes omits spec.suspend when reconciliation is active.
        return suspended === true;
      }
      const rootSuspended = suspendState(
        root,
        'puni-cluster',
        './infra/clusters/platform/production',
      );
      const platformSuspended = suspendState(
        platform,
        'platform',
        './infra/platform/registry/production',
      );
      const deployment = await get('puni-registry', 'deployment', 'registry');
      const volumes = requireArray(field(deployment, 'spec', 'template', 'spec', 'volumes'));
      if (
        field(deployment, 'metadata', 'name') !== 'registry' ||
        field(deployment, 'metadata', 'namespace') !== 'puni-registry' ||
        field(deployment, 'metadata', 'labels', 'kustomize.toolkit.fluxcd.io/name') !==
          'platform' ||
        field(deployment, 'metadata', 'labels', 'kustomize.toolkit.fluxcd.io/namespace') !==
          'flux-system' ||
        field(deployment, 'spec', 'replicas') !== 1 ||
        field(deployment, 'spec', 'selector', 'matchLabels', 'app.kubernetes.io/name') !==
          'registry' ||
        !volumes.some(
          (volume) =>
            field(volume, 'name') === 'storage' &&
            field(volume, 'persistentVolumeClaim', 'claimName') === 'registry',
        )
      )
        throw new Error('Unexpected registry ownership/replica/source');
      const pvc = await get('puni-registry', 'pvc', 'registry');
      const uid = requireText(field(pvc, 'metadata', 'uid'), 'PVC UID');
      const pvName = requireText(field(pvc, 'spec', 'volumeName'), 'PV name');
      const pv = await get('puni-registry', 'pv', pvName);
      const source = requireText(field(pv, 'spec', 'hostPath', 'path'), 'PV hostPath');
      const terms = requireArray(
        field(pv, 'spec', 'nodeAffinity', 'required', 'nodeSelectorTerms'),
      );
      const expressions = requireArray(field(terms[0], 'matchExpressions'));
      const nodeNames = requireArray(field(expressions[0], 'values'));
      const nodeName = requireText(nodeNames[0], 'PV node name');
      const node = await get('puni-registry', 'node', nodeName);
      const machineId = (await readFile('/etc/machine-id', 'utf8')).trim();
      // Proof: claim/node/path negatives break PV identity/locality; no suspend or scale is attempted.
      if (
        field(pvc, 'metadata', 'name') !== 'registry' ||
        field(pvc, 'metadata', 'namespace') !== 'puni-registry' ||
        field(pvc, 'status', 'phase') !== 'Bound' ||
        field(pv, 'metadata', 'name') !== pvName ||
        field(pv, 'spec', 'claimRef', 'uid') !== uid ||
        field(pv, 'spec', 'claimRef', 'name') !== 'registry' ||
        field(pv, 'spec', 'claimRef', 'namespace') !== 'puni-registry' ||
        terms.length !== 1 ||
        expressions.length !== 1 ||
        field(expressions[0], 'key') !== 'kubernetes.io/hostname' ||
        field(expressions[0], 'operator') !== 'In' ||
        nodeNames.length !== 1 ||
        field(node, 'metadata', 'name') !== nodeName ||
        !/^[a-f0-9]{32}$/.test(machineId) ||
        field(node, 'status', 'nodeInfo', 'machineID') !== machineId ||
        !isAbsolute(source) ||
        (await realpath(source)) !== source ||
        !(await lstat(source)).isDirectory()
      )
        throw new Error('Registry PVC/PV is not the bound local source');
      await access(source, 4);
      const wait =
        process.env['PUNI_REGISTRY_BACKUP_WAIT_MS'] === undefined
          ? 120_000
          : Number(process.env['PUNI_REGISTRY_BACKUP_WAIT_MS']);
      if (!Number.isSafeInteger(wait) || wait < 1 || wait > 120_000)
        throw new Error('Invalid pod wait bound');

      // Register compensation before each write: an API timeout can follow an applied mutation.
      recovery.unshift(patch('puni-cluster', rootSuspended));
      await kubectl(...patch('puni-cluster', true));
      recovery.unshift(patch('platform', platformSuspended));
      await kubectl(...patch('platform', true));
      recovery.unshift(scale, rollout);
      await kubectl('-n', 'puni-registry', 'scale', 'deployment', 'registry', '--replicas=0');
      const deadline = Date.now() + wait;
      for (;;) {
        const pods: unknown = JSON.parse(
          await kubectl(
            '-n',
            'puni-registry',
            'get',
            'pods',
            '-l',
            'app.kubernetes.io/name=registry',
            '-o',
            'json',
          ),
        );
        if (requireArray(field(pods, 'items')).length === 0) break;
        // Proof: pods dependency never drains; backup is refused and all three states are restored.
        if (Date.now() >= deadline)
          throw new Error('Registry pods did not terminate before backup');
        await Bun.sleep(Math.min(1_000, wait));
      }
      const output = await execute(
        [restic, 'backup', '--json', '--tag', 'puni-registry-consistent', '--', source],
        3_600_000,
      );
      const summaries: unknown[] = output
        .trim()
        .split('\n')
        .map((line): unknown => JSON.parse(line));
      const summary = summaries.find((entry) => field(entry, 'message_type') === 'summary');
      const snapshotId = requireText(field(summary, 'snapshot_id'), 'snapshot identity');
      const bytes = field(summary, 'total_bytes_processed');
      // Proof: snapshot/empty fixture outputs are refused; previous receipt survives successful recovery.
      if (
        !/^[a-f0-9]{64}$/.test(snapshotId) ||
        typeof bytes !== 'number' ||
        !Number.isSafeInteger(bytes) ||
        bytes <= 0
      )
        throw new Error('Restic returned no nonempty identified snapshot');
      receipt = {
        snapshotId,
        timestamp: new Date().toISOString(),
        sourcePvcUid: uid,
        sourcePvName: pvName,
        sourcePvPath: source,
        bytes,
        archiveCheck: 'restic check --read-data',
      };
    } catch (cause) {
      failure = cause;
    } finally {
      state.recovering = true;
      for (const command of recovery) {
        try {
          await kubectl(...command);
        } catch (cause) {
          errors.push(cause);
          // Proof: cleanup dependency failure exits nonzero, prints this exact command and still restores root.
          console.error(
            'MANUAL RECOVERY: k3s kubectl ' +
              command.map((argument) => "'" + argument.replaceAll("'", "'\\''") + "'").join(' '),
          );
        }
      }
      if (failure !== undefined) errors.unshift(failure);
      if (state.cancelled && failure === undefined) errors.unshift(new Error('Backup cancelled'));
    }
    state.recovering = false;
    if (errors.length > 0) throw new AggregateError(errors, 'Registry backup/recovery failed');
    if (receipt === undefined) throw new Error('Backup produced no receipt');
    // Proof: check dependency exits 23 after recovery; corrupt real-restic pack is refused and prior receipt survives.
    await execute([restic, 'check', '--read-data'], 3_600_000);
    const partial = join(directory, 'last-success.json.partial');
    await writeFile(partial, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    await rename(partial, join(directory, 'last-success.json'));
    console.log(JSON.stringify(receipt));
  } finally {
    process.off('SIGTERM', cancel);
    process.off('SIGINT', cancel);
  }
}

if (import.meta.main) {
  try {
    const directory = process.env['PUNI_REGISTRY_BACKUP_DIRECTORY'] ?? '/root/.puni/registry';
    if (process.argv[2] === '--locked') await backupRegistry(directory);
    else {
      // flock owns the process lifetime; --no-fork gives signals to the actual runner.
      const child = Bun.spawn(
        [
          'flock',
          '--nonblock',
          '--no-fork',
          join(directory, 'backup.lock'),
          process.execPath,
          import.meta.path,
          '--locked',
        ],
        { stdout: 'inherit', stderr: 'inherit' },
      );
      const forward = () => {
        child.kill('SIGTERM');
      };
      process.on('SIGTERM', forward);
      process.on('SIGINT', forward);
      process.exitCode = await child.exited;
      process.off('SIGTERM', forward);
      process.off('SIGINT', forward);
    }
  } catch (cause) {
    if (cause instanceof AggregateError) {
      for (const error of cause.errors)
        console.error(error instanceof Error ? error.message : 'Unknown backup failure');
    } else console.error(cause instanceof Error ? cause.message : 'Unknown backup failure');
    process.exitCode = 1;
  }
}
