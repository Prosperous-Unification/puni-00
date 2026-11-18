import { canonicalJson, PlanRef, Sha256 } from '@shared/plan-reference';
import { parseOrThrow, type } from '@shared/validation';
import {
  acceptedReferenceArtifacts,
  type ActivePlanReference,
  compileOrdinaryPlanReference,
  decodePlanReferenceBytes,
  type HistoricalPlanReference,
} from '@wbs/contracts';
import type {
  AcceptedPlanReferenceStore,
  AcceptedReferenceScope,
  AcceptedReferenceSelector,
  PlanReferencePolicy,
  RetainedPlanReference,
} from '@wbs/core/ports/accepted-plan-reference-store';
import { and, desc, eq } from 'drizzle-orm';

import type { Drizzle } from './db';
import type { ReadSnapshotLifetime } from './read-snapshot-lifetime';
import { acceptedPlanReference, acceptedPlanReferencePolicy } from './schema';

const id = 'string>=1';
const version = '0 < number.integer <= 9007199254740991';
const scopeOfPolicy = type({
  organizationId: id,
  projectId: PlanRef.get('plan'),
  repository: PlanRef.get('repository'),
  change: PlanRef.get('change'),
});
const subject = type({ kind: "'first_party'", accountId: id }).or({
  kind: "'upstream'",
  accountId: id,
  issuer: id,
  subject: id,
});
const policy = type({
  revision: version,
  grants: type({
    scope: scopeOfPolicy,
    operation: "'accept_reference' | 'submit_assertion' | 'apply_assertion'",
    subject,
  }).array(),
}).onDeepUndeclaredKey('reject');

const summary = {
  version: acceptedPlanReference.version,
  referenceDigest: acceptedPlanReference.referenceDigest,
  writeBasis: acceptedPlanReference.writeBasis,
};
const accepted = type({
  version,
  referenceDigest: Sha256,
  writeBasis: id,
});

function scoped(scope: AcceptedReferenceScope) {
  return and(
    // Proof: Removing the organization filter made "does not disclose a retained reference with a
    // foreign organization in its lock" fail. The faulted fixture received 200 with complete
    // artifacts from the seeded foreign-organization row instead of 404.
    eq(acceptedPlanReference.organizationId, scope.organizationId),
    // Proof: Removing the stored project filter made "historical lookup requires the stored project
    // ID" fail. The faulted fixture received 200 with complete Plan artifacts instead of 404 when
    // only the stored project ID differed.
    eq(acceptedPlanReference.projectId, scope.projectId),
    // Proof: Removing the stored repository filter made "historical lookup requires the stored
    // repository" fail. The faulted fixture received 200 with complete Plan artifacts instead of
    // 404 when only the stored repository differed.
    eq(acceptedPlanReference.repository, scope.repository),
    // Proof: Removing the stored change filter made "historical lookup requires the stored change"
    // fail. The faulted fixture received 200 with complete Plan artifacts instead of 404 when only
    // the stored change differed.
    eq(acceptedPlanReference.change, scope.change),
  );
}

/** Reads and inserts the reference register while its source's writer transaction is live. */
export class SqliteAcceptedPlanReferences implements AcceptedPlanReferenceStore {
  constructor(
    private readonly db: Drizzle,
    private readonly lifetime: ReadSnapshotLifetime,
  ) {}

  readPolicy(): PlanReferencePolicy {
    this.lifetime.assertOpen();
    let rows: { singleton: number; revision: number; grants: string }[];
    try {
      rows = this.db
        .select({
          singleton: acceptedPlanReferencePolicy.singleton,
          revision: acceptedPlanReferencePolicy.revision,
          grants: acceptedPlanReferencePolicy.grants,
        })
        .from(acceptedPlanReferencePolicy)
        .limit(2)
        .all();
    } catch (cause) {
      // Proof: Treating an unreadable policy query as empty made "fails when trusted operator
      // policy is unreadable" fail. The faulted fixture received 403 `forbidden` instead of 500.
      throw new Error('accepted plan reference policy is unreadable', { cause });
    }
    // Proof: Treating the absent policy as empty made "fails when trusted operator policy is
    // missing" fail. The faulted fixture received 403 `forbidden` instead of 500.
    const row = rows.at(0);
    if (row === undefined) throw new Error('accepted plan reference policy is missing');
    // Proof: Restoring the key-1-only read made "refuses a qualifying grant when another
    // policy row exists" receive 201 with one retained row instead of 500 with none.
    if (rows.length !== 1 || row.singleton !== 1)
      throw new Error('accepted plan reference policy is malformed');
    try {
      const grants: unknown = JSON.parse(row.grants);
      // Proof: Skipping policy shape validation made "validates the entire readable policy before
      // acting on a qualifying grant" fail. The faulted fixture received 201 instead of 500 under a
      // readable policy with a malformed grant beside the qualifying grant.
      return parseOrThrow(policy, { revision: row.revision, grants });
    } catch (cause) {
      // Proof: Treating malformed policy JSON as empty made "fails when trusted operator policy is
      // malformed" fail. The faulted fixture received 403 `forbidden` instead of 500.
      throw new Error('accepted plan reference policy is malformed', { cause });
    }
  }

