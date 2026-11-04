import { chown, mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readRegistryWriters, type RegistryWriter } from './registry-maintenance-writers';
import { completeRegistryOperation } from './registry-operation-completion';
/** Run kernel chroot cases in the caller's exclusive root-owned workspace. The caller must
 * supply private mounts: a 1 MiB store at store, its bind at access/store, and access/empty
 * bound at aliases. access/empty/leaf and aliases/leaf must denote the same inode through
 * different mounts. This runner creates no mounts. Keep workspace custody root0700 and
 * access and access/empty traversable by UID59001; escapes write through access/store.
 * The root auditor must be able to inspect its dropped-UID children's /proc state.
 * Python must provide mmap(trackfd=False), capset/capget v3, chroot, prctl and CLONE_FS unshare.
 * Each hostile child must write after its census; every child is reaped before cleanup.json.
 */
async function rehearseRegistryWriterChroots(workspace: string): Promise<void> {
  if (process.getuid?.() !== 0 || !/^\/var\/tmp\/puni-writer-chroot-[a-f0-9]{32}$/.test(workspace))
    throw Error('Owned root chroot workspace required');
  const closed: { mode: string; parent: number; child: string; closed: boolean }[] = [];
  try {
    for (const mode of [
      'safe',
      'alias',
      'retained-effective',
      'retained-permitted',
      'thread',
      'virtual',
      'root',
      'cwd',
      'directory',
      'ancestor',
      'descriptor',
      'mapping',
      'same-device',
    ] as const) {
      const store = mode === 'same-device' ? join(workspace, mode) : join(workspace, 'store', mode);
      const empty = ['alias', 'retained-effective', 'retained-permitted'].includes(mode)
        ? join(workspace, 'access', 'empty', mode === 'alias' ? 'leaf' : mode)
        : join(workspace, 'empty', mode);
      await mkdir(store, { mode: 0o700 });
      await chown(store, 59001, 59001);
      await mkdir(empty, { recursive: true, mode: 0o755 });
      await chown(empty, 59001, 59001);
      await writeFile(join(store, 'content'), Buffer.alloc(4096), { mode: 0o600 });
      await chown(join(store, 'content'), 59001, 59001);
      const owned = Bun.spawn(
        [
          '/usr/bin/python3',
          join(workspace, 'helper.py'),
          mode,
          empty,
          store,
          join(workspace, 'access'),
        ],
        { stdin: 'pipe', stdout: 'pipe', stderr: 'inherit' },
      );
      const reader = owned.stdout.getReader();
      let buffered = '';
      let pid = '';
      async function readFrame() {
        for (;;) {
          const split = buffered.indexOf('\n');
          if (split >= 0) {
            const line = buffered.slice(0, split);
            buffered = buffered.slice(split + 1);
            return JSON.parse(line) as unknown;
          }
          const chunk = await reader.read();
          if (chunk.done) throw Error('Missing chroot process frame');
          buffered += new TextDecoder().decode(chunk.value);
          if (buffered.length > 16384) throw Error('Oversized chroot frame');
        }
      }
      await completeRegistryOperation(
        async () => {
          const ready = readReadyReceipt(await readFrame());
          pid = String(ready.pid);
          const sameIdentity =
            ready.root.device === ready.cwd.device && ready.root.inode === ready.cwd.inode;
          const sameMount = ready.root.mount === ready.cwd.mount;
          if (
            mode === 'alias'
              ? !sameIdentity || sameMount
              : mode === 'cwd'
                ? sameIdentity
                : !sameIdentity || !sameMount
          )
            throw Error('Owned chroot root/cwd fault setup does not match ' + mode);
          const effective = mode === 'retained-effective' ? '0000000000040000' : '0000000000000000';
          const permitted =
            mode === 'retained-effective' || mode === 'retained-permitted'
              ? '0000000000040000'
              : '0000000000000000';
          if (
            ready.status.Uid !== '59001 59001 59001 59001' ||
            ready.status.CapEff !== effective ||
            ready.status.CapPrm !== permitted ||
            ready.status.CapAmb !== '0000000000000000' ||
            ready.status.NoNewPrivs !== '1'
          )
            throw Error('Owned chroot privilege fault setup does not match ' + mode);
          if ((await readFile('/proc/' + pid + '/mountinfo', 'utf8')) !== '')
            throw Error('Owned chroot did not produce empty kernel mount visibility');
          console.log(
            JSON.stringify({ mode, kind: 'ready', ...ready, emptyKernelMountView: true }),
          );
          const proc = join(workspace, 'proc', mode);
          await mkdir(join(proc, 'self'), { recursive: true });
          await symlink('/proc/self/mountinfo', join(proc, 'self/mountinfo'));
          await symlink('/proc/' + pid, join(proc, pid));
          let observation:
            { kind: 'read'; writers: RegistryWriter[] } | { kind: 'refused'; cause: unknown };
          try {
            observation = {
              kind: 'read',
              writers: await readRegistryWriters(
                mode === 'same-device' ? store : join(workspace, 'store'),
                '/fixed/registry',
                proc,
              ),
            };
          } catch (cause) {
            observation = { kind: 'refused', cause };
          }
          if (mode === 'safe') {
            if (observation.kind === 'refused') throw observation.cause;
            if (observation.writers.length !== 0)
              throw Error('Unrelated chroot retained ordinary storage capability');
          } else {
            await owned.stdin.write('write\n');
            await owned.stdin.flush();
            const written = await readFrame();
            if (
              typeof written !== 'object' ||
              written === null ||
              !('kind' in written) ||
              written.kind !== 'written'
            )
              throw Error('Missing actual owned write');
            const path = join(
              store,
              ['descriptor', 'mapping'].includes(mode) ? 'content' : 'sentinel',
            );
            if ((await readFile(path)).subarray(0, 4).toString() !== 'held')
              throw Error('Expected actual ordinary storage write did not occur');
            if (observation.kind === 'read' && observation.writers.length === 0)
              throw Error(
                'Hidden ' + mode + ' storage capability was certified absent after actual write',
              );
            if (
              ['alias', 'retained-effective', 'retained-permitted'].includes(mode) &&
              observation.kind !== 'refused'
            )
              throw Error('Expected refusal of owned ' + mode + ' process');
            if (mode === 'descriptor' || mode === 'mapping') {
              const expected = mode === 'descriptor' ? 'writable-descriptor' : 'writable-mapping';
              if (
                observation.kind !== 'read' ||
                observation.writers.length !== 1 ||
                observation.writers[0]?.reason !== expected ||
                String(observation.writers[0]?.pid) !== pid
              )
                throw Error('Expected concrete ' + mode + ' writer evidence');
            }
          }
          console.log(
            JSON.stringify({
              mode,
              kind: 'observed',
              emptyKernelMountView: true,
              observation: observation.kind,
              actualWrite: mode !== 'safe',
            }),
          );
        },
        async () => {
          await owned.stdin.end();
          const status = await owned.exited;
          reader.releaseLock();
          if (pid === '' || (await readdir('/proc')).includes(pid))
            throw Error('Owned chroot child survived cleanup');
          closed.push({ mode, parent: owned.pid, child: pid, closed: true });
          if (status !== 0) throw Error('Owned chroot supervisor failed');
        },
      );
    }
  } finally {
    await writeFile(join(workspace, 'cleanup.json'), JSON.stringify(closed), { mode: 0o600 });
  }
}
/** Require bounded kernel identities without coercing missing observations into a successful setup. */
function readPathReceipt(receipt: unknown) {
  if (
    typeof receipt !== 'object' ||
    receipt === null ||
    !('device' in receipt) ||
    typeof receipt.device !== 'string' ||
    !/^[0-9]+$/.test(receipt.device) ||
    !('inode' in receipt) ||
    typeof receipt.inode !== 'string' ||
    !/^[1-9][0-9]*$/.test(receipt.inode) ||
    !('mount' in receipt) ||
    typeof receipt.mount !== 'string' ||
    !/^[1-9][0-9]*$/.test(receipt.mount)
  )
    throw Error('Invalid owned chroot path receipt');
  return { device: receipt.device, inode: receipt.inode, mount: receipt.mount };
}

