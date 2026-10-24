import { createHash } from 'node:crypto';
import { open, readlink, stat } from 'node:fs/promises';
import { posix } from 'node:path';

import type { HostProcessIdentity } from './installed-authorities';
import { assertSame } from './managed-cohort';

export interface ParticipantProcessObservation {
  readonly identity: HostProcessIdentity;
  readonly argv: readonly string[];
  readonly executablePath: string;
}
/** Reads a real host PID without process/cgroup exemptions. Every procfs component is bounded and bracketed by the original start identity. */
export async function observeParticipantProcess(
  pid: number,
  deadline: number,
): Promise<ParticipantProcessObservation> {
  try {
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('invalid PID');
    function checkDeadline() {
      if (
        !Number.isFinite(deadline) ||
        deadline <= performance.now() ||
        deadline - performance.now() > 600000
      )
        throw new Error('participant process deadline exceeded');
    }
    async function read(path: string, maximum: number): Promise<Buffer> {
      checkDeadline();
      const descriptor = await open(path, 'r');
      try {
        const parts: Buffer[] = [];
        const buffer = Buffer.alloc(Math.min(maximum + 1, 1024 * 1024));
        let length = 0;
        for (;;) {
          checkDeadline();
          const { bytesRead } = await descriptor.read(buffer, 0, buffer.length, null);
          if (bytesRead === 0) break;
          length += bytesRead;
          if (length > maximum) throw new Error('participant procfs bound exceeded');
          parts.push(Buffer.from(buffer.subarray(0, bytesRead)));
        }
        checkDeadline();
        return Buffer.concat(parts);
      } finally {
        await descriptor.close();
      }
    }
    function text(bytes: Buffer): string {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    const root = `/proc/${String(pid)}`;
    async function processStart() {
      const contents = text(await read(`${root}/stat`, 1024 * 1024));
      const ending = contents.lastIndexOf(') ');
      const fields = contents
        .slice(ending + 2)
        .trim()
        .split(/\s+/);
      const startTime = fields[19];
      if (
        ending < 1 ||
        !contents.startsWith(`${String(pid)} (`) ||
        fields[0] === 'Z' ||
        typeof startTime !== 'string' ||
        !/^[0-9]+$/.test(startTime)
      )
        throw new Error('participant procfs start malformed');
      return startTime;
    }
    async function cgroup() {
      const contents = text(await read(`${root}/cgroup`, 1024 * 1024)).trim();
      if (!contents.startsWith('0::/') || contents.includes('\n'))
        throw new Error('participant cgroup unsupported');
      const path = contents.slice(3);
      if (path.includes('\0') || posix.normalize(path) !== path)
        throw new Error('participant cgroup malformed');
      return path;
    }
    const startTime = await processStart();
    const group = await cgroup();
    const command = await read(`${root}/cmdline`, 1024 * 1024);
    if (command.length === 0 || command.at(-1) !== 0) throw new Error('participant argv malformed');
    const argv = text(command.subarray(0, -1)).split('\0');
    if (argv[0] === '' || argv.length > 4096) throw new Error('participant argv absent');
    const status = text(await read(`${root}/status`, 1024 * 1024));
    const uids = status.split('\n').filter((line) => line.startsWith('Uid:'));
    const uidFields = uids.at(0)?.trim().split(/\s+/).slice(1);
    if (
      uids.length !== 1 ||
      uidFields?.length !== 4 ||
      uidFields.some((uid) => !/^[0-9]+$/.test(uid))
    )
      throw new Error('participant UID malformed');
    const uid = Number(uidFields[0]);
    if (!Number.isSafeInteger(uid) || uid < 0 || uid > 4294967295)
      throw new Error('participant UID unsupported');
    const executablePath = await readlink(`${root}/exe`);
    const cwd = await readlink(`${root}/cwd`);
    if (
      !executablePath.startsWith('/') ||
      executablePath.endsWith(' (deleted)') ||
      !cwd.startsWith('/') ||
      cwd.endsWith(' (deleted)')
    )
      throw new Error('participant paths unsupported');
    const executable = await stat(`${root}/exe`, { bigint: true });
    if (!executable.isFile()) throw new Error('participant executable is not regular');
    const sha256 = createHash('sha256')
      .update(await read(`${root}/exe`, 128 * 1024 * 1024))
      .digest('hex');
    const finalExecutable = await stat(`${root}/exe`, { bigint: true });
    assertSame(
      [
        String(executable.dev),
        String(executable.ino),
        String(executable.size),
        String(executable.mtimeNs),
        String(executable.ctimeNs),
      ],
      [
        String(finalExecutable.dev),
        String(finalExecutable.ino),
        String(finalExecutable.size),
        String(finalExecutable.mtimeNs),
        String(finalExecutable.ctimeNs),
      ],
      'participant executable readback',
    );
    assertSame(startTime, await processStart(), 'participant process start readback');
    assertSame(group, await cgroup(), 'participant process cgroup readback');
    assertSame(
      command.toString('hex'),
      (await read(`${root}/cmdline`, 1024 * 1024)).toString('hex'),
      'participant process argv readback',
    );
    assertSame(
      executablePath,
      await readlink(`${root}/exe`),
      'participant process executable path',
    );
    assertSame(cwd, await readlink(`${root}/cwd`), 'participant process cwd');
    checkDeadline();
    return {
      identity: {
        pid,
        startTime,
        uid,
        cgroup: group,
        executable: { device: String(executable.dev), inode: String(executable.ino), sha256 },
        argvSha256: createHash('sha256').update(command).digest('hex'),
        cwd,
      },
      argv,
      executablePath,
    };
  } catch {
    throw new Error('participant native process observation refused');
  }
}
