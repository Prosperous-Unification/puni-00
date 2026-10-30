import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { COMPOSED_IMAGE_FIXTURES } from './composed-image-fixtures';

const SUPPLIED_IMAGE = `registry.example/wbs-be-01@sha256:${'a'.repeat(64)}`;

const SCRIPT = join(import.meta.dir, 'solver-image-smoke.sh');

/**
 * Fake Docker with an image store of one file per tag, so a test can see which tags outlive
 * the smoke. Registry and direct baseline containers remain until explicitly removed, modeling
 * retained Docker resources after interrupted clients. `WBS_FAKE_FAULT` injects one failure; see {@link SmokeFault}.
 */
const FAKE_DOCKER = `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$WBS_DOCKER_LOG"
key() { printf '%s' "$1" | sha256sum | cut -c1-64; }
store_path() { printf '%s/%s' "$WBS_FAKE_IMAGE_STORE" "$(key "$1")"; }
last="\${*: -1}"
case "$1" in
  build)
    while [ "$#" -gt 0 ]; do
      if [ "$1" = --tag ]; then printf '%s' "$2" > "$(store_path "$2")"; fi
      shift
    done
    ;;
  tag) printf '%s' "$3" > "$(store_path "$3")" ;;
  image)
    case "$2" in
      inspect)
        if [ "\${WBS_FAKE_FAULT:-}" = first-inspect-broken ] && [ ! -e "$WBS_FAKE_IMAGE_STORE.inspected" ]; then
          touch "$WBS_FAKE_IMAGE_STORE.inspected"
          echo 'Cannot connect to the Docker daemon' >&2
          exit 1
        fi
        if [ "\${WBS_FAKE_FAULT:-}" = inspect-permission ]; then echo 'permission denied' >&2; exit 1; fi
        if [ "\${WBS_FAKE_FAULT:-}" = inspect-broken ] ||
          { [ "\${WBS_FAKE_FAULT:-}" = orphan-inspect-broken ] && [[ "$3" == *solver-orphan-* ]]; }; then
          echo 'Cannot connect to the Docker daemon' >&2
          exit 1
        fi
        [ -e "$(store_path "$3")" ] || { echo "Error response from daemon: No such image: $3" >&2; exit 1; }
        ;;
      rm)
        [ "\${WBS_FAKE_FAULT:-}" = rm-ignored ] || rm "$(store_path "$3")"
        [ "\${WBS_FAKE_FAULT:-}" != delete-fails-after-untag ]
        ;;
    esac
    ;;
  inspect)
    case "$*" in
      *HostPort*) echo 5000 ;;
      *RepoDigests*) echo "127.0.0.1:5000/wbs-be-01@sha256:$(key "$last")" ;;
    esac
    ;;
  run)
    if [[ "$*" == *'registry:2'* ]] || [[ "$*" == *'--entrypoint wbs-solver'* ]]; then
      arguments=("$@")
      for ((index=0; index < $#; index++)); do
        if [ "\${arguments[index]}" = --name ]; then
          printf '%s' "\${arguments[index + 1]}" > "$WBS_FAKE_CONTAINER_STORE/\${arguments[index + 1]}"
        fi
      done
    fi
    if [[ "$*" == *'--entrypoint wbs-solver'* ]]; then
      case "\${WBS_FAKE_FAULT:-}" in
        solver-run-partial) exit 86 ;;
        solver-run-interrupt) kill -TERM "$PPID"; exit 0 ;;
        solver-run-int) kill -INT "$PPID"; exit 0 ;;
      esac
    fi
    if [ "\${WBS_FAKE_FAULT:-}" = solver-run ] && [[ "$*" == *'--entrypoint wbs-solver'* ]]; then exit 86; fi
    if [ "\${WBS_FAKE_FAULT:-}" = connected-feasible-run ] && [[ "$*" == *'connected-feasible'* ]]; then exit 88; fi
    if [ "\${WBS_FAKE_FAULT:-}" = connected-fractional-run ] && [[ "$*" == *'connected-fractional'* ]]; then exit 89; fi
    if [[ "$*" == *'connected-composed'* ]]; then
      cat /proc/sys/kernel/random/uuid >> "$WBS_FAKE_SOCKET_DIRECTORY/composed-attempts"
      if [ "\${WBS_FAKE_FAULT:-}" != caller-late-append ]; then cat /proc/sys/kernel/random/uuid >> "$WBS_FAKE_SOCKET_DIRECTORY/composed-attempts"; fi
      case "\${WBS_FAKE_FAULT:-}" in
        connected-composed-run) exit 90 ;;
        inventory-missing) rm "$WBS_FAKE_SOCKET_DIRECTORY/composed-attempts" ;;
        inventory-incomplete) head -n 1 "$WBS_FAKE_SOCKET_DIRECTORY/composed-attempts" > "$WBS_FAKE_SOCKET_DIRECTORY/first"; mv "$WBS_FAKE_SOCKET_DIRECTORY/first" "$WBS_FAKE_SOCKET_DIRECTORY/composed-attempts" ;;
        inventory-duplicate) head -n 1 "$WBS_FAKE_SOCKET_DIRECTORY/composed-attempts" >> "$WBS_FAKE_SOCKET_DIRECTORY/composed-attempts" ;;
        inventory-malformed) echo invalid >> "$WBS_FAKE_SOCKET_DIRECTORY/composed-attempts" ;;
        inventory-overflow) cat /proc/sys/kernel/random/uuid >> "$WBS_FAKE_SOCKET_DIRECTORY/composed-attempts" ;;
      esac
    fi
    if { [ "\${WBS_FAKE_FAULT:-}" = shared-client-run ] || [ "\${WBS_FAKE_FAULT:-}" = registry-rm-with-client-failure ]; } && [[ "$*" == *'shared-person'* ]]; then exit 87; fi
    ;;
  container)
    if [[ "$3" == *registry* ]]; then
      if [ "\${WBS_FAKE_FAULT:-}" = registry-inspect-permission ]; then echo 'registry permission denied' >&2; exit 1; fi
      [ -e "$WBS_FAKE_CONTAINER_STORE/$3" ] && exit 0
      echo 'No such container' >&2; exit 1
    fi
    if [[ "$3" == *baseline* ]]; then
      [ -e "$WBS_FAKE_CONTAINER_STORE/$3" ] && exit 0
      echo 'No such container' >&2; exit 1
    fi
    if [ "\${WBS_FAKE_FAULT:-}" = inspect-container-broken ]; then echo 'permission denied' >&2; exit 1; fi
    if [ "\${WBS_FAKE_FAULT:-}" = caller-late-append ] && [[ "$3" == *caller* ]] && [ ! -e "$WBS_FAKE_CONTAINER_STORE/caller-stopped" ]; then exit 0; fi
    if [ "\${WBS_FAKE_FAULT:-}" = caller-rm-fails ] && [[ "$3" == *caller* ]]; then exit 0; fi
    if [ "\${WBS_FAKE_FAULT:-}" != container-rm-fails ] && [ "\${WBS_FAKE_FAULT:-}" != container-rm-ignored ]; then echo 'No such container' >&2; exit 1; fi
    [[ "\${WBS_FAKE_FAULT:-}" == container-rm-* ]] ;;
  rm)
    if [[ "$last" == *registry* ]]; then
      if { [ "\${WBS_FAKE_FAULT:-}" = registry-rm-fails ] || [ "\${WBS_FAKE_FAULT:-}" = registry-rm-with-client-failure ]; }; then echo 'registry removal denied' >&2; exit 1; fi
      if [ "\${WBS_FAKE_FAULT:-}" = registry-rm-ignored ]; then exit 0; fi
      rm "$WBS_FAKE_CONTAINER_STORE/$last"; exit 0
    fi
    if [[ "$last" == *baseline* ]]; then rm "$WBS_FAKE_CONTAINER_STORE/$last"; exit 0; fi
    if [ "\${WBS_FAKE_FAULT:-}" = caller-late-append ] && [[ "$last" == *caller* ]]; then
      printf '66666666-7777-4888-8999-aaaaaaaaaaaa\\n' >> "$WBS_FAKE_SOCKET_DIRECTORY/composed-attempts"
      touch "$WBS_FAKE_CONTAINER_STORE/caller-stopped"
    fi
    if [ "\${WBS_FAKE_FAULT:-}" = caller-rm-fails ]; then exit 1; fi
    [ "\${WBS_FAKE_FAULT:-}" != container-rm-fails ] ;;
esac
`;

