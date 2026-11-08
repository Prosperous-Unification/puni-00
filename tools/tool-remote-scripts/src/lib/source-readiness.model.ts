import { rejects } from 'node:assert/strict';
import { rm } from 'node:fs/promises';

import { afterEach, expect, test } from 'bun:test';

import {
  injectSourceBarrier,
  SOURCE_REQUESTS,
  SOURCE_WIRE_FAULTS,
  withSourceReadinessContext,
} from '../fixtures/source-readiness';
import { sourceFault } from '../fixtures/source-role-process';
import { roots } from '../fixtures/source-startup';

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  delete process.env['WBS_EDGE_STATE'];
  sourceFault.name = 'none';
  sourceFault.execs = 0;
  sourceFault.closing = false;
  sourceFault.settlements = 0;
  sourceFault.receiptFailures = 0;
  sourceFault.collectionTokens = 0;
  sourceFault.collectionAcks = 0;
});

test('source readiness observes six ordered responses and seven whole-source bindings', async () => {
  await withSourceReadinessContext(async (context, _fixture, audit) => {
    const { observeSourceReadiness } = await import('./source-readiness');
    const evidence = await observeSourceReadiness(context);
    expect(evidence.responses.map(({ path, port }) => `${String(port)} ${path}`)).toEqual(
      audit.requests,
    );
    expect(audit.requests).toEqual([...SOURCE_REQUESTS]);
    expect(audit.rawExecutions()).toBe(14);
    expect(audit.contextChecks).toBe(16);
    expect(audit.evidenceChecks).toBe(2);
    expect(audit.artifactChecks).toBe(2);
    expect(audit.ingressChecks).toBe(2);
    expect(evidence.responses).toHaveLength(6);
    for (const response of evidence.responses) expect(response.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.observation.roles.frontend.process)).toBe(true);
    console.error(
      'SOURCE_READINESS_ACCEPTED: six ordered responses; seven whole-source observations; final retained barriers reached',
    );
  });
}, 300000);

test('source readiness refuses copied and released original contexts before HTTP', async () => {
  await withSourceReadinessContext(async (context, _fixture, audit) => {
    const { observeSourceReadiness } = await import('./source-readiness');
    await rejects(observeSourceReadiness({ ...context }), /source readiness observation refused/);
    expect(audit.requests).toEqual([]);
    expect(audit.rawExecutions()).toBe(0);
    audit.release();
    await rejects(observeSourceReadiness(context), /source readiness observation refused/);
    expect(audit.requests).toEqual([]);
    expect(audit.rawExecutions()).toBe(0);
  });
}, 300000);

test('source readiness retains original cold input prerequisites before HTTP', async () => {
  // This is inherited original-prepare refusal, not a new composer/profile guard witness.
  await withSourceReadinessContext(
    () => Promise.reject(new Error('unsupported original input reached composition')),
    true,
  );
}, 300000);

test('source readiness dispatches all accepted response contracts', async () => {
  await withSourceReadinessContext(async (context, _fixture, audit) => {
    const { observeSourceReadiness } = await import('./source-readiness');
    for (const fault of SOURCE_WIRE_FAULTS) {
      audit.wire = fault;
      audit.requests.length = 0;
      const previous = audit.rawExecutions();
      const phase = fault.startsWith('backend-')
        ? fault === 'backend-capability'
          ? 2
          : 1
        : fault === 'gateway-health'
          ? 3
          : fault.startsWith('mcp-')
            ? 4
            : fault === 'frontend-document'
              ? 5
              : 6;
      console.error(`SOURCE_READINESS_WIRE_REACHED: ${fault} phase=${String(phase)}`);
      await rejects(observeSourceReadiness(context), /source readiness observation refused/);
      expect(audit.requests).toEqual(SOURCE_REQUESTS.slice(0, phase));
      expect(audit.rawExecutions() - previous).toBe(phase * 2);
      console.error(
        `SOURCE_READINESS_WIRE_REFUSED: ${fault} requests=${String(audit.requests.length)}`,
      );
    }
  });
}, 300000);

