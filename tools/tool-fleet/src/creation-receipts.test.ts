import { chmod, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import {
  consumeCreationAttempt,
  createCreationAttempt,
  transitionCreationAttempt,
} from './creation-journal';
import {
  assessCreationReceipts,
  type CreationInspection,
  executeDirectCreation,
  readCreationOperation,
} from './creation-receipts';

async function requireRefusal(
  operation: Promise<unknown>,
  expected?: string | RegExp,
): Promise<void> {
  const refusal: unknown = await operation.then(
    () => {
      throw new Error('Expected refusal');
    },
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
  if (typeof expected === 'string') expect(String(refusal)).toContain(expected);
  else if (expected !== undefined) expect(String(refusal)).toMatch(expected);
}

const identity = {
  labId: 'f9',
  attemptId: 'cdd167d5-f9b2-4b94-9200-776445bf8b19',
  daemonId: 'daemon-1',
};
const networkId = 'a'.repeat(64);
const registryId = 'b'.repeat(64);
const foreignId = 'c'.repeat(64);
async function fixture() {
  const directory = await scratchAsync('creation-receipts-');
  await chmod(directory, 0o700);
  await createCreationAttempt(directory, identity);
  return directory;
}
const pathFor = (directory: string, slot = 'network') =>
  join(directory, `${identity.attemptId}.operations`, `${slot}.json`);
async function completed() {
  const directory = await fixture();
  await executeDirectCreation(directory, identity, 'network', () =>
    Promise.resolve(`${networkId}\n`),
  );
  await executeDirectCreation(directory, identity, 'registry', () =>
    Promise.resolve(`${registryId}\n`),
  );
  return directory;
}
const inspect = (slot: 'network' | 'registry', id: string): Promise<CreationInspection> =>
  Promise.resolve({
    id,
    kind: slot === 'network' ? 'network' : 'container',
    name: slot === 'network' ? 'puni-f9' : 'puni-f9-registry',
    labId: 'f9',
    peerIds: [slot === 'network' ? registryId : networkId],
  });

it('persists pending before Docker and created before the next creation; never grants deletion', async () => {
  const directory = await fixture();
  await executeDirectCreation(directory, identity, 'network', async () => {
    expect((await readCreationOperation(directory, identity, 'network')).state).toBe('pending');
    return `${networkId}\n`;
  });
  await executeDirectCreation(directory, identity, 'registry', async () => {
    expect(await readCreationOperation(directory, identity, 'network')).toMatchObject({
      state: 'created',
      dockerId: networkId,
    });
    return registryId;
  });
  expect(await assessCreationReceipts(directory, identity, 'daemon-1', inspect)).toEqual({
    networkId,
    registryId,
  });
  await requireRefusal(consumeCreationAttempt(directory, identity), 'executor is disabled');
  await requireRefusal(
    executeDirectCreation(directory, identity, 'network', () => {
      throw new Error('must not create');
    }),
    'EEXIST',
  );
  await requireRefusal(
    executeDirectCreation(directory, identity, 'registry', () => {
      throw new Error('must not create');
    }),
    'EEXIST',
  );
});

for (const response of [
  '',
  'name',
  'a'.repeat(12),
  `${networkId}\n${foreignId}\n`,
  ` ${networkId}`,
  `${networkId}\n\n`,
]) {
  it(`leaves malformed Docker response pending (${JSON.stringify(response)})`, async () => {
    const directory = await fixture();
    await requireRefusal(
      executeDirectCreation(directory, identity, 'network', () => Promise.resolve(response)),
      'full ID',
    );
    expect((await readCreationOperation(directory, identity, 'network')).state).toBe('pending');
    await requireRefusal(
      executeDirectCreation(directory, identity, 'registry', () => {
        throw new Error('must not create');
      }),
      'unresolved',
    );
  });
}

it('leaves a lost response pending and refuses later assessment despite an older complete attempt', async () => {
  const directory = await completed();
  const later = { ...identity, attemptId: 'a615b445-583b-4b25-9e4b-0660be0e1153' };
  await createCreationAttempt(directory, later);
  await executeDirectCreation(directory, later, 'network', () => Promise.resolve(networkId));
  await requireRefusal(
    executeDirectCreation(directory, later, 'registry', () =>
      Promise.reject(new Error('response lost')),
    ),
    'response lost',
  );
  await requireRefusal(assessCreationReceipts(directory, later, 'daemon-1', inspect), 'unresolved');
});

for (const fault of [
  'absent',
  'unreadable',
  'public',
  'symlink',
  'directory',
  'malformed',
  'extra',
  'lab',
  'attempt',
  'daemon',
  'slot',
  'id',
  'state',
  'version',
]) {
  it(`refuses ${fault} receipt evidence during assessment`, async () => {
    const directory = await completed();
    const path = pathFor(directory);
    const receipt = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    switch (fault) {
      case 'absent':
        await rm(path);
        break;
      case 'unreadable':
        await chmod(path, 0);
        break;
      case 'public':
        await chmod(path, 0o644);
        break;
      case 'symlink':
        await writeFile(`${path}.target`, JSON.stringify(receipt), { mode: 0o600 });
        await rm(path);
        await symlink(`${path}.target`, path);
        break;
      case 'directory':
        await rm(path);
        await mkdir(path, { mode: 0o600 });
        break;
      case 'malformed':
        await writeFile(path, '{');
        break;
      case 'extra':
        receipt['unexpected'] = true;
        await writeFile(path, JSON.stringify(receipt));
        break;
      default:
        receipt[
          {
            lab: 'labId',
            attempt: 'attemptId',
            daemon: 'daemonId',
            slot: 'slot',
            id: 'dockerId',
            state: 'state',
            version: 'schemaVersion',
          }[fault] ?? 'missing'
        ] = fault === 'slot' ? 'registry' : 'foreign';
        await writeFile(path, JSON.stringify(receipt));
    }
    await requireRefusal(
      assessCreationReceipts(directory, identity, 'daemon-1', inspect),
      ['extra', 'id', 'state', 'version'].includes(fault)
        ? 'Malformed creation operation'
        : ['lab', 'attempt', 'daemon', 'slot'].includes(fault)
          ? 'binding mismatch'
          : ['public', 'unreadable', 'directory'].includes(fault)
            ? /owner-only|EACCES/
            : undefined,
    );
  });
}

for (const fault of [
  'daemon',
  'returned-id',
  'label',
  'foreign-endpoint',
  'missing-network',
  'malformed-inspection',
]) {
  it(`refuses ${fault} from Docker without cleanup`, async () => {
    const directory = await completed();
    await requireRefusal(
      assessCreationReceipts(
        directory,
        identity,
        fault === 'daemon' ? 'daemon-2' : 'daemon-1',
        (slot, id) =>
          Promise.resolve({
            id: fault === 'returned-id' ? foreignId : id,
            kind: slot === 'network' ? 'network' : 'container',
            name: slot === 'network' ? 'puni-f9' : 'puni-f9-registry',
            labId: fault === 'label' ? 'other' : 'f9',
            peerIds:
              fault === 'foreign-endpoint'
                ? [foreignId]
                : fault === 'missing-network'
                  ? []
                  : fault === 'malformed-inspection'
                    ? ['short']
                    : [slot === 'network' ? registryId : networkId],
          }),
      ),
      fault === 'daemon'
        ? 'daemon identity changed'
        : fault === 'foreign-endpoint'
          ? 'foreign attachments'
          : fault === 'missing-network'
            ? 'receipted network'
            : fault === 'malformed-inspection'
              ? 'Malformed Docker inspection'
              : 'inspected identity mismatch',
    );
  });
}

it('refuses invalid slots and terminal journals before invoking Docker', async () => {
  const directory = await fixture();
  await requireRefusal(
    executeDirectCreation(directory, identity, '../escape' as 'network', () => {
      throw new Error('must not create');
    }),
    'slot',
  );
  await transitionCreationAttempt(directory, identity, 'failed');
  await requireRefusal(
    executeDirectCreation(directory, identity, 'network', () => {
      throw new Error('must not create');
    }),
    'creating attempt',
  );
});

for (const boundary of ['file', 'directory'] as const) {
  for (const stage of ['reservation', 'completion'] as const) {
    it(`stops before the next creation when ${stage} ${boundary} sync fails`, async () => {
      const directory = await fixture();
      const script = `
        import * as filesystem from 'node:fs/promises';
        import { mock } from 'bun:test';
        const originalOpen = filesystem.open;
        let matches = 0;
        mock.module('node:fs/promises', () => ({ ...filesystem, open: async (...arguments_) => {
          const descriptor = await originalOpen(...arguments_);
          const matchesPath = String(arguments_[0]).includes('.operations');
          const isDirectory = (await descriptor.stat()).isDirectory();
          return new Proxy(descriptor, { get(target, key) {
            if (key === 'sync' && matchesPath && isDirectory === ${JSON.stringify(boundary === 'directory')}) {
              return async () => {
                matches++;
                if (matches === ${String(stage === 'reservation' ? 1 : 2)}) throw new Error('injected operation sync failure');
                await target.sync();
              };
            }
            const property = Reflect.get(target, key);
            return typeof property === 'function' ? property.bind(target) : property;
          }});
        }}));
        const { executeDirectCreation } = await import(${JSON.stringify(join(import.meta.dir, 'creation-receipts.ts'))});
        try {
          await executeDirectCreation(${JSON.stringify(directory)}, ${JSON.stringify(identity)}, 'network', async () => {
            console.log('NETWORK CREATED'); return ${JSON.stringify(networkId)};
          });
          await executeDirectCreation(${JSON.stringify(directory)}, ${JSON.stringify(identity)}, 'registry', async () => {
            console.log('REGISTRY CREATED'); return ${JSON.stringify(registryId)};
          });
          throw new Error('fault ignored');
        } catch (cause) {
          if (!(cause instanceof Error) || !cause.message.includes('injected operation sync failure')) throw cause;
          console.log('SYNC REFUSED');
        }
      `;
      const invocation = Bun.spawn([process.execPath, '--eval', script], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(invocation.stdout).text(),
        new Response(invocation.stderr).text(),
        invocation.exited,
      ]);
      expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
      expect(stdout).toContain('SYNC REFUSED');
      expect(stdout).not.toContain('REGISTRY CREATED');
      expect(stdout.includes('NETWORK CREATED')).toBe(stage === 'completion');
    });
  }
}

it('refuses a completion that changed state while Docker was running', async () => {
  const directory = await fixture();
  await requireRefusal(
    executeDirectCreation(directory, identity, 'network', async () => {
      await writeFile(
        pathFor(directory),
        JSON.stringify({
          ...identity,
          schemaVersion: 2,
          slot: 'network',
          kind: 'network',
          name: 'puni-f9',
          state: 'created',
          dockerId: foreignId,
        }),
      );
      return networkId;
    }),
    'terminal',
  );
});

for (const fault of ['uid', 'regular-file'] as const) {
  it(`refuses injected operation descriptor ${fault} during assessment`, async () => {
    const directory = await completed();
    const script = `
      import * as filesystem from 'node:fs/promises';
      import { mock } from 'bun:test';
      const originalOpen = filesystem.open;
      mock.module('node:fs/promises', () => ({ ...filesystem, open: async (...arguments_) => {
        const descriptor = await originalOpen(...arguments_);
        if (!String(arguments_[0]).endsWith('.operations/network.json')) return descriptor;
        return new Proxy(descriptor, { get(target, key) {
          if (key === 'stat') return async () => {
            const status = await target.stat();
            return new Proxy(status, { get(stat, property) {
              if (property === ${JSON.stringify(fault === 'uid' ? 'uid' : 'isFile')}) return ${fault === 'uid' ? 'status.uid + 1' : '() => false'};
              const value = Reflect.get(stat, property);
              return typeof value === 'function' ? value.bind(stat) : value;
            }});
          };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        }});
      }}));
      const { assessCreationReceipts } = await import(${JSON.stringify(join(import.meta.dir, 'creation-receipts.ts'))});
      try {
        await assessCreationReceipts(${JSON.stringify(directory)}, ${JSON.stringify(identity)}, 'daemon-1', (slot, id) => Promise.resolve({ id, kind: slot === 'network' ? 'network' : 'container', name: slot === 'network' ? 'puni-f9' : 'puni-f9-registry', labId: 'f9', peerIds: [slot === 'network' ? ${JSON.stringify(registryId)} : ${JSON.stringify(networkId)}] }));
        throw new Error('fault ignored');
      } catch (cause) {
        if (!(cause instanceof Error) || !cause.message.includes('owner-only regular file')) throw cause;
        console.log('DESCRIPTOR REFUSED');
      }
    `;
    const invocation = Bun.spawn([process.execPath, '--eval', script], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(invocation.stdout).text(),
      new Response(invocation.stderr).text(),
      invocation.exited,
    ]);
    expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
    expect(stdout).toContain('DESCRIPTOR REFUSED');
  });
}

