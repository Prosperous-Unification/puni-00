import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import { openActivationController } from './controller';
import { createGitHubPullRequestSource, type GitHubPullRequestReader } from './github-source';

const scratch: string[] = [];
afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'activation-github-source-'));
  scratch.push(directory);
  const bootstrapPath = join(directory, 'bootstrap.json');
  const bootstrapBytes = serializeCanonical({
    schemaVersion: 1,
    authorityGeneration: 3,
    reviewer: {
      kind: 'external-audit-provider',
      providerId: 'review.provider',
      executorId: 'review.executor',
      protocolIdentity: 'a'.repeat(64),
      promptIdentity: 'b'.repeat(64),
    },
    journal: {
      kind: 'authenticated-external-journal',
      verifierId: 'journal.verifier',
      issuerId: 'journal.issuer',
      endpoint: 'https://journal.example.invalid/v1',
    },
    publisher: {
      kind: 'immutable-external-store',
      issuerId: 'publisher.issuer',
      endpoint: 'https://store.example.invalid/activations',
    },
    admission: {
      requiredWorkflow: '.github/workflows/trusted-wiki.yml',
      protectedBranch: 'main',
    },
  });
  writeFileSync(bootstrapPath, bootstrapBytes);
  const binding = {
    repositoryId: 8241,
    owner: 'Prosperous-Unification',
    name: 'puni-00',
    targetRef: 'refs/heads/main',
    policyIdentity: '3'.repeat(64),
    mappingIdentity: '4'.repeat(64),
    toolkitIdentity: '5'.repeat(64),
    readDeadlineMs: 1000,
  };
  const pull = {
    number: 282,
    state: 'open',
    draft: false,
    head: { sha: '1'.repeat(40), repo: { id: 8241 } },
    base: { sha: '2'.repeat(40), ref: 'main', repo: { id: 8241 } },
  };
  return {
    binding,
    pull,
    bootstrapPath,
    databasePath: join(directory, 'controller.sqlite'),
    pin: {
      identity: hashBytes(bootstrapBytes),
      journalIssuerId: 'journal.issuer',
      publisherIssuerId: 'publisher.issuer',
    },
  };
}

function controllerFor(source: ReturnType<typeof fixture>, reader: GitHubPullRequestReader) {
  return openActivationController({
    databasePath: source.databasePath,
    bootstrapPath: source.bootstrapPath,
    pin: source.pin,
    clock: () => 1000,
    ...createGitHubPullRequestSource(source.binding, reader),
    selectObligations: () => {
      throw new Error('no evaluation in source test');
    },
  });
}

async function expectRefusal(read: () => Promise<unknown>, message?: string): Promise<void> {
  let caught: unknown;
  try {
    await read();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  if (message !== undefined) expect(String(caught)).toContain(message);
}

async function finishWithin<T>(read: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('test watchdog expired'));
        }, milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

test('timer discovers a ready PR but commits only a fresh exact current read', async () => {
  const source = fixture();
  const reads: string[] = [];
  const github = createGitHubPullRequestSource(source.binding, {
    listOpenPullRequests: (_owner, _name, page) => {
      reads.push(`list:${String(page)}`);
      return Promise.resolve(
        page === 1 ? { pulls: [source.pull], nextPage: 2 } : { pulls: [], nextPage: null },
      );
    },
    getPullRequest: (_owner, _name, number) => {
      reads.push(`get:${String(number)}`);
      return Promise.resolve({
        ...source.pull,
        head: { ...source.pull.head, sha: '9'.repeat(40) },
      });
    },
  });
  const controller = openActivationController({
    databasePath: source.databasePath,
    bootstrapPath: source.bootstrapPath,
    pin: source.pin,
    clock: () => 1000,
    ...github,
    selectObligations: () => {
      throw new Error('no evaluation in source test');
    },
  });
  try {
    const reconciled = await controller.reconcileReady();
    expect(reads).toEqual(['list:1', 'list:2', 'get:282']);
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]?.headSha).toBe('9'.repeat(40));
    expect(controller.listRequests()).toHaveLength(1);
  } finally {
    controller.close();
  }
});

