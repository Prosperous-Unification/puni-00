import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * What one fixture Docker context answers. `refuse` makes every command exit 1 with that
 * diagnostic, as the CLI does when it cannot reach the daemon; otherwise each measuring command
 * prints its transcript, and a missing transcript fails the command (exit 1, `cat`'s error).
 * `ps` maps an instance id to the container ids labelled with it; `stats` lists every running
 * container, labelled or not, as `docker stats` does.
 */
export interface FixtureContext {
  readonly refuse?: string;
  readonly info?: string;
  readonly ps?: Readonly<Record<string, string>>;
  readonly stats?: string;
  readonly df?: string;
  /** Seconds `docker info` takes as the CLI's own process (`exec sleep`). */
  readonly stall?: string;
}

/** A fixture `docker` CLI and the contexts it answers for. */
export interface DockerFixture {
  readonly directory: string;
  /** A directory holding only the fixture CLI, named `docker`, to put first on `PATH`. */
  readonly binDirectory: string;
  readonly dockerExecutable: string;
  /** Every invocation's argv, one line each, appended by the CLI. */
  readonly invocationsFile: string;
  /** The `--label` values and images of every `run`, one line each. */
  readLabels(): string[];
  readImages(): string[];
  close(): void;
}

/**
 * Builds a stand-in for the `docker` CLI: a POSIX shell script that refuses an invocation without
 * a leading `--context <name>` and answers per context from transcript files. A context with no
 * directory fails as the CLI does for an unknown context. `run --rm` records its labels and image,
 * then runs the command words after the image in a local `env -i` holding only the `--env`
 * assignments, as a container would start with only its own environment.
 */
export function createDockerFixture(
  contexts: Readonly<Record<string, FixtureContext>>,
): DockerFixture {
  const directory = mkdtempSync(join(tmpdir(), 'dash-docker-fixture-'));
  const binDirectory = join(directory, 'bin');
  mkdirSync(binDirectory);
  const contextsDirectory = join(directory, 'contexts');
  for (const [context, answers] of Object.entries(contexts)) {
    const contextDirectory = join(contextsDirectory, context);
    mkdirSync(contextDirectory, { recursive: true });
    for (const [name, content] of Object.entries(answers)) {
      if (typeof content === 'string') writeFileSync(join(contextDirectory, name), content);
    }
    for (const [instanceId, ids] of Object.entries(answers.ps ?? {})) {
      writeFileSync(join(contextDirectory, `ps-${instanceId}`), ids);
    }
  }
  const invocationsFile = join(directory, 'invocations');
  const labelsFile = join(directory, 'labels');
  const imagesFile = join(directory, 'images');
  writeFileSync(labelsFile, '');
  writeFileSync(imagesFile, '');
  const dockerExecutable = join(binDirectory, 'docker');
  writeFileSync(
    dockerExecutable,
    `#!/bin/sh
printf '%s\\n' "$*" >> '${invocationsFile}'
if [ "$1" != "--context" ]; then echo 'fixture docker: invocation without --context' >&2; exit 125; fi
context="$2"
shift 2
dir='${contextsDirectory}'/"$context"
if [ ! -d "$dir" ]; then
  echo "Failed to initialize: unable to resolve docker endpoint: context \\"$context\\": context not found" >&2
  exit 1
fi
if [ -f "$dir/refuse" ]; then cat "$dir/refuse" >&2; exit 1; fi
case "$1 $2" in
  'info --format')
    if [ -f "$dir/stall" ]; then exec sleep "$(cat "$dir/stall")"; fi
    exec cat "$dir/info" ;;
  'ps --filter')
    instance="\${3#label=puni.compute-provider=}"
    if [ -f "$dir/ps-$instance" ]; then exec cat "$dir/ps-$instance"; fi
    exit 0 ;;
  'stats --no-stream') exec cat "$dir/stats" ;;
  'system df') exec cat "$dir/df" ;;
  'run --rm')
    shift 2
    count=$#
    image_seen=0
    while [ "$count" -gt 0 ]; do
      word="$1"; shift; count=$((count - 1))
      if [ "$image_seen" = 1 ]; then set -- "$@" "$word"; continue; fi
      case "$word" in
        --label) printf '%s\\n' "$1" >> '${labelsFile}'; shift; count=$((count - 1)) ;;
        --env) set -- "$@" "$1"; shift; count=$((count - 1)) ;;
        *) image_seen=1; printf '%s\\n' "$word" >> '${imagesFile}' ;;
      esac
    done
    exec env -i "$@" ;;
  *) echo "fixture docker: no answer for $*" >&2; exit 127 ;;
esac
`,
  );
  chmodSync(dockerExecutable, 0o700);
  const lines = (path: string) =>
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line.length > 0);
  return {
    directory,
    binDirectory,
    dockerExecutable,
    invocationsFile,
    readLabels: () => lines(labelsFile),
    readImages: () => lines(imagesFile),
    close: () => {
      rmSync(directory, { force: true, recursive: true });
    },
  };
}

/**
 * `docker info --format '{{json .}}'` as a 29.x daemon answers it, trimmed to the fields around
 * the two the adapter reads: 33 227 800 576 B (30 GiB floored) and 24 CPUs.
 */
export const INFO_30_24 = `${JSON.stringify({
  ID: 'c53d8955-62b8-43fe-8277-2d63f606e418',
  Containers: 5,
  ContainersRunning: 4,
  Driver: 'overlayfs',
  NCPU: 24,
  MemTotal: 33_227_800_576,
  DockerRootDir: '/var/lib/docker',
  ServerVersion: '29.7.2',
})}\n`;

/** One `docker stats --no-stream --format '{{json .}}'` row. */
export function statsRow(id: string, memUsage: string, cpuPercent: string): string {
  return JSON.stringify({
    BlockIO: '78.6MB / 3MB',
    CPUPerc: cpuPercent,
    Container: `${id}${'0'.repeat(52)}`,
    ID: id,
    MemPerc: '0.04%',
    MemUsage: `${memUsage} / 30.95GiB`,
    Name: `container-${id}`,
    NetIO: '3.24MB / 126B',
    PIDs: '18',
  });
}

/**
 * A `docker stats` row whose one-shot sample failed, as the CLI prints it for a container removed
 * mid-sample or whose sample timed out.
 */
export function transitRow(id: string): string {
  return JSON.stringify({
    BlockIO: '--',
    CPUPerc: '--',
    Container: id,
    ID: id,
    MemPerc: '--',
    MemUsage: '-- / --',
    Name: '--',
    NetIO: '--',
    PIDs: '--',
  });
}

/** `docker system df --format '{{json .}}'` as the 29.x CLI prints it: 53.794 GB in all, 50 GiB floored. */
export const SYSTEM_DF_50 = `${[
  { Active: '2', Reclaimable: '10.47GB (70%)', Size: '14.83GB', TotalCount: '46', Type: 'Images' },
  {
    Active: '1',
    Reclaimable: '2.924GB (99%)',
    Size: '2.924GB',
    TotalCount: '2',
    Type: 'Containers',
  },
  {
    Active: '1',
    Reclaimable: '17.6GB (86%)',
    Size: '20.42GB',
    TotalCount: '61',
    Type: 'Local Volumes',
  },
  { Active: '0', Reclaimable: '8.887GB', Size: '15.62GB', TotalCount: '159', Type: 'Build Cache' },
]
  .map((row) => JSON.stringify(row))
  .join('\n')}\n`;