const FAKE_BUN = `#!/usr/bin/env bash
case "$1" in
  *composed-image-fixtures.ts)
    printf '%s\\n' "$3" > "$WBS_FIXTURE_STAGE_LOG"
    exec "$WBS_REAL_BUN" "$@"
    ;;
  *solver-supervisor-image-host.ts)
    printf '%s\\n' "$*" >> "$WBS_HOST_LOG"
    exec "$WBS_REAL_BUN" -e 'const listener = Bun.listen({ unix: process.argv[1], socket: { data() {} } }); process.on("SIGTERM", () => { listener.stop(true); process.exit(process.env["WBS_FAKE_FAULT"] === "supervisor-stop-fails" ? 1 : 0); })' "$3"
    ;;
esac
`;

/** One injected Docker failure, named for the step that goes wrong. */
type SmokeFault =
  | 'solver-run'
  | 'solver-run-partial'
  | 'solver-run-interrupt'
  | 'solver-run-int'
  | 'registry-rm-with-client-failure'
  | 'registry-rm-fails'
  | 'registry-rm-ignored'
  | 'registry-inspect-permission'
  | 'fixture-delete-fails-after-remove'
  | 'fixture-rm-ignored'
  | 'shared-client-run'
  | 'connected-composed-run'
  | 'inventory-rm-fails'
  | 'inventory-missing'
  | 'inventory-unreadable'
  | 'inventory-incomplete'
  | 'inventory-duplicate'
  | 'inventory-malformed'
  | 'inventory-overflow'
  | 'connected-feasible-run'
  | 'connected-fractional-run'
  | 'rm-ignored'
  | 'delete-fails-after-untag'
  | 'inspect-broken'
  | 'orphan-inspect-broken'
  | 'first-inspect-broken'
  | 'container-rm-fails'
  | 'caller-rm-fails'
  | 'caller-late-append'
  | 'inspect-container-broken'
  | 'container-rm-ignored'
  | 'supervisor-kill-fails'
  | 'supervisor-stop-fails'
  | 'socket-rmdir-fails'
  | 'inspect-permission';

