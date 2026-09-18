import { describe, expect, it } from 'bun:test';

import {
  admittedBackendImages,
  assertDownMigrationsUnchanged,
  assertMigratedSet,
  assertObservedCluster,
  assertRequest,
  decideLease,
  failStep,
  FORWARD_PHASES,
  initialState,
  type MigrationCapture,
  planRelease,
  type ReleaseIdentity,
  releaseIdOf,
  type ReleaseRequest,
  type ReleaseState,
  settleInterrupted,
} from './release';

function identity(sha: string, fill: string): ReleaseIdentity {
  const digest = `sha256:${fill.repeat(64)}`;
  return {
    sourceSha: sha,
    images: {
      backend: `registry.puni.test/wbs-be@${digest}`,
      gateway: `registry.puni.test/wbs-gw@${digest}`,
      frontend: `registry.puni.test/wbs-fe@${digest}`,
      mcp: `registry.puni.test/wbs-mcp@${digest}`,
    },
  };
}

const OLD = identity('a'.repeat(40), '1');
const NEW = identity('b'.repeat(40), '2');

function request(overrides: Partial<ReleaseRequest> = {}): ReleaseRequest {
  return {
    environment: 'staging',
    cluster: { context: 'lab', uid: 'uid-lab' },
    namespaces: { app: 'wbs', backend: 'wbs-solver' },
    release: NEW,
    expectedCurrent: OLD,
    admission: { package: 'pkg', activation: 'act' },
    flux: {
      namespace: 'flux-system',
      kustomization: 'wbs',
      gitRepository: 'deploy',
      desiredRevision: 'c'.repeat(40),
      previousRevision: 'd'.repeat(40),
    },
    recovers: null,
    ...overrides,
  };
}

const observed = {
  uid: 'uid-lab',
  current: OLD,
  approvedBackendImages: [OLD.images.backend, NEW.images.backend],
};

const capture: MigrationCapture = {
  baseline: '0001_init',
  applied: [{ name: '0001_init', hash: 'h1' }],
  pending: [{ name: '0002_add', downSha256: 'd2' }],
};

function at(phase: ReleaseState['phase'], patch: Partial<ReleaseState> = {}): ReleaseState {
  return { ...initialState(request()), phase, ...patch };
}

describe('planRelease', () => {
  it('plans every forward step in the contract order', () => {
    expect(planRelease(request(), initialState(request())).map((s) => s.reaches)).toEqual(
      FORWARD_PHASES.slice(1),
    );
  });

  it('rejects an unknown phase', () => {
    expect(() => planRelease(request(), at('half-migrated' as never))).toThrow(
      'unknown release phase',
    );
  });

  it('refuses a journal for another release', () => {
    const state = { ...initialState(request()), releaseId: 'other' };
    expect(() => planRelease(request(), state)).toThrow('journal belongs to release other');
  });

  it('undoes only what a crash after writes-closed may have done', () => {
    const settled = settleInterrupted(at('writes-closed'));
    expect(planRelease(request(), settled).map((s) => s.kind)).toEqual([
      'rollback-reopen-writes',
      'rollback-resume-flux',
      'rollback-release-lease',
    ]);
  });

  it('restores the backend once the stop-writer step may have run', () => {
    const settled = settleInterrupted(at('gateway-drained'));
    expect(planRelease(request(), settled).map((s) => s.kind)).toEqual([
      'rollback-stop-writer',
      'rollback-tiers',
      'rollback-verify',
      'rollback-reopen-writes',
      'rollback-resume-flux',
      'rollback-release-lease',
    ]);
  });

  it('restores the schema whenever a migration set was captured', () => {
    const settled = settleInterrupted(at('state-captured', { capture }));
    expect(planRelease(request(), settled).map((s) => s.kind)).toContain('rollback-schema');
  });

  it('continues a rollback from its journaled rollback phase', () => {
    const state = at('rollback-schema-restored', { rollbackFrom: 'migrated', capture });
    expect(planRelease(request(), state).map((s) => s.kind)).toEqual([
      'rollback-tiers',
      'rollback-verify',
      'rollback-reopen-writes',
      'rollback-resume-flux',
      'rollback-release-lease',
    ]);
  });

  it('continues forward after smoke passed', () => {
    expect(settleInterrupted(at('smoke-passed')).phase).toBe('smoke-passed');
  });

  it('refuses to plan past a failed rollback', () => {
    const failed = at('rollback-failed', {
      failure: {
        step: 'rollback-schema',
        message: 'x',
        manualCommand: 'kubectl create -f job.json',
      },
    });
    expect(() => planRelease(request(), failed)).toThrow(
      'Finish it by hand: kubectl create -f job.json',
    );
  });
});

describe('failStep', () => {
  const step = { kind: 'smoke' as const, reaches: 'smoke-passed' as const };

  it('rolls back before writes reopen', () => {
    expect(failStep(at('tiers-ready'), step, 'x', null).phase).toBe('rollback-started');
  });

  it('requires recovery after writes reopen', () => {
    const state = at('writes-reopened', { writesReopened: true });
    expect(
      failStep(state, { kind: 'reconcile-desired', reaches: 'desired-reconciled' }, 'x', null)
        .phase,
    ).toBe('recovery-required');
  });

  it('fails the rollback when a rollback step fails', () => {
    const state = at('rollback-started', { rollbackFrom: 'migrated' });
    expect(
      failStep(state, { kind: 'rollback-schema', reaches: 'rollback-schema-restored' }, 'x', 'cmd')
        .phase,
    ).toBe('rollback-failed');
  });
});

