import { existsSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';

/**
 * A build-host mutex shared by the timer and a human at a keyboard.
 *
 * It has to live here rather than in the systemd unit (`flock -n … ExecStart=`)
 * because the two contenders do not both go through the unit: the timer does,
 * and `bun run deploy` does not. A lock only the timer takes is not a lock.
 *
 * `wx` — O_CREAT|O_EXCL — is the atomicity. Two processes racing to create the
 * same path: exactly one wins, in the kernel, with no window between the check
 * and the create.
 */
export interface Lock {
  release: () => Promise<void>;
}

/**
 * Whether the process that wrote a lock file is still alive.
 *
 * `/proc/<pid>` rather than `kill(pid, 0)`: the latter answers EPERM for a
 * live process owned by another user, which is indistinguishable here from
 * "gone" unless every caller gets the errno handling exactly right.
 */
function holderIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  // existsSync, not Bun.file().exists(): /proc/<pid> is a DIRECTORY, and
  // Bun.file().exists() answers false for a directory. Written that way first,
  // it reported every live holder as dead and handed out a second lock — the
  // exact double-deploy this module exists to stop. Caught by the two tests
  // below, which is why they assert on a live pid rather than only a fake one.
  return existsSync(`/proc/${String(pid)}`);
}

/**
 * Takes the lock, or returns null immediately if someone else holds it. Never
 * waits: a tick that queued behind a human's deploy would run against a repo
 * state that human has since changed, and the next tick is minutes away.
 *
 * A lock file whose writer is dead — an OOM kill, a reboot mid-deploy — is
 * reclaimed rather than honoured forever. Without that, one killed deploy
 * stops every future one silently, and the only symptom is an environment
 * that quietly stops updating.
 */
export async function acquireLock(path: string): Promise<Lock | null> {
  for (const attempt of [1, 2]) {
    try {
      await writeFile(path, `${String(process.pid)}\n`, { flag: 'wx' });
      return {
        release: async () => {
          await unlink(path).catch(() => undefined);
        },
      };
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw e;
      if (attempt === 2) return null;

      const holder = Number.parseInt(await readFile(path, 'utf8').catch(() => ''), 10);
      if (holderIsAlive(holder)) return null;
      // Stale. Remove it and take one more run at it; if someone else wins
      // that race, the second EEXIST returns null rather than looping.
      await unlink(path).catch(() => undefined);
    }
  }
  return null;
}
