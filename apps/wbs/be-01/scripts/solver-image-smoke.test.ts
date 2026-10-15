import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

const SUPPLIED_IMAGE = `registry.example/wbs-be-01@sha256:${'a'.repeat(64)}`;

const SCRIPT = join(import.meta.dir, 'solver-image-smoke.sh');

/**
 * Fake Docker with an image store of one file per tag, so a test can see which tags outlive
 * the smoke. `WBS_FAKE_FAULT` injects one failure; see {@link SmokeFault}.
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
    if [ "\${WBS_FAKE_FAULT:-}" = solver-run ] && [[ "$*" == *'--entrypoint wbs-solver'* ]]; then exit 86; fi
    if [ "\${WBS_FAKE_FAULT:-}" = shared-client-run ] && [[ "$*" == *'shared-person'* ]]; then exit 87; fi
    ;;
  container)
    if [ "\${WBS_FAKE_FAULT:-}" = inspect-container-broken ]; then echo 'permission denied' >&2; exit 1; fi
    if [ "\${WBS_FAKE_FAULT:-}" = caller-rm-fails ] && [[ "$3" == *caller* ]]; then exit 0; fi
    if [ "\${WBS_FAKE_FAULT:-}" != container-rm-fails ] && [ "\${WBS_FAKE_FAULT:-}" != container-rm-ignored ]; then echo 'No such container' >&2; exit 1; fi
    [[ "\${WBS_FAKE_FAULT:-}" == container-rm-* ]] ;;
  rm)
    if [ "\${WBS_FAKE_FAULT:-}" = caller-rm-fails ]; then exit 1; fi
    [ "\${WBS_FAKE_FAULT:-}" != container-rm-fails ] ;;
esac
`;

const FAKE_BUN = `#!/usr/bin/env bash
case "$1" in
  *solver-supervisor-image-host.ts)
    printf '%s\\n' "$*" >> "$WBS_HOST_LOG"
    exec "$WBS_REAL_BUN" -e 'const listener = Bun.listen({ unix: process.argv[1], socket: { data() {} } }); process.on("SIGTERM", () => { listener.stop(true); process.exit(process.env["WBS_FAKE_FAULT"] === "supervisor-stop-fails" ? 1 : 0); })' "$3"
    ;;
esac
`;

/** One injected Docker failure, named for the step that goes wrong. */
type SmokeFault =
  | 'solver-run'
  | 'shared-client-run'
  | 'rm-ignored'
  | 'delete-fails-after-untag'
  | 'inspect-broken'
  | 'orphan-inspect-broken'
  | 'first-inspect-broken'
  | 'container-rm-fails'
  | 'caller-rm-fails'
  | 'inspect-container-broken'
  | 'container-rm-ignored'
  | 'supervisor-stop-fails'
  | 'socket-rmdir-fails'
  | 'inspect-permission';