for (const operation of ['list', 'get'] as const) {
  test(`a hanging ${operation} read has a finite deadline and aborts the source request`, async () => {
    const source = fixture();
    source.binding.readDeadlineMs = 30;
    const signals: AbortSignal[] = [];
    const hanging = new Promise<unknown>(() => undefined);
    const controller = controllerFor(source, {
      listOpenPullRequests: (_owner, _name, _page, signal) => {
        if (operation === 'list') {
          signals.push(signal);
          return hanging;
        }
        return Promise.resolve({ pulls: [source.pull], nextPage: null });
      },
      getPullRequest: (_owner, _name, _number, signal) => {
        signals.push(signal);
        return operation === 'get' ? hanging : Promise.resolve(source.pull);
      },
    });
    try {
      await expectRefusal(
        () => finishWithin(controller.reconcileReady(), 300),
        'GitHub PR read deadline exceeded',
      );
      expect(signals).toHaveLength(1);
      expect(signals[0]?.aborted).toBe(true);
      expect(controller.listRequests()).toEqual([]);
    } finally {
      controller.close();
    }
  });
}

test('trusted PR read deadline is finite and capped before a provider call', () => {
  const source = fixture();
  source.binding.readDeadlineMs = 60_001;
  let reads = 0;
  expect(() =>
    controllerFor(source, {
      listOpenPullRequests: () => {
        reads += 1;
        return Promise.resolve({ pulls: [], nextPage: null });
      },
      getPullRequest: () => {
        reads += 1;
        return Promise.resolve(source.pull);
      },
    }),
  ).toThrow('GitHub PR read deadline exceeds limit');
  expect(reads).toBe(0);
});

test('whole-list deadline refuses before reading another page after costly validation', async () => {
  const source = fixture();
  source.binding.readDeadlineMs = 10;
  let laterPages = 0;
  const controller = controllerFor(source, {
    listOpenPullRequests: (_owner, _name, page) => {
      if (page === 1) {
        return Promise.resolve({
          get pulls() {
            const until = performance.now() + 20;
            while (performance.now() < until) {
              /* consume the already-authorized validation budget */
            }
            return [];
          },
          nextPage: 2,
        });
      }
      laterPages += 1;
      return Promise.resolve({ pulls: [], nextPage: null });
    },
    getPullRequest: () => Promise.resolve(source.pull),
  });
  try {
    await expectRefusal(() => controller.reconcileReady(), 'GitHub PR read deadline exceeded');
    expect(laterPages).toBe(0);
    expect(controller.listRequests()).toEqual([]);
  } finally {
    controller.close();
  }
});

test('event and timer converge on one durable request after an independent current read', async () => {
  const source = fixture();
  let reads = 0;
  const controller = controllerFor(source, {
    listOpenPullRequests: () => Promise.resolve({ pulls: [source.pull], nextPage: null }),
    getPullRequest: () => {
      reads += 1;
      return Promise.resolve(source.pull);
    },
  });
  try {
    const event = await controller.observeDelivery({
      sourceId: 'github',
      deliveryId: 'delivery.one',
      payloadDigest: 'a'.repeat(64),
      repositoryId: source.binding.repositoryId,
      subject: { kind: 'pull-request', number: source.pull.number },
    });
    const timer = await controller.reconcileReady();
    if (event === undefined) throw new Error('expected event observation');
    expect(timer.map((request) => request.requestIdentity)).toEqual([event.requestIdentity]);
    expect(reads).toBe(2);
    expect(controller.listRequests()).toHaveLength(1);
  } finally {
    controller.close();
  }
});

test('timer rereads an active PR omitted from discovery and retires only explicit closed state', async () => {
  const source = fixture();
  let closed = false;
  let listed = true;
  const controller = controllerFor(source, {
    listOpenPullRequests: () =>
      Promise.resolve({ pulls: listed ? [source.pull] : [], nextPage: null }),
    getPullRequest: () =>
      Promise.resolve(closed ? { ...source.pull, state: 'closed' } : source.pull),
  });
  try {
    expect(await controller.reconcileReady()).toHaveLength(1);
    listed = false;
    expect(await controller.reconcileReady()).toHaveLength(1);
    expect(controller.listRequests()[0]?.current).toBe(true);
    closed = true;
    expect(await controller.reconcileReady()).toEqual([]);
    expect(controller.listRequests()[0]?.stage).toBe('superseded');
  } finally {
    controller.close();
  }
});

test('ambiguous missing or failed current reads leave the active PR unchanged', async () => {
  const source = fixture();
  let current: unknown = source.pull;
  const controller = controllerFor(source, {
    listOpenPullRequests: () => Promise.resolve({ pulls: [], nextPage: null }),
    getPullRequest: () => {
      if (current instanceof Error) throw current;
      return Promise.resolve(current);
    },
  });
  try {
    await controller.observeDelivery({
      sourceId: 'github',
      deliveryId: 'delivery.one',
      payloadDigest: 'a'.repeat(64),
      repositoryId: source.binding.repositoryId,
      subject: { kind: 'pull-request', number: source.pull.number },
    });
    const before = controller.listRequests();
    for (const ambiguous of [undefined, new Error('rate limit'), new Error('auth refused')]) {
      current = ambiguous;
      await expectRefusal(() => controller.reconcileReady());
      expect(controller.listRequests()).toEqual(before);
    }
  } finally {
    controller.close();
  }
});

