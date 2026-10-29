import { createHash } from 'node:crypto';

import { assertParticipantRestorationContext } from './complete-dependency-exclusion';
import { inspectDependencyIngress } from './dependency-ingress';
import { resolveParticipantHttpEndpoint } from './dependency-participant-endpoint';
import {
  inspectBackendCapability,
  inspectListenerHealth,
  inspectSourceBackendHealth,
  type ParticipantHttpObservation,
} from './dependency-participant-health';
import { readParticipantHttp } from './dependency-participant-http';
import type { FinalizedParticipantRestorationContext } from './dependency-participant-preparation';
import { freezeDeep } from './dependency-product-process';
import { inspectSourceFrontendDocument, inspectSourceFrontendEntry } from './source-frontend-http';
import { observeSelectedSourceRoles } from './source-role-process';

const REQUESTS = [
  { role: 'backend', port: 3100, path: '/health', kind: 'source-health' },
  { role: 'backend', port: 3100, path: '/api/runtime/dependency-capability', kind: 'capability' },
  { role: 'gateway', port: 3200, path: '/health', kind: 'listener' },
  // Proof: /health substitution failed the earlier mcp-health request ledger in the dispatch consumer;
  // restored /health/readiness passed. No later legacy-health acceptance is claimed.
  { role: 'mcp', port: 3300, path: '/health/readiness', kind: 'listener' },
  { role: 'frontend', port: 4200, path: '/', kind: 'document' },
  { role: 'frontend', port: 4200, path: '/src/main.tsx', kind: 'entry' },
] as const;

type SourceRequest = (typeof REQUESTS)[number];
export interface SourceReadiness {
  readonly observation: Awaited<ReturnType<typeof observeSelectedSourceRoles>>;
  readonly responses: readonly {
    readonly role: SourceRequest['role'];
    readonly port: SourceRequest['port'];
    readonly path: SourceRequest['path'];
    readonly sha256: string;
  }[];
  readonly sha256: string;
}
function inspectResponse(
  kind: SourceRequest['kind'],
  response: ParticipantHttpObservation,
  sourceSha: string,
): { readonly sha256: string } {
  switch (kind) {
    case 'source-health':
      return inspectSourceBackendHealth(response, sourceSha);
    case 'capability':
      return inspectBackendCapability(response);
    case 'listener':
      return inspectListenerHealth(response);
    case 'document':
      return inspectSourceFrontendDocument(response);
    case 'entry':
      return inspectSourceFrontendEntry(response);
  }
}

/**
 * Reads six fixed HTTP surfaces only under the original consumed source context and its
 * original frontend profile capture. The actual whole-source observer validates context
 * before field access, then immediately brackets every decoded response with its retained
 * no-rebind observation. Endpoints join original NetworkID, current assigned numeric IP,
 * namespace membership and same-role listener; stopped IP equality is not assumed.
 * Detached frozen digests/observations grant no start, phase, opener, controller, exposure
 * or browser readiness authority. The existing HTTP text/BOM boundary remains unchanged.
 * @throws {Error} If original custody, retained barriers, whole-source bindings or a response refuses.
 */
export async function observeSourceReadiness(
  context: FinalizedParticipantRestorationContext,
): Promise<SourceReadiness> {
  try {
    // Original context/source monitor and supported frontend literal are inherited from
    // actual observation plus original manifest capture, never recaptured from responses.
    let observation = await observeSelectedSourceRoles(context);
    // Proof: with backup inode replacement, omitting this opening check produced six forbidden HTTP requests;
    // "source readiness opening evidence barrier" failed its zero-HTTP assertion, then passed restored.
    await context.storage.evidence.inspect();
    // Proof: with artifact directory mode drift, omitting this opening check produced six forbidden HTTP requests;
    // "source readiness opening artifact barrier" failed its zero-HTTP assertion, then passed restored.
    context.artifact.verify();
    // Proof: with store inode replacement, omitting this opening check produced six forbidden HTTP requests;
    // "source readiness opening stores barrier" failed its zero-HTTP assertion, then passed restored.
    await context.storage.stores.inspect();
    // Proof: with ingress bytes drift, omitting this opening check produced six forbidden HTTP requests;
    // "source readiness opening ingress barrier" failed its zero-HTTP assertion, then passed restored.
    await inspectDependencyIngress(
      context.owner,
      [context.layouts.prod, context.layouts.dev],
      context.ports.docker,
      context.deadline,
    );
    // Proof: with fenced-record inode replacement, omitting this opening check produced one forbidden health request before the next observer refused;
    // "source readiness opening context barrier" failed its zero-HTTP assertion, then passed restored.
    await assertParticipantRestorationContext(context);
    const responses: SourceReadiness['responses'][number][] = [];
    for (const step of REQUESTS) {
      const endpoint = resolveParticipantHttpEndpoint(
        context.originals.source,
        observation.runtime,
        context.layouts.dev.network,
        observation.localAddresses,
        observation.roles[step.role].listeners,
        step.port,
      );
      const response = await readParticipantHttp(
        endpoint.address,
        step.port,
        step.path,
        context.deadline,
      );
      // Proof: substituted owner SHA and five role/kind dispatch bypasses each lost its selected wire
      // refusal in "source readiness dispatches all accepted response contracts", then passed restored.
      const inspected = inspectResponse(step.kind, response, context.request.owner.sha);
      responses.push({
        role: step.role,
        port: step.port,
        path: step.path,
        sha256: inspected.sha256,
      });
      // Proof: one shared omission removed all six calls; the six "source readiness different-role drift after response"
      // phase consumers missed rejection, then passed restored with FD/TCP replacement and readback.
      observation = await observeSelectedSourceRoles(context);
    }
    // Proof: late source input drift escaped this final call omission after prior observer checks;
    // "source readiness closing source barrier" missed rejection, then passed restored.
    await context.source.inspectRunning();
    // Proof: late backup identity drift escaped this final call omission after prior observer checks;
    // "source readiness closing evidence barrier" missed rejection, then passed restored.
    await context.storage.evidence.inspect();
    // Proof: late artifact mode drift escaped this final call omission after prior observer checks;
    // "source readiness closing artifact barrier" missed rejection, then passed restored.
    context.artifact.verify();
    // Proof: late store identity drift escaped this final call omission after prior observer checks;
    // "source readiness closing stores barrier" missed rejection, then passed restored.
    await context.storage.stores.inspect();
    // Proof: late ingress bytes drift escaped this final call omission after prior observer checks;
    // "source readiness closing ingress barrier" missed rejection, then passed restored.
    await inspectDependencyIngress(
      context.owner,
      [context.layouts.prod, context.layouts.dev],
      context.ports.docker,
      context.deadline,
    );
    // Proof: late fenced-record identity drift escaped this final call omission after prior observer checks;
    // "source readiness closing context barrier" missed rejection, then passed restored.
    await assertParticipantRestorationContext(context);
    const evidence = structuredClone({ observation, responses });
    return freezeDeep({
      ...evidence,
      sha256: createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),
    });
  } catch {
    throw new Error('source readiness observation refused');
  }
}
