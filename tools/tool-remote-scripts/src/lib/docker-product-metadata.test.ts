import { rejects, throws } from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect } from 'bun:test';
import { test } from 'bun:test';

import {
  type ProductMetadataChild,
  ProductMetadataCleanupUnproved,
  readProductMetadata,
  spawnProductMetadata,
} from './docker-product-metadata';
import { withDependencyOwner } from './edge-ownership';
import { envLayout } from './env';

function fixture() {
  const root = scratchSync('product-metadata-');
  writeFileSync(`${root}/edge.lock`, '');
  const layout = { ...envLayout('prod'), root, stateDir: root };
  return { root, layout, plan: { sha: 'a'.repeat(40), layouts: [layout] } };
}

function child(stdout: string, stderr = '', code = 0): ProductMetadataChild {
  const stream = (value: string) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(value));
        controller.close();
      },
    });
  return {
    stdout: stream(stdout),
    stderr: stream(stderr),
    exited: Promise.resolve(code),
    kill: () => {
      throw new Error('unexpected metadata child kill');
    },
  };
}

function localChild(program: string): {
  child: ProductMetadataChild;
  settled: () => [boolean, boolean, boolean];
} {
  const subprocess = Bun.spawn(['/usr/bin/python3', '-I', '-c', program], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    killSignal: 'SIGKILL',
  });
  let exited = false;
  let stdoutDone = false;
  let stderrDone = false;
  const track = (stream: ReadableStream<Uint8Array>, complete: () => void) => {
    const reader = stream.getReader();
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) {
            complete();
            controller.close();
          } else controller.enqueue(next.value);
        } catch (cause) {
          complete();
          controller.error(cause);
        }
      },
      async cancel() {
        await reader.cancel();
        complete();
      },
    });
  };
  return {
    child: {
      stdout: track(subprocess.stdout, () => {
        stdoutDone = true;
      }),
      stderr: track(subprocess.stderr, () => {
        stderrDone = true;
      }),
      exited: subprocess.exited.then((code) => {
        exited = true;
        return code;
      }),
      kill: () => {
        subprocess.kill('SIGKILL');
      },
    },
    settled: () => [exited, stdoutDone, stderrDone],
  };
}

test('the closed product metadata adapter refuses a shortened container ID before spawn', () => {
  throws(() => spawnProductMetadata({ kind: 'container', id: 'abc' }), /metadata request/);
});

test('the closed product metadata adapter refuses a shortened image ID before spawn', () => {
  throws(() => spawnProductMetadata({ kind: 'image', id: 'sha256:abc' }), /metadata request/);
});

test('ambient Docker target override refuses before child dispatch', async () => {
  const { root, layout, plan } = fixture();
  let dispatched = 0;
  process.env['DOCKER_HOST'] = 'tcp://foreign.invalid:2375';
  try {
    await withDependencyOwner(
      plan,
      async (owner) => {
        await rejects(
          readProductMetadata(
            owner,
            layout,
            () => {
              dispatched++;
              return child('unexpected');
            },
            { kind: 'top', id: 'a'.repeat(64) },
            performance.now() + 40000,
          ),
          /Docker environment/,
        );
      },
      root,
    );
    expect(dispatched).toBe(0);
    expect((await readdir(root)).some((name) => name.startsWith('edge-owner-000001-intent'))).toBe(
      false,
    );
  } finally {
    delete process.env['DOCKER_HOST'];
  }
});

test('insufficient original cleanup reserve refuses before owner intent and child dispatch', async () => {
  const { root, layout, plan } = fixture();
  let dispatched = 0;
  await withDependencyOwner(
    plan,
    async (owner) => {
      await rejects(
        readProductMetadata(
          owner,
          layout,
          () => {
            dispatched++;
            return child('unexpected');
          },
          { kind: 'top', id: 'a'.repeat(64) },
          performance.now() + 19000,
        ),
        /deadline/,
      );
    },
    root,
  );
  expect(dispatched).toBe(0);
  expect((await readdir(root)).some((name) => name.startsWith('edge-owner-000001-intent'))).toBe(
    false,
  );
});