describe('assertRequest', () => {
  it('refuses an abbreviated source sha', () => {
    expect(() => {
      assertRequest(request({ release: { ...NEW, sourceSha: 'abc' } }));
    }).toThrow('full 40-hex');
  });

  it('refuses a tag without a digest', () => {
    const release = { ...NEW, images: { ...NEW.images, backend: 'wbs-be-01:latest' } };
    expect(() => {
      assertRequest(request({ release }));
    }).toThrow('digest-pinned');
  });

  it('refuses staging without a named Flux unit', () => {
    expect(() => {
      assertRequest(request({ flux: null }));
    }).toThrow('must name the WBS Flux unit');
  });

  it('accepts local without Flux', () => {
    expect(() => {
      assertRequest(request({ environment: 'local', flux: null }));
    }).not.toThrow();
  });
});

describe('assertObservedCluster', () => {
  it('refuses a different cluster behind the same context', () => {
    expect(() => {
      assertObservedCluster(request(), { ...observed, uid: 'uid-other' });
    }).toThrow('reaches cluster uid-other');
  });

  it('refuses when the running release differs from expectedCurrent', () => {
    expect(() => {
      assertObservedCluster(request(), { ...observed, current: NEW });
    }).toThrow('the request expected');
  });

  it('refuses admission parameters that do not approve the running backend', () => {
    expect(() => {
      assertObservedCluster(request(), {
        ...observed,
        approvedBackendImages: [NEW.images.backend],
      });
    }).toThrow('does not approve the running backend');
  });

  it('admits the candidate then the rollback digest, once when they are equal', () => {
    expect(admittedBackendImages(request())).toEqual([NEW.images.backend, OLD.images.backend]);
    const same = { ...NEW, images: { ...NEW.images, backend: OLD.images.backend } };
    expect(admittedBackendImages(request({ release: same }))).toEqual([OLD.images.backend]);
  });

  it('accepts the expected cluster and release', () => {
    expect(() => {
      assertObservedCluster(request(), observed);
    }).not.toThrow();
  });
});

describe('migration evidence', () => {
  it('refuses an edited down migration', () => {
    expect(() => {
      assertDownMigrationsUnchanged(capture, [{ name: '0002_add', downSha256: 'edited' }]);
    }).toThrow('0002_add/down.sql is edited');
  });

  it('refuses a migration Job that completed without applying the captured set', () => {
    expect(() => {
      assertMigratedSet(capture, ['0001_init']);
    }).toThrow('the captured plan was');
    expect(() => {
      assertMigratedSet(capture, ['0002_add', '0001_init']);
    }).not.toThrow();
  });

  it('gives every attempt at the same release its own transaction', () => {
    const first = initialState(request());
    const second = initialState(request());
    expect(first.releaseId).toBe(second.releaseId);
    expect(first.transactionId).not.toBe(second.transactionId);
    expect(first.transactionId.startsWith(first.releaseId)).toBe(true);
  });

  it('names releases by their exact bytes', () => {
    expect(releaseIdOf(NEW)).not.toBe(
      releaseIdOf({ ...NEW, images: { ...NEW.images, mcp: OLD.images.mcp } }),
    );
    expect(releaseIdOf(NEW)).toMatch(/^b{12}-[0-9a-f]{12}$/);
  });
});

describe('decideLease', () => {
  const claim = { holder: 'tx-1#run-b', journalTransaction: 'tx-1', journalPath: '/j.json' };
  const lease = (patch: Partial<Parameters<typeof decideLease>[0] & object> = {}) => ({
    holder: 'tx-1#run-a',
    renewedAtMs: 1000,
    durationSeconds: 20,
    parked: null,
    journal: '/j.json',
    ...patch,
  });

  it('creates an absent Lease and keeps its own', () => {
    expect(decideLease(null, claim, 0)).toEqual({ kind: 'create' });
    expect(decideLease(lease({ holder: 'tx-1#run-b' }), claim, 0)).toEqual({ kind: 'held' });
  });

  it('waits once for a live process of its own transaction', () => {
    expect(decideLease(lease(), claim, 5000)).toEqual({ kind: 'wait', ms: 16_000 });
  });

  it('refuses a live coordinator of another transaction', () => {
    expect(() => decideLease(lease({ holder: 'tx-9#run' }), claim, 5000)).toThrow(
      'held by live coordinator tx-9#run',
    );
  });

  it('takes over its own lapsed or parked transaction', () => {
    expect(decideLease(lease(), claim, 30_000)).toEqual({ kind: 'takeover' });
    expect(decideLease(lease({ parked: 'recovery-required' }), claim, 0)).toEqual({
      kind: 'takeover',
    });
  });

  it('takes over a lapsed holder that died before persisting intent in the same journal', () => {
    const fresh = { ...claim, journalTransaction: null };
    expect(decideLease(lease({ holder: 'tx-0#dead' }), fresh, 30_000)).toEqual({
      kind: 'takeover',
    });
    expect(() =>
      decideLease(lease({ holder: 'tx-0#dead', journal: '/other.json' }), fresh, 30_000),
    ).toThrow('delete the Lease by hand');
  });

  it('never takes over another transaction, even lapsed or parked', () => {
    expect(() =>
      decideLease(lease({ holder: 'tx-9#run', parked: 'rollback-failed' }), claim, 0),
    ).toThrow('inspect that journal');
  });
});