/** Preserve only the credential fields required to verify the native fault setup. */
function readStatusReceipt(receipt: unknown) {
  if (
    typeof receipt !== 'object' ||
    receipt === null ||
    !('Uid' in receipt) ||
    typeof receipt.Uid !== 'string' ||
    !/^[0-9]+( [0-9]+){3}$/.test(receipt.Uid) ||
    !('CapEff' in receipt) ||
    typeof receipt.CapEff !== 'string' ||
    !/^[0-9a-f]{16}$/.test(receipt.CapEff) ||
    !('CapPrm' in receipt) ||
    typeof receipt.CapPrm !== 'string' ||
    !/^[0-9a-f]{16}$/.test(receipt.CapPrm) ||
    !('CapInh' in receipt) ||
    typeof receipt.CapInh !== 'string' ||
    !/^[0-9a-f]{16}$/.test(receipt.CapInh) ||
    !('CapAmb' in receipt) ||
    typeof receipt.CapAmb !== 'string' ||
    !/^[0-9a-f]{16}$/.test(receipt.CapAmb) ||
    !('CapBnd' in receipt) ||
    typeof receipt.CapBnd !== 'string' ||
    !/^[0-9a-f]{16}$/.test(receipt.CapBnd) ||
    !('NoNewPrivs' in receipt) ||
    (receipt.NoNewPrivs !== '0' && receipt.NoNewPrivs !== '1')
  )
    throw Error('Invalid owned chroot status receipt');
  return {
    Uid: receipt.Uid,
    CapEff: receipt.CapEff,
    CapPrm: receipt.CapPrm,
    CapInh: receipt.CapInh,
    CapAmb: receipt.CapAmb,
    CapBnd: receipt.CapBnd,
    NoNewPrivs: receipt.NoNewPrivs,
  };
}

/** Accept a PID only with the supervisor's actual kernel path and credential observations. */
function readReadyReceipt(receipt: unknown) {
  if (
    typeof receipt !== 'object' ||
    receipt === null ||
    !('pid' in receipt) ||
    typeof receipt.pid !== 'number' ||
    !Number.isSafeInteger(receipt.pid) ||
    receipt.pid <= 0 ||
    !('root' in receipt) ||
    !('cwd' in receipt) ||
    !('status' in receipt)
  )
    throw Error('Invalid owned chroot process receipt');
  return {
    pid: receipt.pid,
    root: readPathReceipt(receipt.root),
    cwd: readPathReceipt(receipt.cwd),
    status: readStatusReceipt(receipt.status),
  };
}

if (import.meta.main) {
  const workspace = process.argv.at(2);
  if (workspace === undefined || process.argv.length !== 3)
    throw new Error('Explicit owned chroot workspace required');
  await rehearseRegistryWriterChroots(workspace);
}
