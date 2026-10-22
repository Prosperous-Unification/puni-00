import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * What one fixture host answers. `refuse` makes the client exit 255 with that diagnostic, as ssh
 * does for a transport fault; otherwise each measuring command prints its file, and a missing file
 * fails the remote command (exit 1).
 */
export interface FixtureHost {
  readonly refuse?: string;
  readonly meminfo?: string;
  readonly df?: string;
  readonly cpu?: string;
}

/** A fixture SSH client, its pinned transport and the hosts it answers for. */
export interface SshFixture {
  readonly directory: string;
  /** A directory holding only the fixture client, named `ssh`, to put first on `PATH`. */
  readonly binDirectory: string;
  readonly sshExecutable: string;
  readonly transportFile: string;
  readonly agentSocket: string;
  /** Every invocation's argv, one line each, appended by the client. */
  readonly invocationsFile: string;
  close(): void;
}

/**
 * Builds a stand-in for the `ssh` client: a POSIX shell script that refuses an invocation without
 * the pinned options, then answers per host from files, or for `env -i …` runs the quoted remote
 * line in a local shell, as sshd would hand it to the user's shell. Paired with a real
 * owner-only transport file, `known_hosts` pinning every host and a listening agent socket, so the
 * adapter's production `readSshTransport` and argv rendering run unchanged.
 */
export function createSshFixture(hosts: Readonly<Record<string, FixtureHost>>): SshFixture {
  const directory = mkdtempSync(join(tmpdir(), 'dash-ssh-fixture-'));
  const binDirectory = join(directory, 'bin');
  mkdirSync(binDirectory);
  const hostsDirectory = join(directory, 'hosts');
  const knownHosts: string[] = [];
  for (const [host, answers] of Object.entries(hosts)) {
    const hostDirectory = join(hostsDirectory, host);
    mkdirSync(hostDirectory, { recursive: true });
    for (const [name, content] of Object.entries(answers)) {
      if (typeof content === 'string') writeFileSync(join(hostDirectory, name), content);
    }
    knownHosts.push(`${host} ssh-ed25519 AAAAC3NzaFixture${host.replaceAll('.', '')}`);
  }
  const knownHostsFile = join(directory, 'known_hosts');
  writeFileSync(knownHostsFile, `${knownHosts.join('\n')}\n`, { mode: 0o600 });
  const transportFile = join(directory, 'transport.json');
  writeFileSync(transportFile, JSON.stringify({ user: 'puni1', knownHostsFile }), { mode: 0o600 });
  const agentSocket = join(directory, 'agent.sock');
  const agent = Bun.listen({ unix: agentSocket, socket: { data: () => undefined } });
  const invocationsFile = join(directory, 'invocations');
  const sshExecutable = join(binDirectory, 'ssh');
  writeFileSync(
    sshExecutable,
    `#!/bin/sh
root='${hostsDirectory}'
printf '%s\\n' "$*" >> '${invocationsFile}'
case " $* " in
  *" StrictHostKeyChecking=yes "*" BatchMode=yes "*) ;;
  *) echo 'fixture ssh: invocation without the pinned options' >&2; exit 254 ;;
esac
while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do shift; done
host="$2"
command="$3"
if [ -f "$root/$host/refuse" ]; then cat "$root/$host/refuse" >&2; exit 255; fi
case "$command" in
  'cat /proc/meminfo') exec cat "$root/$host/meminfo" ;;
  "df -kP -- '"*) exec cat "$root/$host/df" ;;
  'nproc && cat /proc/loadavg') exec cat "$root/$host/cpu" ;;
  true) exit 0 ;;
  'env -i '*) exec sh -c "$command" ;;
  *) echo "fixture ssh: no answer for $command" >&2; exit 127 ;;
esac
`,
  );
  chmodSync(sshExecutable, 0o700);
  return {
    directory,
    binDirectory,
    sshExecutable,
    transportFile,
    agentSocket,
    invocationsFile,
    close: () => {
      agent.stop(true);
      rmSync(directory, { force: true, recursive: true });
    },
  };
}

/** `/proc/meminfo` as the spec's scenario states it: 15 GiB total, 7 GiB available. */
export const MEMINFO_15_7 = `MemTotal:       15976448 kB
MemFree:         1048576 kB
MemAvailable:    7340032 kB
Buffers:          262144 kB
`;

/** `df -kP /tmp`: 100 GiB of 1024-blocks, 40 GiB used. */
export const DF_100_40 = `Filesystem     1024-blocks      Used Available Capacity Mounted on
/dev/nvme0n1p2   104857600  41943040  62914560      41% /
`;
