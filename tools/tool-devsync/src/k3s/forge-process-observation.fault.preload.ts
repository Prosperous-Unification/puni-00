import * as filesystem from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { mock } from 'bun:test';

const { open, readlink, realpath, writeFile, readFile, rename, mkdir, unlink, symlink } =
  filesystem;
const fault = process.env['FORGE_PROCESS_FAULT'];
const cgroupRoot = process.env['FORGE_PROCESS_CGROUP_ROOT'];
let directoryReplaced = false;
let executableReplaced = false;
const nativeTimer = globalThis.setTimeout;
if (fault === 'deadline') {
  globalThis.setTimeout = ((callback: (...arguments_: unknown[]) => void, milliseconds?: number) =>
    nativeTimer(callback, milliseconds === 30_000 ? 40 : milliseconds)) as typeof setTimeout;
}
void mock.module('node:fs/promises', () => ({
  ...filesystem,
  realpath: async (path: string) => {
    if (fault === 'deadline' && path === '/sys/fs/cgroup') {
      if (cgroupRoot === undefined) throw new Error('missing fixture root');
      return cgroupRoot;
    }
    return realpath(path);
  },
  open: async (path: string, flags: number) => {
    if (fault === 'deadline' && path.endsWith('/memory.current'))
      return new Promise(() => {
        /* Inject a required read that never settles. */
      });
    return open(path, flags);
  },
  readlink: async (path: string) => {
    const executable = await readlink(path);
    if (fault === 'executable-target' && !executableReplaced) {
      executableReplaced = true;
      await unlink(path);
      await symlink('/opt/replacement/bun', path);
    }
    if (fault === 'identity') {
      const stat = join(dirname(path), 'stat');
      await writeFile(stat, (await readFile(stat, 'utf8')).replace('1234', '9999'));
    }
    if (fault === 'exec') await writeFile(join(dirname(path), 'cmdline'), 'bun\0/src/other.ts\0');
    if (fault === 'membership') await writeFile(join(dirname(path), 'cgroup'), '0::/foreign\n');
    if (fault === 'directory' && !directoryReplaced) {
      directoryReplaced = true;
      const cgroup = process.env['FORGE_PROCESS_CGROUP'];
      if (cgroup === undefined) throw new Error('missing cgroup fixture');
      await rename(cgroup, `${cgroup}-previous`);
      await mkdir(cgroup);
    }
    return executable;
  },
}));