it('refuses a real FIFO operation without waiting for a writer', async () => {
  const directory = await completed();
  await rm(pathFor(directory));
  expect(Bun.spawnSync(['mkfifo', '-m', '600', pathFor(directory)]).exitCode).toBe(0);
  const script = `
    const { assessCreationReceipts } = await import(${JSON.stringify(join(import.meta.dir, 'creation-receipts.ts'))});
    try {
      await assessCreationReceipts(${JSON.stringify(directory)}, ${JSON.stringify(identity)}, 'daemon-1', () => { throw new Error('must not inspect'); });
      throw new Error('FIFO accepted');
    } catch (cause) {
      if (!(cause instanceof Error) || !cause.message.includes('owner-only regular file')) throw cause;
      console.log('FIFO REFUSED');
    }
  `;
  const invocation = Bun.spawn([process.execPath, '--eval', script], {
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 2000,
    killSignal: 'SIGKILL',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(invocation.stdout).text(),
    new Response(invocation.stderr).text(),
    invocation.exited,
  ]);
  expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
  expect(stdout).toContain('FIFO REFUSED');
});

for (const fault of ['public', 'symlink'] as const) {
  it(`refuses ${fault} operation directory during assessment`, async () => {
    const directory = await completed();
    const operations = join(directory, `${identity.attemptId}.operations`);
    if (fault === 'public') await chmod(operations, 0o755);
    else {
      await rename(operations, `${operations}.target`);
      await symlink(`${operations}.target`, operations);
    }
    await requireRefusal(
      assessCreationReceipts(directory, identity, 'daemon-1', inspect),
      'directory must be owner-only',
    );
  });
}