test('head/base movement, retargeting, and returning tuple preserve subject generation history', async () => {
  const source = fixture();
  let current = source.pull;
  const controller = controllerFor(source, {
    listOpenPullRequests: () => Promise.resolve({ pulls: [current], nextPage: null }),
    getPullRequest: () => Promise.resolve(current),
  });
  try {
    const first = (await controller.reconcileReady())[0];
    current = {
      ...source.pull,
      head: { ...source.pull.head, sha: '8'.repeat(40) },
      base: { ...source.pull.base, sha: '7'.repeat(40) },
    };
    const second = (await controller.reconcileReady())[0];
    expect(second.headSha).toBe('8'.repeat(40));
    expect(second.baseSha).toBe('7'.repeat(40));
    expect(second.auditGeneration).toBe(first.auditGeneration + 1);
    current = { ...current, base: { ...current.base, ref: 'other' } };
    expect(await controller.reconcileReady()).toEqual([]);
    current = source.pull;
    const third = (await controller.reconcileReady())[0];
    expect(third.requestIdentity).not.toBe(first.requestIdentity);
    expect(third.auditGeneration).toBe(second.auditGeneration + 1);
  } finally {
    controller.close();
  }
});

test('two owners refetch a held old PR response after a newer head commits', async () => {
  const source = fixture();
  source.binding.readDeadlineMs = 1000;
  const newer = { ...source.pull, head: { ...source.pull.head, sha: '8'.repeat(40) } };
  let releaseOld: ((pull: unknown) => void) | undefined;
  const heldOld = new Promise<unknown>((resolve) => {
    releaseOld = resolve;
  });
  let reads = 0;
  const first = controllerFor(source, {
    listOpenPullRequests: () => Promise.resolve({ pulls: [source.pull], nextPage: null }),
    getPullRequest: () => {
      reads += 1;
      return reads === 2 ? heldOld : Promise.resolve(reads === 1 ? source.pull : newer);
    },
  });
  const second = controllerFor(source, {
    listOpenPullRequests: () => Promise.resolve({ pulls: [], nextPage: null }),
    getPullRequest: () => Promise.resolve(newer),
  });
  try {
    expect(await first.reconcileReady()).toHaveLength(1);
    const pending = first.reconcileReady();
    if (releaseOld === undefined) throw new Error('older PR read was not held');
    const advanced = await second.observeDelivery({
      sourceId: 'github',
      deliveryId: 'delivery.newer',
      payloadDigest: 'b'.repeat(64),
      repositoryId: source.binding.repositoryId,
      subject: { kind: 'pull-request', number: source.pull.number },
    });
    if (advanced === undefined) throw new Error('newer PR was not observed');
    releaseOld(source.pull);
    const reconciled = await pending;
    expect(reconciled[0]?.requestIdentity).toBe(advanced.requestIdentity);
    expect(reconciled[0]?.headSha).toBe(newer.head.sha);
    expect(reads).toBe(3);
    expect(first.listRequests()).toHaveLength(2);
  } finally {
    first.close();
    second.close();
  }
});

test('three competing observations exhaust the bounded source-version retry', async () => {
  const source = fixture();
  source.binding.readDeadlineMs = 1000;
  let competing = source.pull;
  const second = controllerFor(source, {
    listOpenPullRequests: () => Promise.resolve({ pulls: [], nextPage: null }),
    getPullRequest: () => Promise.resolve(competing),
  });
  let reads = 0;
  const first = controllerFor(source, {
    listOpenPullRequests: () => Promise.resolve({ pulls: [source.pull], nextPage: null }),
    getPullRequest: async () => {
      reads += 1;
      competing = {
        ...source.pull,
        head: { ...source.pull.head, sha: String(reads).repeat(40) },
      };
      await second.observeDelivery({
        sourceId: 'github',
        deliveryId: `delivery.competing.${String(reads)}`,
        payloadDigest: String(reads).repeat(64),
        repositoryId: source.binding.repositoryId,
        subject: { kind: 'pull-request', number: source.pull.number },
      });
      return source.pull;
    },
  });
  try {
    await expectRefusal(
      () => first.reconcileReady(),
      'authoritative subject observation did not converge',
    );
    expect(reads).toBe(3);
    expect(first.listRequests()).toHaveLength(3);
    expect(first.listRequests().filter((request) => request.current)).toHaveLength(1);
  } finally {
    first.close();
    second.close();
  }
});

