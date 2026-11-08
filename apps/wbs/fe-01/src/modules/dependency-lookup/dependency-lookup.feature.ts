import type { ProjectAddressApi } from '@/lib/wbs-api';

import type {
  AddressCandidate,
  EndpointSearchReply,
  OpenedDependencyLookup,
  ProjectDiscoveryReply,
  ReferenceResolutionReply,
} from './contract';

/**
 * Owns request cancellation and strips transport metadata without changing typed refusal bodies.
 * Opening reads nothing; retained operations cancel after withdrawal or close.
 */
export function openDependencyLookup({
  isCurrent,
  routes,
}: {
  projectId: string;
  isCurrent: () => boolean;
  routes: ProjectAddressApi;
}): OpenedDependencyLookup {
  let closed = false;
  const isClosed = (): boolean => closed;
  const pending = new Set<AbortController>();
  async function observe<Observation>(
    send: (signal: AbortSignal) => Promise<Observation>,
    signal?: AbortSignal,
  ) {
    // Proof: removing isCurrent admitted a second withdrawn request in the lifetime test (2026-10-22).
    if (isClosed() || !isCurrent() || signal?.aborted) return { kind: 'cancelled' as const };
    const controller = new AbortController();
    const cancel = () => {
      controller.abort();
    };
    signal?.addEventListener('abort', cancel, { once: true });
    pending.add(controller);
    try {
      const reply = await send(controller.signal);
      // Proof: removing either late guard published success after withdrawal or caller cancellation in the lifetime tests (2026-10-22).
      if (!isCurrent() || controller.signal.aborted) return { kind: 'cancelled' as const };
      return reply;
    } finally {
      pending.delete(controller);
      signal?.removeEventListener('abort', cancel);
    }
  }
  const buildPageQuery = (q: string, cursor: string | null) => ({
    q,
    // Proof: widening to 200 failed the actual private-port argument assertion in the lifetime test (2026-10-22).
    limit: '25',
    ...(cursor === null ? {} : { cursor }),
  });
  return {
    lookup: {
      discoverProjects: (query, cursor, signal) =>
        observe(
          (abort) => routes.projects(buildPageQuery(query, cursor), abort).then(normalizeProjects),
          signal,
        ),
      searchEndpoints: (projectId, query, cursor, signal) =>
        observe(
          (abort) =>
            routes
              .candidates(projectId, buildPageQuery(query, cursor), abort)
              .then(normalizeCandidates),
          signal,
        ),
      resolveReference: (projectId, reference, revision, signal) =>
        observe(
          (abort) => routes.resolve(projectId, reference, revision, abort).then(normalizeReference),
          signal,
        ),
    },
    close() {
      closed = true;
      // Proof: replacing abort with a no-op made the close test observe signal.aborted=false (2026-10-22).
      for (const controller of pending) controller.abort();
      pending.clear();
    },
  };
}

function normalizeProjects(
  reply: Awaited<ReturnType<ProjectAddressApi['projects']>>,
): ProjectDiscoveryReply {
  if (reply.kind === 'failure')
    return reply.failure.code === 'cancelled' ? { kind: 'cancelled' } : reply;
  if (reply.kind === 'success') return { kind: 'success', body: reply.body };
  const { headers: _headers, representation: _representation, ...observation } = reply;
  return observation;
}
function normalizeCandidates(
  reply: Awaited<ReturnType<ProjectAddressApi['candidates']>>,
): EndpointSearchReply {
  if (reply.kind === 'failure')
    return reply.failure.code === 'cancelled' ? { kind: 'cancelled' } : reply;
  if (reply.kind === 'success')
    return {
      kind: 'success',
      body: { ...reply.body, candidates: reply.body.candidates.map(readCandidate) },
    };
  const { headers: _headers, representation: _representation, ...observation } = reply;
  return observation;
}
function normalizeReference(
  reply: Awaited<ReturnType<ProjectAddressApi['resolve']>>,
): ReferenceResolutionReply {
  if (reply.kind === 'failure')
    return reply.failure.code === 'cancelled' ? { kind: 'cancelled' } : reply;
  if (reply.kind === 'success') return { kind: 'success', body: reply.body };
  const { headers: _headers, representation: _representation, ...observation } = reply;
  return observation;
}

type CandidateObservation = Extract<
  Awaited<ReturnType<ProjectAddressApi['candidates']>>,
  { kind: 'success' }
>['body']['candidates'][number];
function readCandidate(candidate: CandidateObservation): AddressCandidate {
  const { endpoint } = candidate;
  if (endpoint.scope === 'whole') return { ...candidate, endpoint };
  const step = candidate.step;
  // Proof: removing this check made actual-client absent/mismatched step cases resolve successfully (dependency-command-serialization.test.ts, 2026-10-22).
  if (step?.id !== endpoint.stepId)
    throw new Error('Missing or mismatching dependency step evidence');
  return { ...candidate, endpoint, step };
}
