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
    ;;
  container) [ "\${WBS_FAKE_FAULT:-}" = container-rm-fails ] ;;
  rm) [ "\${WBS_FAKE_FAULT:-}" != container-rm-fails ] ;;
esac
`;

const FAKE_BUN = `#!/usr/bin/env bash
case "$1" in
  *solver-supervisor-image-host.ts)
    exec "$WBS_REAL_BUN" -e 'Bun.listen({ unix: process.argv[1], socket: { data() {} } })' "$3"
    ;;
esac
`;

/** One injected Docker failure, named for the step that goes wrong. */
type SmokeFault =
  | 'solver-run'
  | 'rm-ignored'
  | 'delete-fails-after-untag'
  | 'inspect-broken'
  | 'orphan-inspect-broken'
  | 'first-inspect-broken'
  | 'container-rm-fails';

interface SmokeRun {
  exitCode: number;
  stderr: string;
  dockerCalls: string[];
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

function runSmoke(fault?: SmokeFault): SmokeRun {
  const commands = join(root, 'commands');
  const store = join(root, 'images');
  const dockerLog = join(root, 'docker.log');
  mkdirSync(commands);
  mkdirSync(store);
  writeCommand(commands, 'docker', FAKE_DOCKER);
  writeCommand(commands, 'bun', FAKE_BUN);
  writeCommand(commands, 'curl', '#!/usr/bin/env bash\n');
  writeCommand(
    commands,
    'mktemp',
    `#!/usr/bin/env bash\nmkdir -p "$WBS_FAKE_SOCKET_DIRECTORY"\nprintf '%s\\n' "$WBS_FAKE_SOCKET_DIRECTORY"\n`,
  );
  const invocation = Bun.spawnSync(['bash', SCRIPT], {
    env: {
      ...process.env,
      PATH: `${commands}:${process.env['PATH'] ?? ''}`,
      WBS_DOCKER_LOG: dockerLog,
      WBS_FAKE_IMAGE_STORE: store,
      WBS_FAKE_SOCKET_DIRECTORY: join(root, 'socket'),
      WBS_REAL_BUN: process.execPath,
      WBS_RUN_SOLVER_ORPHAN_PROC: '1',
      ...(fault === undefined ? {} : { WBS_FAKE_FAULT: fault }),
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: invocation.exitCode,
    stderr: invocation.stderr.toString(),
    dockerCalls: readFileSync(dockerLog, 'utf8').trim().split('\n'),
    survivingTags: readdirSync(store).map((name) => readFileSync(join(store, name), 'utf8')),
  };
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

describe('solver-image-smoke image lifecycle', () => {
  it('tags every image it builds uniquely per attempt and removes all of them after a pass', () => {
    const smoke = runSmoke();

    expect(smoke.stderr).toBe('');
    expect(smoke.exitCode).toBe(0);
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