for (const barrier of ['evidence', 'artifact', 'stores', 'ingress', 'context'] as const)
  test(`source readiness opening ${barrier} barrier`, async () => {
    await withSourceReadinessContext(async (context, fixture, audit) => {
      const inject = () => {
        if (audit.injected) throw new Error('opening source fault injected twice');
        injectSourceBarrier(barrier, context, fixture);
        audit.injected = true;
        console.error(
          `SOURCE_READINESS_OPEN_INJECTED: ${barrier} requests=${String(audit.requests.length)} raw=${String(audit.rawExecutions())}`,
        );
      };
      if (barrier === 'stores')
        audit.afterArtifact = () => {
          if (audit.artifactChecks === 1 && audit.requests.length === 0) inject();
        };
      else if (barrier === 'context')
        audit.afterIngress = () => {
          if (audit.ingressChecks === 1 && audit.requests.length === 0) inject();
        };
      else inject();
      const { observeSourceReadiness } = await import('./source-readiness');
      await rejects(observeSourceReadiness(context), /source readiness observation refused/);
      expect(audit.injected).toBe(true);
      expect(audit.requests).toEqual([]);
      expect(audit.rawExecutions()).toBe(2);
      expect(audit.contextChecks).toBe(barrier === 'context' ? 3 : 2);
      expect(audit.evidenceChecks).toBe(1);
      expect(audit.artifactChecks).toBe(barrier === 'evidence' ? 0 : 1);
      expect(audit.ingressChecks).toBe(barrier === 'context' || barrier === 'ingress' ? 1 : 0);
      console.error(`SOURCE_READINESS_OPEN_REFUSED: ${barrier} zero HTTP at intended preflight`);
    });
  }, 300000);

for (const phase of [1, 2, 3, 4, 5, 6])
  test(`source readiness different-role drift after response ${String(phase)}`, async () => {
    await withSourceReadinessContext(async (context, _fixture, audit) => {
      audit.driftAfter = phase;
      const { observeSourceReadiness } = await import('./source-readiness');
      await rejects(observeSourceReadiness(context), /source readiness observation refused/);
      expect(audit.injected).toBe(true);
      expect(audit.driftDeliveries).toBe(1);
      expect(audit.requests).toEqual(SOURCE_REQUESTS.slice(0, phase));
      expect(audit.rawExecutions()).toBe((phase + 1) * 2);
      expect(audit.evidenceChecks).toBe(1);
      expect(audit.ingressChecks).toBe(1);
      const drift = audit.drift;
      if (drift === null) throw new Error('source readiness handler drift absent');
      console.error(
        `SOURCE_READINESS_BRACKET_REFUSED: phase=${String(phase)} requests=${String(audit.requests.length)} raw=${String(audit.rawExecutions())} different-role=${drift.role} inode=${drift.inode} deliveries=${String(audit.driftDeliveries)}`,
      );
    });
  }, 300000);

for (const barrier of ['source', 'evidence', 'artifact', 'stores', 'ingress', 'context'] as const)
  test(`source readiness closing ${barrier} barrier`, async () => {
    await withSourceReadinessContext(async (context, fixture, audit) => {
      const inject = () => {
        if (audit.injected) throw new Error('closing source fault injected twice');
        injectSourceBarrier(barrier, context, fixture);
        audit.injected = true;
        console.error(
          `SOURCE_READINESS_CLOSE_INJECTED: ${barrier} requests=${String(audit.requests.length)} raw=${String(audit.rawExecutions())} context=${String(audit.contextChecks)}`,
        );
      };
      if (barrier === 'stores')
        audit.afterArtifact = () => {
          if (audit.artifactChecks === 2 && audit.requests.length === 6) inject();
        };
      else if (barrier === 'context')
        audit.afterIngress = () => {
          if (audit.ingressChecks === 2 && audit.requests.length === 6) inject();
        };
      else
        audit.afterContext = () => {
          // Exact late point: the sixth response's whole observer has finished its own
          // closing source monitor and original-context assertion; no earlier check masks this fault.
          if (
            audit.contextChecks === 15 &&
            audit.requests.length === 6 &&
            audit.rawExecutions() === 14
          )
            inject();
        };
      const { observeSourceReadiness } = await import('./source-readiness');
      await rejects(observeSourceReadiness(context), /source readiness observation refused/);
      expect(audit.injected).toBe(true);
      expect(audit.requests).toEqual([...SOURCE_REQUESTS]);
      expect(audit.rawExecutions()).toBe(14);
      expect(audit.contextChecks).toBe(barrier === 'context' ? 16 : 15);
      expect(audit.evidenceChecks).toBe(barrier === 'source' ? 1 : 2);
      expect(audit.artifactChecks).toBe(barrier === 'source' || barrier === 'evidence' ? 1 : 2);
      expect(audit.ingressChecks).toBe(barrier === 'ingress' || barrier === 'context' ? 2 : 1);
      console.error(`SOURCE_READINESS_CLOSE_REFUSED: ${barrier} reached exact final consumer`);
    });
  }, 300000);