test('already cancelled metadata request refuses without durable intent or child', async () => {
  const { root, layout, plan } = fixture();
  const cancellation = new AbortController();
  cancellation.abort();
  let dispatched = 0;
  await withDependencyOwner(
    plan,
    async (owner) => {
      await rejects(
        readProductMetadata(
          owner,
          layout,
          () => {
            dispatched++;
            return child('unexpected');
          },
          { kind: 'top', id: 'a'.repeat(64) },
          performance.now() + 40000,
          cancellation.signal,
        ),
        /cancelled/,
      );
    },
    root,
  );
  expect(dispatched).toBe(0);
  expect((await readdir(root)).some((name) => name.startsWith('edge-owner-000001-intent'))).toBe(
    false,
  );
});

test('cancellation during a real local child joins both pipe readers and exit', async () => {
  const { root, layout, plan } = fixture();
  const cancellation = new AbortController();
  let observed: ReturnType<typeof localChild> | undefined;
  await withDependencyOwner(
    plan,
    async (owner) => {
      const reading = readProductMetadata(
        owner,
        layout,
        () => {
          observed = localChild("import time;print('ready',flush=True);time.sleep(30)");
          return observed.child;
        },
        { kind: 'top', id: 'a'.repeat(64) },
        performance.now() + 40000,
        cancellation.signal,
      );
      setTimeout(() => {
        cancellation.abort();
      }, 100);
      await rejects(reading, /cancelled/);
      expect(observed?.settled()).toEqual([true, true, true]);
      expect(await readdir(root)).not.toContain('edge-owner-000001-readback.json');
    },
    root,
  );
});

test('metadata dispatch retains exact owner intent and only a digest of private stdout', async () => {
  const { root, layout, plan } = fixture();
  await withDependencyOwner(
    plan,
    async (owner) => {
      let intentRead: Promise<string> | undefined;
      const observed = await readProductMetadata(
        owner,
        layout,
        () => {
          intentRead = readFile(`${root}/edge-owner-000001-intent.json`, 'utf8');
          return child('PRIVATE_SENTINEL');
        },
        { kind: 'top', id: 'b'.repeat(64) },
        performance.now() + 40000,
      );
      expect(await intentRead).toContain('"top"');
      expect(observed).toBe('PRIVATE_SENTINEL');
      const readback = await readFile(`${root}/edge-owner-000001-readback.json`, 'utf8');
      expect(readback).toContain('responseSha256');
      expect(readback).not.toContain('PRIVATE_SENTINEL');
    },
    root,
  );
});

test('changed retained owner publication prevents metadata readback after a settled child', async () => {
  const { root, layout, plan } = fixture();
  await withDependencyOwner(
    plan,
    async (owner) => {
      await rejects(
        readProductMetadata(
          owner,
          layout,
          () => {
            writeFileSync(`${root}/edge-owner.pending`, 'changed');
            return child('PRIVATE_SENTINEL');
          },
          { kind: 'top', id: 'f'.repeat(64) },
          performance.now() + 40000,
        ),
      );
      const names = await readdir(root);
      expect(names).toContain('edge-owner-000001-intent.json');
      expect(names).not.toContain('edge-owner-000001-readback.json');
    },
    root,
  );
});