test('draft retirement and ready return survive controller restart with new generation', async () => {
  const source = fixture();
  let current = source.pull;
  const reader = {
    listOpenPullRequests: () => Promise.resolve({ pulls: [current], nextPage: null }),
    getPullRequest: () => Promise.resolve(current),
  };
  const first = controllerFor(source, reader);
  let firstIdentity: string;
  let firstGeneration: number;
  try {
    const initial = (await first.reconcileReady())[0];
    firstIdentity = initial.requestIdentity;
    firstGeneration = initial.auditGeneration;
    current = { ...source.pull, draft: true };
    expect(await first.reconcileReady()).toEqual([]);
    expect(first.listRequests()[0]?.stage).toBe('superseded');
  } finally {
    first.close();
  }
  const reopened = controllerFor(source, reader);
  try {
    current = source.pull;
    const returned = (await reopened.reconcileReady())[0];
    expect(returned.requestIdentity).not.toBe(firstIdentity);
    expect(returned.auditGeneration).toBe(firstGeneration + 1);
    expect(reopened.listRequests()).toHaveLength(2);
  } finally {
    reopened.close();
  }
});

for (const [name, listed] of [
  [
    'foreign base repository',
    (pull: ReturnType<typeof fixture>['pull']) => ({
      ...pull,
      base: { ...pull.base, repo: { id: 9999 } },
    }),
  ],
  [
    'unsupported fork head',
    (pull: ReturnType<typeof fixture>['pull']) => ({
      ...pull,
      head: { ...pull.head, repo: { id: 9999 } },
    }),
  ],
] as const) {
  test(`polling refuses ${name} without a durable request`, async () => {
    const source = fixture();
    let currentReads = 0;
    const controller = controllerFor(source, {
      listOpenPullRequests: () => Promise.resolve({ pulls: [listed(source.pull)], nextPage: null }),
      getPullRequest: () => {
        currentReads += 1;
        return Promise.resolve(source.pull);
      },
    });
    try {
      await expectRefusal(() => controller.reconcileReady());
      expect(currentReads).toBe(0);
      expect(controller.listRequests()).toEqual([]);
    } finally {
      controller.close();
    }
  });
}

test('current read refuses another PR number without changing the active request', async () => {
  const source = fixture();
  let substituted = false;
  const controller = controllerFor(source, {
    listOpenPullRequests: () => Promise.resolve({ pulls: [source.pull], nextPage: null }),
    getPullRequest: () =>
      Promise.resolve(substituted ? { ...source.pull, number: 283 } : source.pull),
  });
  try {
    await controller.reconcileReady();
    const before = controller.listRequests();
    substituted = true;
    await expectRefusal(() => controller.reconcileReady(), 'GitHub PR read differs from subject');
    expect(controller.listRequests()).toEqual(before);
  } finally {
    controller.close();
  }
});

for (const [field, malformed] of [
  [
    'head.sha',
    (pull: ReturnType<typeof fixture>['pull']) => ({
      ...pull,
      head: { ...pull.head, sha: 'invalid' },
    }),
  ],
  [
    'base.sha',
    (pull: ReturnType<typeof fixture>['pull']) => ({
      ...pull,
      base: { ...pull.base, sha: 'invalid' },
    }),
  ],
] as const) {
  test(`malformed consumed ${field} refuses at the source before a durable write`, async () => {
    const source = fixture();
    const controller = controllerFor(source, {
      listOpenPullRequests: () => Promise.resolve({ pulls: [source.pull], nextPage: null }),
      getPullRequest: () => Promise.resolve(malformed(source.pull)),
    });
    try {
      await expectRefusal(() => controller.reconcileReady(), field);
      expect(controller.listRequests()).toEqual([]);
    } finally {
      controller.close();
    }
  });
}

test('unsupported merge-group locator refuses before the GitHub reader is called', async () => {
  const source = fixture();
  let reads = 0;
  const controller = controllerFor(source, {
    listOpenPullRequests: () => Promise.resolve({ pulls: [], nextPage: null }),
    getPullRequest: () => {
      reads += 1;
      return Promise.resolve(source.pull);
    },
  });
  try {
    await expectRefusal(
      () =>
        controller.observeDelivery({
          sourceId: 'github',
          deliveryId: 'delivery.group.only',
          payloadDigest: 'c'.repeat(64),
          repositoryId: source.binding.repositoryId,
          subject: {
            kind: 'merge-group',
            groupRef: 'refs/heads/gh-read-only-queue/main',
            members: [
              {
                repositoryId: source.binding.repositoryId,
                pullRequestNumber: source.pull.number,
                headSha: source.pull.head.sha,
              },
            ],
          },
        }),
      'GitHub source cannot observe this repository subject',
    );
    expect(reads).toBe(0);
    expect(controller.listRequests()).toEqual([]);
  } finally {
    controller.close();
  }
});