it('refuses an occupied completion lock without replacing pending evidence', async () => {
  const directory = await fixture();
  await requireRefusal(
    executeDirectCreation(directory, identity, 'network', async () => {
      await mkdir(`${pathFor(directory)}.lock`, { mode: 0o700 });
      return networkId;
    }),
    'EEXIST',
  );
  expect((await readCreationOperation(directory, identity, 'network')).state).toBe('pending');
});

it('binds each pending and created receipt to its lab-derived kind and name', async () => {
  const directory = await fixture();
  for (const [slot, kind, name, dockerId] of [
    ['network', 'network', 'puni-f9', networkId],
    ['registry', 'container', 'puni-f9-registry', registryId],
  ] as const) {
    await executeDirectCreation(directory, identity, slot, async () => {
      expect(await readCreationOperation(directory, identity, slot)).toMatchObject({
        state: 'pending',
        kind,
        name,
      });
      return dockerId;
    });
    expect(await readCreationOperation(directory, identity, slot)).toMatchObject({
      state: 'created',
      kind,
      name,
    });
  }
});

for (const slot of ['network', 'registry'] as const) {
  for (const field of ['kind', 'name'] as const) {
    for (const state of ['pending', 'created'] as const) {
      it(`refuses ${slot} ${state} receipt ${field} mismatch during assessment`, async () => {
        const directory = await completed();
        const path = pathFor(directory, slot);
        const receipt = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
        receipt['state'] = state;
        if (state === 'pending') delete receipt['dockerId'];
        receipt[field] =
          field === 'kind' ? (slot === 'network' ? 'container' : 'network') : 'puni-other';
        await writeFile(path, JSON.stringify(receipt));
        await requireRefusal(
          assessCreationReceipts(directory, identity, 'daemon-1', inspect),
          `operation ${field} mismatch`,
        );
      });
    }
    it(`refuses inspected ${slot} ${field} mismatch independently of ID and label`, async () => {
      const directory = await completed();
      await requireRefusal(
        assessCreationReceipts(directory, identity, 'daemon-1', async (selected, id) => {
          const inspected = await inspect(selected, id);
          return selected !== slot
            ? inspected
            : {
                ...inspected,
                [field]:
                  field === 'kind' ? (slot === 'network' ? 'container' : 'network') : 'puni-other',
              };
        }),
        `inspected ${field} mismatch`,
      );
    });
  }
}