for (const delayed of ['stdout', 'stderr', 'exit'] as const) {
  test(`metadata success joins the ${delayed} lifecycle before returning`, async () => {
    const { root, layout, plan } = fixture();
    const settled = { stdout: false, stderr: false, exit: false };
    const stream = (kind: 'stdout' | 'stderr') =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          setTimeout(
            () => {
              if (kind === 'stdout') controller.enqueue(new TextEncoder().encode('ready'));
              controller.close();
              settled[kind] = true;
            },
            kind === delayed ? 75 : 0,
          );
        },
      });
    await withDependencyOwner(
      plan,
      async (owner) => {
        const observed = await readProductMetadata(
          owner,
          layout,
          () => ({
            stdout: stream('stdout'),
            stderr: stream('stderr'),
            exited: new Promise<number>((resolve) => {
              setTimeout(
                () => {
                  settled.exit = true;
                  resolve(0);
                },
                delayed === 'exit' ? 75 : 0,
              );
            }),
            kill: () => {
              throw new Error('unexpected metadata child kill');
            },
          }),
          { kind: 'top', id: 'a'.repeat(64) },
          performance.now() + 40000,
        );
        expect(observed).toBe('ready');
        expect(settled).toEqual({ stdout: true, stderr: true, exit: true });
      },
      root,
    );
  });
}

for (const [name, program] of [
  ['nonzero exit', 'import sys;sys.exit(7)'],
  ['nonempty stderr', "import sys;sys.stderr.write('PRIVATE_SENTINEL')"],
  ['malformed UTF-8', 'import sys;sys.stdout.buffer.write(bytes([255]))'],
  ['stdout cap', "import sys;sys.stdout.write('x'*65537)"],
] as const) {
  test(`real local metadata child ${name} refuses after both pipes and exit settle`, async () => {
    const { root, layout, plan } = fixture();
    let observed: ReturnType<typeof localChild> | undefined;
    await withDependencyOwner(
      plan,
      async (owner) => {
        const reading = readProductMetadata(
          owner,
          layout,
          () => {
            observed = localChild(program);
            return observed.child;
          },
          { kind: 'top', id: 'c'.repeat(64) },
          performance.now() + 40000,
        );
        if (name === 'stdout cap') await rejects(reading, /stdout/);
        else await rejects(reading);
        expect(observed?.settled()).toEqual([true, true, true]);
        const names = await readdir(root);
        expect(names).toContain('edge-owner-000001-intent.json');
        expect(names).not.toContain('edge-owner-000001-readback.json');
      },
      root,
    );
  });
}

test('never settling raw exit has a bounded terminal cleanup-unproved outcome', async () => {
  const { root, layout, plan } = fixture();
  await withDependencyOwner(
    plan,
    async (owner) => {
      await rejects(
        readProductMetadata(
          owner,
          layout,
          () => ({
            stdout: child('').stdout,
            stderr: child('').stderr,
            exited: new Promise<number>(() => {
              /* Intentional non-settling injected exit. */
            }),
            kill: () => {
              /* Injected child ignores kill to exercise terminal refusal. */
            },
          }),
          { kind: 'top', id: 'd'.repeat(64) },
          performance.now() + 21000,
        ),
        ProductMetadataCleanupUnproved,
      );
      const names = await readdir(root);
      expect(names).toContain('edge-owner-000001-intent.json');
      expect(names).not.toContain('edge-owner-000001-readback.json');
    },
    root,
  );
}, 10000);

test('first stderr byte starts five-second cleanup cutoff even with a longer work budget', async () => {
  const { root, layout, plan } = fixture();
  await withDependencyOwner(
    plan,
    async (owner) => {
      const began = performance.now();
      await rejects(
        readProductMetadata(
          owner,
          layout,
          () => ({
            stdout: child('').stdout,
            stderr: child('', 'PRIVATE_SENTINEL').stderr,
            exited: new Promise<number>(() => {
              /* Intentional non-settling injected exit. */
            }),
            kill: () => {
              /* Injected child ignores kill to exercise terminal refusal. */
            },
          }),
          { kind: 'top', id: 'e'.repeat(64) },
          performance.now() + 40000,
        ),
        ProductMetadataCleanupUnproved,
      );
      expect(performance.now() - began).toBeLessThan(6500);
      const names = await readdir(root);
      expect(names).not.toContain('edge-owner-000001-readback.json');
    },
    root,
  );
}, 10000);