interface SmokeRun {
  exitCode: number;
  stderr: string;
  stdout: string;
  retainedResources: string;
  retainedAttempts: string;
  dockerCalls: string[];
  hostCalls: string[];
  survivingTags: string[];
  survivingContainers: string[];
  socketExists: boolean;
  fixtureDirectory: string | null;
  fixturesExist: boolean;
}

let root: string;
let retainedDirectory: string | undefined;
let retainedSocket: string | undefined;
const stagedFixtureRoots: string[] = [];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wbs-solver-image-smoke-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  for (const directory of stagedFixtureRoots.splice(0))
    rmSync(directory, { recursive: true, force: true });
  if (retainedSocket) {
    rmSync(retainedSocket, { recursive: true, force: true });
    retainedSocket = undefined;
  }
  if (retainedDirectory) {
    rmSync(retainedDirectory, { recursive: true, force: true });
    retainedDirectory = undefined;
  }
});

function writeCommand(directory: string, name: string, body: string): void {
  writeFileSync(join(directory, name), body);
  chmodSync(join(directory, name), 0o755);
}

function runSmoke(
  fault?: SmokeFault,
  options: {
    args?: string[];
    supplied?: boolean;
    missing?: boolean;
    orphan?: boolean;
    retain?: boolean;
    cleanupToken?: string;
    script?: string;
  } = {},
): SmokeRun {
  const commands = join(root, 'commands');
  const store = join(root, 'images');
  const containers = join(root, 'containers');
  const dockerLog = join(root, 'docker.log');
  const hostLog = join(root, 'host.log');
  const fixtureLog = join(root, 'fixture-stage.log');
  mkdirSync(commands);
  mkdirSync(store);
  mkdirSync(containers);
  writeFileSync(dockerLog, '');
  writeFileSync(hostLog, '');
  if (options.supplied && !options.missing) {
    writeFileSync(
      join(store, new Bun.CryptoHasher('sha256').update(SUPPLIED_IMAGE).digest('hex')),
      SUPPLIED_IMAGE,
    );
  }
  writeCommand(commands, 'docker', FAKE_DOCKER);
  writeCommand(commands, 'bun', FAKE_BUN);
  writeCommand(
    commands,
    'rmdir',
    '#!/usr/bin/env bash\nif [ "${WBS_FAKE_FAULT:-}" = socket-rmdir-fails ]; then exit 1; fi\nexec /usr/bin/rmdir "$@"\n',
  );
  writeCommand(
    commands,
    'rm',
    '#!/usr/bin/env bash\nif [ "${WBS_FAKE_FAULT:-}" = inventory-rm-fails ] && [[ "$*" == *composed-attempts* ]]; then exit 1; fi\nif [[ "$*" == *wbs-composed-fixtures.* ]]; then\n  if [ "${WBS_FAKE_FAULT:-}" = fixture-rm-ignored ]; then exit 0; fi\n  if [ "${WBS_FAKE_FAULT:-}" = fixture-delete-fails-after-remove ]; then /usr/bin/rm "$@"; exit 1; fi\nfi\nexec /usr/bin/rm "$@"\n',
  );
  writeCommand(commands, 'curl', '#!/usr/bin/env bash\n');
  writeCommand(
    commands,
    'cat',
    '#!/usr/bin/env bash\nif [ "${WBS_FAKE_FAULT:-}" = inventory-unreadable ] && [[ "$*" == *composed-attempts* ]]; then exit 1; fi\nexec /usr/bin/cat "$@"\n',
  );
  writeCommand(
    commands,
    'mktemp',
    `#!/usr/bin/env bash\nif [[ "$*" == *wbs-solver-smoke.* ]]; then\n  mkdir -p "$WBS_FAKE_SOCKET_DIRECTORY"\n  printf '%s\\n' "$WBS_FAKE_SOCKET_DIRECTORY"\nelse\n  exec /usr/bin/mktemp "$@"\nfi\n`,
  );
  const socketDirectory = options.retain
    ? `/run/user/${String(process.getuid?.())}/wbs-solver-smoke.11111111-2222-4333-8444-555555555555`
    : join(root, 'socket');
  if (options.retain) retainedSocket = socketDirectory;
  const bashEnvironment = join(root, 'bash-env');
  writeFileSync(
    bashEnvironment,
    `kill() {
    if [ "\${WBS_FAKE_FAULT:-}" = supervisor-kill-fails ] && [ "$#" -eq 1 ]; then
      builtin kill "$@"
      echo 'supervisor termination denied' >&2
      return 1
    fi
    builtin kill "$@"
  }
`,
  );
  const retained = options.retain
    ? `/run/user/${String(process.getuid?.())}/wbs-solver-proof-test-${root.split('/').at(-1) ?? 'missing'}`
    : join(root, 'retained');
  if (options.retain) {
    mkdirSync(retained, { mode: 0o700 });
    retainedDirectory = retained;
  }
  const invocation = Bun.spawnSync(
    [
      'bash',
      options.script ?? SCRIPT,
      ...(options.args ?? (options.supplied ? [`--image=${SUPPLIED_IMAGE}`] : [])),
    ],
    {
      env: {
        ...process.env,
        BASH_ENV: bashEnvironment,
        PATH: `${commands}:${process.env['PATH'] ?? ''}`,
        WBS_DOCKER_LOG: dockerLog,
        WBS_HOST_LOG: hostLog,
        WBS_FIXTURE_STAGE_LOG: fixtureLog,
        WBS_FAKE_IMAGE_STORE: store,
        WBS_FAKE_CONTAINER_STORE: containers,
        WBS_FAKE_SOCKET_DIRECTORY: socketDirectory,
        WBS_REAL_BUN: process.execPath,
        WBS_SOLVER_SMOKE_CLEANUP_TOKEN:
          options.cleanupToken ?? '11111111-2222-4333-8444-555555555555',
        ...(options.retain ? { WBS_SOLVER_SMOKE_INVENTORY: retained } : {}),
        WBS_RUN_SOLVER_ORPHAN_PROC: options.orphan || !options.supplied ? '1' : '0',
        ...(fault === undefined ? {} : { WBS_FAKE_FAULT: fault }),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const fixtureDirectory = existsSync(fixtureLog)
    ? dirname(readFileSync(fixtureLog, 'utf8').trim())
    : null;
  if (fixtureDirectory !== null) stagedFixtureRoots.push(fixtureDirectory);
  return {
    fixtureDirectory,
    fixturesExist: fixtureDirectory !== null && existsSync(fixtureDirectory),
    exitCode: invocation.exitCode,
    stderr: invocation.stderr.toString(),
    stdout: invocation.stdout.toString(),
    retainedResources: options.retain ? readFileSync(join(retained, 'resources'), 'utf8') : '',
    retainedAttempts: options.retain ? readFileSync(join(retained, 'attempts'), 'utf8') : '',
    dockerCalls: readFileSync(dockerLog, 'utf8').trim().split('\n').filter(Boolean),
    hostCalls: readFileSync(hostLog, 'utf8').trim().split('\n').filter(Boolean),
    survivingContainers: readdirSync(containers).filter((name) => name !== 'caller-stopped'),
    socketExists: existsSync(socketDirectory),
    survivingTags: readdirSync(store).map((name) => readFileSync(join(store, name), 'utf8')),
  };
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

describe('solver-image-smoke image lifecycle', () => {
  it('tags every image it builds uniquely per attempt and removes all of them after a pass', () => {
    const smoke = runSmoke();

    expect(smoke.stderr).toBe('');
    expect(smoke.exitCode).toBe(0);
    const clients = smoke.dockerCalls.filter(
      (call) =>
        call.includes('solver-supervisor-image-client.ts') ||
        call.includes('solver-composed-image-client.ts'),
    );
    expect(clients).toHaveLength(5);
    expect(clients[1]).toContain(' shared-person ');
    expect(clients[2]).toContain(' connected-feasible ');
    expect(clients[3]).toContain(' connected-fractional ');
    expect(clients[4]).toContain(' connected-composed ');
    expect(clients[4]).toContain('/src/testing/solver-composed-image-client.ts');
    if (smoke.fixtureDirectory === null) throw new Error('fixture staging omitted its path');
    expect(clients[4]).toContain(
      `--volume ${smoke.fixtureDirectory}/files:/app/apps/wbs/be-01/src/testing:ro`,
    );
    for (const client of clients.slice(0, 4)) expect(client).not.toContain('/src/testing');
    expect(smoke.fixturesExist).toBe(false);
    expect(new Set(clients.map((client) => client.split(' ').at(-1))).size).toBe(5);
    const removed = smoke.dockerCalls.filter((call) => call.startsWith('image rm '));
    expect(removed).toHaveLength(3);
    expect(removed[0]).toMatch(
      new RegExp(`^image rm 127\\.0\\.0\\.1:5000/wbs-be-01:solver-orphan-${UUID}$`),
    );
    expect(removed[1]).toMatch(
      new RegExp(`^image rm 127\\.0\\.0\\.1:5000/wbs-be-01:solver-smoke-${UUID}$`),
    );
    expect(removed[2]).toMatch(new RegExp(`^image rm wbs-be-01:solver-smoke-${UUID}$`));
    // Proof: with remove_created_images dropped from cleanup, all four cases here failed and
    // this one saw all three tags survive.
    expect(smoke.survivingTags).toEqual([]);
  });

  it('removes the images it built when the smoke fails', () => {
    const smoke = runSmoke('solver-run');

    expect(smoke.exitCode).toBe(86);
    // Proof: with cleanup removing images only after a passing smoke, this failing smoke left
    // `wbs-be-01:solver-smoke-<uuid>` here.
    expect(smoke.survivingTags).toEqual([]);
  });

  it('fails and cleans up when the shared-person client fails', () => {
    const smoke = runSmoke('shared-client-run');
    expect(smoke.exitCode).toBe(87);
    expect(smoke.survivingTags).toEqual([]);
  });

  it('fails a passing smoke when an image outlives it', () => {
    const smoke = runSmoke('rm-ignored');

    // Proof: with the survivor check removed from remove_created_images, this smoke exited 0
    // while three tags stayed in the fake store.
    expect(smoke.exitCode).toBe(1);
    expect(smoke.stderr).toContain('images outlived the smoke');
    expect(smoke.survivingTags).toHaveLength(3);
  });

  it('fails a passing smoke when Docker drops a tag but cannot delete its image', () => {
    const smoke = runSmoke('delete-fails-after-untag');

    // Proof: with a failed `image rm` only logged, this smoke exited 0 once the tags were gone.
    expect(smoke.exitCode).toBe(1);
    expect(smoke.stderr).toContain('could not remove image');
    expect(smoke.survivingTags).toEqual([]);
  });

  it('still removes its images when the solver container cannot be removed', () => {
    const smoke = runSmoke('container-rm-fails');

    expect(smoke.survivingTags).toEqual([]);
    expect(smoke.exitCode).toBe(1);
    expect(smoke.stderr).toContain('could not remove container wbs-solver-');
  });

  it('fails when Docker cannot say whether an image is gone', () => {
    const smoke = runSmoke('inspect-broken');

    // Proof: treating every inspect failure as absence let this smoke exit 0.
    expect(smoke.exitCode).toBe(1);
    expect(smoke.stderr).toContain('cannot inspect image 127.0.0.1:5000/wbs-be-01:solver-orphan-');
  });

  it('fails a smoke whose image inspect failed once even when every image is gone', () => {
    const smoke = runSmoke('first-inspect-broken');

    expect(smoke.survivingTags).toEqual([]);
    expect(smoke.exitCode).toBe(1);
    expect(smoke.stderr).toContain('cannot inspect image 127.0.0.1:5000/wbs-be-01:solver-orphan-');
  });

  it('keeps removing the other images when one cannot be inspected', () => {
    const smoke = runSmoke('orphan-inspect-broken');

    // Proof: with an inspect failure ending cleanup (`exit 1` in probe_image), all three tags
    // stayed here.
    expect(smoke.survivingTags).toEqual([]);
    expect(smoke.exitCode).toBe(1);
    expect(smoke.stderr).toContain('cannot inspect image 127.0.0.1:5000/wbs-be-01:solver-orphan-');
  });
});

describe('solver-image-smoke supplied immutable image', () => {
  it('inspects the exact local digest, runs all five authenticated clients with it and preserves it', () => {
    const smoke = runSmoke(undefined, { supplied: true });
    expect(smoke.exitCode).toBe(0);
    expect(smoke.stderr).toBe('');
    expect(smoke.dockerCalls[0]).toBe(`image inspect ${SUPPLIED_IMAGE}`);
    expect(smoke.hostCalls).toHaveLength(1);
    expect(smoke.hostCalls[0]).toContain(`solver-supervisor-image-host.ts ${SUPPLIED_IMAGE} `);
    const inspected = smoke.dockerCalls.filter((call) => call.startsWith('container inspect '));
    expect(inspected).toHaveLength(7);
    expect(
      smoke.dockerCalls.filter((call) => call.startsWith('rm ') || call.startsWith('stop ')),
    ).toEqual([]);
    for (const inspection of inspected) {
      expect(inspection).toMatch(
        new RegExp(`^container inspect (wbs-solver-smoke-caller-${UUID}|wbs-solver-${UUID})$`),
      );
    }
    const clients = smoke.dockerCalls.filter(
      (call) =>
        call.includes('solver-supervisor-image-client.ts') ||
        call.includes('solver-composed-image-client.ts'),
    );
    expect(clients).toHaveLength(5);
    for (const client of clients) {
      expect(client).toContain(`--entrypoint bun ${SUPPLIED_IMAGE} `);
      expect(client).toContain('--pull=never');
    }
    expect(clients[1]).toContain(' shared-person ');
    expect(clients[2]).toContain(' connected-feasible ');
    expect(clients[3]).toContain(' connected-fractional ');
    expect(clients[4]).toContain(' connected-composed ');
    expect(clients[4]).toContain('/src/testing/solver-composed-image-client.ts');
    if (smoke.fixtureDirectory === null) throw new Error('fixture staging omitted its path');
    expect(clients[4]).toContain(
      `--volume ${smoke.fixtureDirectory}/files:/app/apps/wbs/be-01/src/testing:ro`,
    );
    for (const client of clients.slice(0, 4)) expect(client).not.toContain('/src/testing');
    expect(smoke.fixturesExist).toBe(false);
    expect(new Set(clients.map((client) => client.split(' ').at(-1))).size).toBe(5);
    expect(smoke.dockerCalls.some((call) => /^(build|tag|push|pull|image rm) /.test(call))).toBe(
      false,
    );
    expect(smoke.survivingTags).toEqual([SUPPLIED_IMAGE]);
  });

  it.each([
    ['tag', ['--image=registry.example/wbs-be-01:latest']],
    ['uppercase digest', [`--image=registry.example/wbs-be-01@sha256:${'A'.repeat(64)}`]],
    ['short digest', ['--image=registry.example/wbs-be-01@sha256:abc']],
    ['namespace without registry', [`--image=library/backend@sha256:${'a'.repeat(64)}`]],
    ['nested namespace without registry', [`--image=team/nested/backend@sha256:${'a'.repeat(64)}`]],
    ['single-label namespace without port', [`--image=registry/backend@sha256:${'a'.repeat(64)}`]],
    ['missing registry', [`--image=wbs-be-01@sha256:${'a'.repeat(64)}`]],
    ['duplicate', [`--image=${SUPPLIED_IMAGE}`, `--image=${SUPPLIED_IMAGE}`]],
    ['unknown', ['--unknown']],
    ['extra argument', [`--image=${SUPPLIED_IMAGE}`, 'extra']],
    ['tag before digest', [`--image=registry.example/wbs-be-01:latest@sha256:${'a'.repeat(64)}`]],
  ])('rejects %s before Docker', (_name, args) => {
    const smoke = runSmoke(undefined, { supplied: true, args });
    expect(smoke.exitCode).not.toBe(0);
    expect(smoke.dockerCalls).toEqual([]);
  });

  it.each([
    'registry.example',
    'docker.io',
    'localhost',
    'localhost:5000',
    'registry:5000',
    '127.0.0.1:5000',
  ])('accepts explicit registry %s through the local inspection boundary', (registry) => {
    const image = `${registry}/team/backend@sha256:${'a'.repeat(64)}`;
    const smoke = runSmoke(undefined, {
      supplied: true,
      args: [`--image=${image}`],
      missing: true,
    });
    expect(smoke.exitCode).not.toBe(0);
    expect(smoke.stderr).toContain('supplied image is not locally available');
    expect(smoke.dockerCalls).toEqual([`image inspect ${image}`]);
  });

  it('rejects the orphan derivative build flag before Docker', () => {
    const smoke = runSmoke(undefined, { supplied: true, orphan: true });
    expect(smoke.exitCode).not.toBe(0);
    expect(smoke.dockerCalls).toEqual([]);
  });

  it('refuses a missing digest without a build or pull fallback', () => {
    const smoke = runSmoke(undefined, { supplied: true, missing: true });
    expect(smoke.exitCode).not.toBe(0);
    expect(smoke.stderr).toContain('supplied image is not locally available');
    expect(smoke.dockerCalls).toEqual([`image inspect ${SUPPLIED_IMAGE}`]);
  });

  it('distinguishes daemon refusal from a missing digest', () => {
    const smoke = runSmoke('inspect-broken', { supplied: true });
    expect(smoke.exitCode).not.toBe(0);
    expect(smoke.stderr).toContain('cannot inspect image');
    expect(smoke.stderr).not.toContain('not locally available');
    expect(smoke.dockerCalls).toEqual([`image inspect ${SUPPLIED_IMAGE}`]);
  });

  it('refuses Docker permission failure without calling it a missing image', () => {
    const smoke = runSmoke('inspect-permission', { supplied: true });
    expect(smoke.exitCode).not.toBe(0);
    expect(smoke.stderr).toContain('permission denied');
    expect(smoke.stderr).not.toContain('not locally available');
    expect(smoke.dockerCalls).toEqual([`image inspect ${SUPPLIED_IMAGE}`]);
  });

  it.each(['supervisor-kill-fails', 'supervisor-stop-fails', 'socket-rmdir-fails'] as const)(
    'refuses temporary runtime cleanup failure %s',
    (fault) => {
      const smoke = runSmoke(fault, { supplied: true });
      expect(smoke.exitCode).not.toBe(0);
      expect(smoke.survivingTags).toEqual([SUPPLIED_IMAGE]);
    },
  );

  it('propagates a shared-person failure and preserves the supplied image', () => {
    const smoke = runSmoke('shared-client-run', { supplied: true });
    expect(smoke.exitCode).toBe(87);
    expect(smoke.survivingTags).toEqual([SUPPLIED_IMAGE]);
  });

  it.each([
    'container-rm-fails',
    'caller-rm-fails',
    'inspect-container-broken',
    'container-rm-ignored',
  ] as const)('refuses cleanup failure %s while preserving the supplied image', (fault) => {
    const smoke = runSmoke(fault, { supplied: true });
    expect(smoke.exitCode).not.toBe(0);
    expect(smoke.survivingTags).toEqual([SUPPLIED_IMAGE]);
    expect(smoke.stderr).toContain('container');
  });
});

for (const supplied of [false, true]) {
  it.each([
    ['connected-feasible-run', 88],
    ['connected-fractional-run', 89],
    ['connected-composed-run', 90],
  ] as const)(
    `fails and cleans up %s in ${supplied ? 'supplied' : 'built'} image mode`,
    (fault, code) => {
      const smoke = runSmoke(fault, { supplied });
      expect(smoke.exitCode).toBe(code);
      expect(smoke.survivingTags).toEqual(supplied ? [SUPPLIED_IMAGE] : []);
      expect(
        smoke.dockerCalls.some((call) => call.startsWith('container inspect wbs-solver-')),
      ).toBe(true);
    },
  );
}

for (const supplied of [false, true]) {
  it.each([
    'inventory-rm-fails',
    'inventory-missing',
    'inventory-unreadable',
    'inventory-incomplete',
    'inventory-duplicate',
    'inventory-malformed',
    'inventory-overflow',
  ] as const)(`refuses %s in ${supplied ? 'supplied' : 'built'} image mode`, (fault) => {
    const smoke = runSmoke(fault, { supplied });
    expect(smoke.exitCode).not.toBe(0);
    const reason =
      fault === 'inventory-rm-fails'
        ? 'could not remove composed attempt inventory'
        : fault === 'inventory-missing' || fault === 'inventory-unreadable'
          ? 'inventory is unreadable'
          : fault === 'inventory-duplicate' || fault === 'inventory-malformed'
            ? 'inventory is malformed or duplicated'
            : 'inventory must contain Pri and Time exactly once';
    expect(smoke.stderr).toContain(reason);
    expect(smoke.survivingTags).toEqual(supplied ? [SUPPLIED_IMAGE] : []);
  });
}

describe('built image owned cleanup', () => {
  it.each([
    ['supervisor-kill-fails', 'supervisor termination denied'],
    ['supervisor-stop-fails', 'temporary supervisor failed during cleanup'],
    ['registry-rm-fails', 'registry removal denied'],
    ['registry-rm-ignored', 'container outlived the smoke: wbs-solver-smoke-registry-'],
    ['registry-inspect-permission', 'registry permission denied'],
  ] as const)('refuses %s while finishing other cleanup', (fault, reason) => {
    const smoke = runSmoke(fault);
    expect(smoke.exitCode).toBe(1);
    expect(smoke.stderr).toContain(reason);
    expect(smoke.survivingTags).toEqual([]);
    expect(
      smoke.dockerCalls.some((call) =>
        call.startsWith('container inspect wbs-solver-smoke-caller-'),
      ),
    ).toBe(true);
    expect(smoke.survivingContainers.filter((name) => name.includes('baseline'))).toEqual([]);
    expect(smoke.socketExists).toBe(false);
  });

  it.each([
    ['solver-run-partial', 86],
    ['solver-run-interrupt', 143],
    ['solver-run-int', 130],
  ] as const)('releases the named direct baseline after %s', (fault, code) => {
    const smoke = runSmoke(fault);
    expect(smoke.exitCode).toBe(code);
    const baseline = smoke.dockerCalls.find((call) => call.includes('--entrypoint wbs-solver'));
    expect(baseline).toMatch(new RegExp('--name wbs-solver-smoke-baseline-' + UUID));
    expect(smoke.survivingContainers).toEqual([]);
    expect(smoke.socketExists).toBe(false);
    expect(smoke.survivingTags).toEqual([]);
  });

  it('uses UUID names and proves the registry and baseline are absent', () => {
    const smoke = runSmoke();
    expect(smoke.exitCode).toBe(0);
    expect(smoke.survivingContainers).toEqual([]);
    for (const role of ['registry', 'baseline', 'caller']) {
      expect(
        smoke.dockerCalls.some((call) =>
          new RegExp('^container inspect wbs-solver-smoke-' + role + '-' + UUID + '$').test(call),
        ),
      ).toBe(true);
    }
  });
});

it('preserves the client failure while reporting registry removal failure', () => {
  const smoke = runSmoke('registry-rm-with-client-failure');
  expect(smoke.exitCode).toBe(87);
  expect(smoke.stderr).toContain('registry removal denied');
  expect(smoke.stderr).toContain('could not remove container');
  expect(smoke.survivingTags).toEqual([]);
  expect(smoke.survivingContainers).toHaveLength(1);
  expect(smoke.survivingContainers[0]).toContain('registry');
});

for (const supplied of [false, true]) {
  it(`issues exact cleanup receipt after failing client in ${supplied ? 'supplied' : 'built'} mode`, () => {
    const smoke = runSmoke('connected-composed-run', { supplied });
    expect(smoke.exitCode).toBe(90);
    expect(smoke.stdout.trim().split('\n').at(-1)).toBe(
      '[solver-image-smoke] cleanup-complete 11111111-2222-4333-8444-555555555555',
    );
  });
  it(`withholds cleanup receipt on cleanup denial in ${supplied ? 'supplied' : 'built'} mode`, () => {
    const smoke = runSmoke('caller-rm-fails', { supplied });
    expect(smoke.exitCode).not.toBe(0);
    expect(smoke.stdout).not.toContain('[solver-image-smoke] cleanup-complete');
  });
}

it('retains exact resources and admission tokens after removable socket inventory cleanup', () => {
  const smoke = runSmoke('connected-composed-run', { supplied: true, retain: true });
  expect(smoke.exitCode).toBe(90);
  expect(smoke.socketExists).toBe(false);
  expect(smoke.retainedResources).toStartWith(
    'invocation\t11111111-2222-4333-8444-555555555555\nattempt\t',
  );
  expect(smoke.retainedResources).toContain('container\twbs-solver-smoke-caller-');
  expect(smoke.retainedResources).not.toContain('image\t');
  expect(smoke.retainedResources).toMatch(/supervisor\t[0-9]+:[0-9]+\n/);
  expect(smoke.retainedResources).toContain(
    'supervisor-starting\t11111111-2222-4333-8444-555555555555',
  );
  expect(smoke.retainedAttempts.trim().split('\n')).toHaveLength(2);
});
it('refuses malformed cleanup token before Docker', () => {
  const smoke = runSmoke(undefined, { supplied: true, cleanupToken: 'not-a-uuid' });
  expect(smoke.exitCode).not.toBe(0);
  expect(smoke.stderr).toContain('cleanup receipt token must be a UUID');
  expect(smoke.dockerCalls).toEqual([]);
});

it('collects late admission only after caller stop without recreating its hardlink', () => {
  const smoke = runSmoke('caller-late-append', { supplied: true, retain: true });
  expect(smoke.exitCode).toBe(0);
  expect(smoke.retainedAttempts).toContain('66666666-7777-4888-8999-aaaaaaaaaaaa\n');
  expect(smoke.dockerCalls).toContain(
    'container inspect wbs-solver-66666666-7777-4888-8999-aaaaaaaaaaaa',
  );
  expect(smoke.socketExists).toBe(false);
});
it('retains composed inventory pathname when caller cannot stop', () => {
  const smoke = runSmoke('caller-rm-fails', { supplied: true });
  expect(smoke.exitCode).not.toBe(0);
  expect(existsSync(join(root, 'socket', 'composed-attempts'))).toBe(true);
  expect(smoke.socketExists).toBe(true);
});

/** A production-script checkout with only the exact test closure needed before Docker starts. */
function fixtureFailureScript(
  fault: 'missing' | 'unreadable' | 'symlink' | 'corrupt' | 'unlisted',
) {
  const repository = join(root, 'stage-source');
  const scripts = join(repository, 'apps/wbs/be-01/scripts');
  const testing = join(repository, 'apps/wbs/be-01/src/testing');
  mkdirSync(scripts, { recursive: true });
  mkdirSync(testing, { recursive: true });
  copyFileSync(SCRIPT, join(scripts, 'solver-image-smoke.sh'));
  const helperPath = join(scripts, 'composed-image-fixtures.ts');
  let helper = readFileSync(join(import.meta.dir, 'composed-image-fixtures.ts'), 'utf8');
  for (const name of COMPOSED_IMAGE_FIXTURES)
    copyFileSync(join(import.meta.dir, '../src/testing', name), join(testing, name));
  const fixture = join(testing, 'app-fixture.ts');
  if (fault === 'missing' || fault === 'symlink') {
    rmSync(fixture);
    if (fault === 'symlink')
      symlinkSync(join(import.meta.dir, '../src/testing/app-fixture.ts'), fixture);
  } else if (fault === 'unreadable') chmodSync(fixture, 0);
  else {
    writeFileSync(join(repository, 'fault.ts'), 'controlled copied-fixture fault');
    const copyFault =
      fault === 'corrupt'
        ? "copyFileSync(join(repository, 'fault.ts'), destination);"
        : "copyFileSync(join(repository, 'fault.ts'), join(directory, 'unlisted.ts'));";
    helper = helper.replace(
      'stageComposedImageFixtures(repository, directory)',
      `stageComposedImageFixtures(repository, directory, (source, destination) => {
        copyFileSync(source, destination);
        ${copyFault}
      })`,
    );
  }
  writeFileSync(helperPath, helper);
  return join(scripts, 'solver-image-smoke.sh');
}

for (const supplied of [false, true]) {
  it.each(['missing', 'unreadable', 'symlink', 'corrupt', 'unlisted'] as const)(
    `refuses %s external fixtures before Docker in ${supplied ? 'supplied' : 'built'} mode`,
    (fault) => {
      const smoke = runSmoke(undefined, { supplied, script: fixtureFailureScript(fault) });
      expect(smoke.exitCode).not.toBe(0);
      expect(smoke.dockerCalls).toEqual([]);
      expect(smoke.hostCalls).toEqual([]);
      expect(smoke.fixturesExist).toBe(false);
    },
  );
}

for (const supplied of [false, true]) {
  it.each(['fixture-delete-fails-after-remove', 'fixture-rm-ignored'] as const)(
    `refuses external fixture cleanup fault %s in ${supplied ? 'supplied' : 'built'} mode`,
    (fault) => {
      const smoke = runSmoke(fault, { supplied });
      expect(smoke.exitCode).not.toBe(0);
      expect(smoke.stdout).not.toContain('[solver-image-smoke] cleanup-complete');
      expect(smoke.stderr).toContain('composed fixtures');
      expect(smoke.fixturesExist).toBe(fault === 'fixture-rm-ignored');
      expect(smoke.survivingTags).toEqual(supplied ? [SUPPLIED_IMAGE] : []);
    },
  );
}