  readActive(scope: AcceptedReferenceScope): ActivePlanReference | null {
    this.lifetime.assertOpen();
    const row = this.db
      .select(summary)
      .from(acceptedPlanReference)
      .where(scoped(scope))
      // Proof: Ordering accepted versions oldest-first made "retains distinct versions for A to B
      // to A and authorizes history after restart" fail. The faulted fixture received 409
      // `reference_changed` instead of 201 on the third registration.
      .orderBy(desc(acceptedPlanReference.version))
      .limit(1)
      .get();
    if (row === undefined) return null;
    const { version, referenceDigest, writeBasis } = parseOrThrow(accepted, row);
    return { lock: { ...scope, version, referenceDigest }, writeBasis };
  }

  /** @throws when retained bytes, reference or tasks disagree with the selected lock. */
  readHistorical(
    scope: AcceptedReferenceScope,
    selector: AcceptedReferenceSelector,
  ): HistoricalPlanReference | null {
    this.lifetime.assertOpen();
    const row = this.db
      .select({ artifacts: acceptedPlanReference.artifacts })
      .from(acceptedPlanReference)
      .where(
        and(
          scoped(scope),
          // Proof: Removing the version filter made "retains distinct versions for A to B to A and
          // authorizes history after restart" fail. The faulted fixture received 200 with B artifacts
          // under requested version one instead of 404.
          eq(acceptedPlanReference.version, selector.version),
          // Proof: Removing the stored digest filter made "historical lookup requires the stored
          // reference digest" fail. The faulted fixture received 200 with complete Plan artifacts
          // instead of 404 when only the stored digest differed.
          eq(acceptedPlanReference.referenceDigest, selector.referenceDigest),
        ),
      )
      .get();
    if (row === undefined) return null;
    const stored: unknown = JSON.parse(row.artifacts);
    // Proof: Treating malformed retained artifacts as missing made "fails on malformed retained
    // artifacts instead of presenting missing history" fail. The faulted fixture received 404
    // `not_found` instead of 500.
    const artifacts = parseOrThrow(acceptedReferenceArtifacts, stored);
    const { planningCommit, sourceBaseCommit } = artifacts.reference.planRef;
    const compiled = compileOrdinaryPlanReference({
      exportBytes: decodePlanReferenceBytes(artifacts.exportBytes),
      requirementsBytes: decodePlanReferenceBytes(artifacts.requirementsBytes),
      repository: scope.repository,
      change: scope.change,
      planningCommit,
      sourceBaseCommit,
    });
    if (
      // Proof: Ignoring the compiled project during historical verification made "rejects
      // self-consistent foreign project artifacts under an exact local historical lock" fail. The
      // faulted fixture received 200 with genuine Peer artifacts under the requested local lock
      // instead of 500.
      compiled.document.project.id !== scope.projectId ||
      // Proof: Skipping the embedded digest comparison made "historical integrity refuses
      // structurally valid altered complete reference" fail. The faulted fixture received 200
      // instead of 500 for a substituted complete reference.
      artifacts.reference.referenceDigest !== selector.referenceDigest ||
      // Proof: Skipping the recompiled reference comparison made "historical integrity refuses
      // structurally valid altered requirements bytes" and 2 other named cases fail. The faulted
      // fixtures received 200 instead of 500 in the separate altered requirements, export and
      // reference-fields cases.
      canonicalJson(compiled.reference) !== canonicalJson(artifacts.reference) ||
      // Proof: Skipping the recompiled tasks comparison made "historical integrity refuses
      // structurally valid altered task content" fail. The faulted fixture received 200 instead of
      // 500 for altered retained task content.
      canonicalJson(compiled.tasks) !== canonicalJson(artifacts.tasks)
    )
      throw new Error('retained plan reference artifacts disagree with their lock');
    return { lock: { ...scope, ...selector }, ...artifacts };
  }

  insert(acceptance: RetainedPlanReference): void {
    this.lifetime.assertOpen();
    this.db
      .insert(acceptedPlanReference)
      .values({
        ...acceptance.lock,
        writeBasis: acceptance.writeBasis,
        artifacts: JSON.stringify(acceptance.artifacts),
        subject: JSON.stringify(acceptance.subject),
        acceptedAt: acceptance.acceptedAt,
        policyRevision: acceptance.policyRevision,
      })
      .run();
  }
}