test('foreign repository or unsupported subject refuses before a GitHub read', async () => {
  const source = fixture();
  let reads = 0;
  const controller = controllerFor(source, {
    listOpenPullRequests: () => Promise.resolve({ pulls: [], nextPage: null }),
    getPullRequest: () => {
      reads += 1;
      return Promise.resolve(source.pull);
    },
  });
  try {
    await expectRefusal(
      () =>
        controller.observeDelivery({
          sourceId: 'github',
          deliveryId: 'delivery.foreign',
          payloadDigest: 'a'.repeat(64),
          repositoryId: 9999,
          subject: { kind: 'pull-request', number: 282 },
        }),
      'GitHub source cannot observe this repository subject',
    );
    await expectRefusal(
      () =>
        controller.observeDelivery({
          sourceId: 'github',
          deliveryId: 'delivery.group',
          payloadDigest: 'b'.repeat(64),
          repositoryId: source.binding.repositoryId,
          subject: {
            kind: 'merge-group',
            groupRef: 'refs/heads/gh-read-only-queue/main',
            members: [
              {
                repositoryId: source.binding.repositoryId,
                pullRequestNumber: 282,
                headSha: source.pull.head.sha,
              },
            ],
          },
        }),
      'GitHub source cannot observe this repository subject',
    );
    expect(reads).toBe(0);
    expect(controller.listRequests()).toEqual([]);
  } finally {
    controller.close();
  }
});

test('pagination cursor, duplicate subject, and malformed page refuse before durable writes', async () => {
  const source = fixture();
  for (const [pages, message] of [
    [[{ pulls: [source.pull], nextPage: 3 }], 'GitHub PR pagination cursor changed'],
    [
      [
        { pulls: [source.pull], nextPage: 2 },
        { pulls: [source.pull], nextPage: null },
      ],
      'GitHub PR listing repeats a subject',
    ],
    [[{ pulls: [source.pull], nextPage: undefined }], 'nextPage must be a number or null'],
  ] as const) {
    const controller = controllerFor(source, {
      listOpenPullRequests: (_owner, _name, page) => Promise.resolve(pages[page - 1]),
      getPullRequest: () => Promise.resolve(source.pull),
    });
    try {
      await expectRefusal(() => controller.reconcileReady(), message);
      expect(controller.listRequests()).toEqual([]);
    } finally {
      controller.close();
    }
  }
});

for (const [name, change] of [
  ['closed', (pull: ReturnType<typeof fixture>['pull']) => ({ ...pull, state: 'closed' })],
  ['draft', (pull: ReturnType<typeof fixture>['pull']) => ({ ...pull, draft: true })],
  [
    'retargeted',
    (pull: ReturnType<typeof fixture>['pull']) => ({
      ...pull,
      base: { ...pull.base, ref: 'other' },
    }),
  ],
] as const) {
  test(`${name} PR is not admitted as a ready request`, async () => {
    const source = fixture();
    const controller = controllerFor(source, {
      listOpenPullRequests: () => Promise.resolve({ pulls: [source.pull], nextPage: null }),
      getPullRequest: () => Promise.resolve(change(source.pull)),
    });
    try {
      expect(await controller.reconcileReady()).toEqual([]);
      expect(controller.listRequests()).toEqual([]);
    } finally {
      controller.close();
    }
  });
}

test('page-size and finite scan limits refuse partial PR discovery', async () => {
  const source = fixture();
  const oversized = Array.from({ length: 101 }, (_, offset) => ({
    ...source.pull,
    number: source.pull.number + offset,
  }));
  for (const [response, message] of [
    [() => ({ pulls: oversized, nextPage: null }), 'GitHub PR page exceeds 100 pulls'],
    [() => ({ pulls: [], nextPage: 101 }), 'GitHub PR pagination exceeds bounded scan'],
  ] as const) {
    let currentReads = 0;
    const controller = controllerFor(source, {
      listOpenPullRequests: (_owner, _name, page) =>
        Promise.resolve(page === 100 ? response() : { pulls: [], nextPage: page + 1 }),
      getPullRequest: () => {
        currentReads += 1;
        return Promise.resolve(source.pull);
      },
    });
    try {
      await expectRefusal(() => controller.reconcileReady(), message);
      expect(currentReads).toBe(0);
      expect(controller.listRequests()).toEqual([]);
    } finally {
      controller.close();
    }
  }
});