interface SmokeRun {
  exitCode: number;
  stderr: string;
  dockerCalls: string[];
  hostCalls: string[];
  survivingTags: string[];
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wbs-solver-image-smoke-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeCommand(directory: string, name: string, body: string): void {
  writeFileSync(join(directory, name), body);
  chmodSync(join(directory, name), 0o755);
}

function runSmoke(
  fault?: SmokeFault,
  options: { args?: string[]; supplied?: boolean; missing?: boolean; orphan?: boolean } = {},
): SmokeRun {
  const commands = join(root, 'commands');
  const store = join(root, 'images');
  const dockerLog = join(root, 'docker.log');
  const hostLog = join(root, 'host.log');
  mkdirSync(commands);
  mkdirSync(store);
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
  writeCommand(commands, 'curl', '#!/usr/bin/env bash\n');
  writeCommand(
    commands,
    'mktemp',
    `#!/usr/bin/env bash\nmkdir -p "$WBS_FAKE_SOCKET_DIRECTORY"\nprintf '%s\\n' "$WBS_FAKE_SOCKET_DIRECTORY"\n`,
  );
  const invocation = Bun.spawnSync(
    ['bash', SCRIPT, ...(options.args ?? (options.supplied ? [`--image=${SUPPLIED_IMAGE}`] : []))],
    {
      env: {
        ...process.env,
        PATH: `${commands}:${process.env['PATH'] ?? ''}`,
        WBS_DOCKER_LOG: dockerLog,
        WBS_HOST_LOG: hostLog,
        WBS_FAKE_IMAGE_STORE: store,
        WBS_FAKE_SOCKET_DIRECTORY: join(root, 'socket'),
        WBS_REAL_BUN: process.execPath,
        WBS_RUN_SOLVER_ORPHAN_PROC: options.orphan || !options.supplied ? '1' : '0',
        ...(fault === undefined ? {} : { WBS_FAKE_FAULT: fault }),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  return {
    exitCode: invocation.exitCode,
    stderr: invocation.stderr.toString(),
    dockerCalls: readFileSync(dockerLog, 'utf8').trim().split('\n').filter(Boolean),
    hostCalls: readFileSync(hostLog, 'utf8').trim().split('\n').filter(Boolean),
    survivingTags: readdirSync(store).map((name) => readFileSync(join(store, name), 'utf8')),
  };
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

describe('solver-image-smoke image lifecycle', () => {
  it('tags every image it builds uniquely per attempt and removes all of them after a pass', () => {
    const smoke = runSmoke();

    expect(smoke.stderr).toBe('');
    expect(smoke.exitCode).toBe(0);
    const clients = smoke.dockerCalls.filter((call) =>
      call.includes('solver-supervisor-image-client.ts'),
    );
    expect(clients).toHaveLength(2);
    expect(clients[1]).toContain(' shared-person ');
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
  it('inspects the exact local digest, runs both authenticated clients with it and preserves it', () => {
    const smoke = runSmoke(undefined, { supplied: true });
    expect(smoke.exitCode).toBe(0);
    expect(smoke.stderr).toBe('');
    expect(smoke.dockerCalls[0]).toBe(`image inspect ${SUPPLIED_IMAGE}`);
    expect(smoke.hostCalls).toHaveLength(1);
    expect(smoke.hostCalls[0]).toContain(`solver-supervisor-image-host.ts ${SUPPLIED_IMAGE} `);
    const inspected = smoke.dockerCalls.filter((call) => call.startsWith('container inspect '));
    expect(inspected).toHaveLength(3);
    expect(
      smoke.dockerCalls.filter((call) => call.startsWith('rm ') || call.startsWith('stop ')),
    ).toEqual([]);
    for (const inspection of inspected) {
      expect(inspection).toMatch(
        new RegExp(`^container inspect (wbs-solver-smoke-caller-${UUID}|wbs-solver-${UUID})$`),
      );
    }
    const clients = smoke.dockerCalls.filter((call) =>
      call.includes('solver-supervisor-image-client.ts'),
    );
    expect(clients).toHaveLength(2);
    for (const client of clients) {
      expect(client).toContain(`--entrypoint bun ${SUPPLIED_IMAGE} `);
      expect(client).toContain('--pull=never');
    }
    expect(clients[1]).toContain(' shared-person ');
    expect(smoke.dockerCalls.some((call) => /^(build|tag|push|pull|image rm) /.test(call))).toBe(
      false,
    );
    expect(smoke.survivingTags).toEqual([SUPPLIED_IMAGE]);
  });

  it.each([
    ['tag', ['--image=registry.example/wbs-be-01:latest']],
    ['uppercase digest', [`--image=registry.example/wbs-be-01@sha256:${'A'.repeat(64)}`]],
    ['short digest', ['--image=registry.example/wbs-be-01@sha256:abc']],
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

  it.each(['supervisor-stop-fails', 'socket-rmdir-fails'] as const)(
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