it('refuses earlier operation schema v1 instead of adopting unbound receipts', async () => {
  const directory = await completed();
  const path = pathFor(directory);
  const receipt = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  receipt['schemaVersion'] = 1;
  await writeFile(path, JSON.stringify(receipt));
  await requireRefusal(
    assessCreationReceipts(directory, identity, 'daemon-1', inspect),
    'Malformed creation operation',
  );
});

for (const field of ['kind', 'name'] as const) {
  it(`refuses receipt missing required ${field}`, async () => {
    const directory = await completed();
    const path = pathFor(directory);
    const receipt = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    if (field === 'kind') delete receipt['kind'];
    else delete receipt['name'];
    await writeFile(path, JSON.stringify(receipt));
    await requireRefusal(
      assessCreationReceipts(directory, identity, 'daemon-1', inspect),
      'Malformed creation operation',
    );
  });
}

for (const field of ['kind', 'name'] as const) {
  it(`refuses inspection missing required ${field}`, async () => {
    const directory = await completed();
    await requireRefusal(
      assessCreationReceipts(directory, identity, 'daemon-1', async (slot, id) => {
        const inspected = await inspect(slot, id);
        const malformed: Record<string, unknown> = { ...inspected };
        if (field === 'kind') delete malformed['kind'];
        else delete malformed['name'];
        return malformed as unknown as CreationInspection;
      }),
      'Malformed Docker inspection',
    );
  });
}
