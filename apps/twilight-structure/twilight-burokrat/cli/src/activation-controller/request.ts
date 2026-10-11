import { parseOrThrow, type } from '@shared/validation';

import { hashCanonical, serializeCanonical } from '../evidence/content-manifest';

const GitCommit = type(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/);
const Sha256 = type(/^[0-9a-f]{64}$/);
const QualifiedRef = type(/^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/);
const GroupMember = type({
  repositoryId: 'number.integer>=1',
  pullRequestNumber: 'number.integer>=1',
  headSha: GitCommit,
}).onUndeclaredKey('reject');
export const ActivationSubject = type({ kind: "'pull-request'", number: 'number.integer>=1' })
  .onUndeclaredKey('reject')
  .or(
    type({ kind: "'merge-group'", groupRef: QualifiedRef, members: GroupMember.array() })
      .onUndeclaredKey('reject')
      .narrow((subject, context) =>
        subject.members.length > 0
          ? true
          : context.mustBe('a merge group with its verified ordered PR members'),
      ),
  )
  .or(type({ kind: "'protected-revision'", ref: QualifiedRef }).onUndeclaredKey('reject'));
export type ActivationSubject = typeof ActivationSubject.infer;

const ActivationRequestBody = type({
  schemaVersion: '1',
  repositoryId: 'number.integer>=1',
  subject: ActivationSubject,
  targetRef: QualifiedRef,
  headSha: GitCommit,
  baseSha: GitCommit,
  policyIdentity: Sha256,
  mappingIdentity: Sha256,
  toolkitIdentity: Sha256,
  authorityIdentity: Sha256,
  auditGeneration: 'number.integer>=1',
}).onUndeclaredKey('reject');
type ActivationRequestBody = typeof ActivationRequestBody.infer;

const ActivationRequestRecord = type({
  schemaVersion: '1',
  repositoryId: 'number.integer>=1',
  subject: ActivationSubject,
  targetRef: QualifiedRef,
  headSha: GitCommit,
  baseSha: GitCommit,
  policyIdentity: Sha256,
  mappingIdentity: Sha256,
  toolkitIdentity: Sha256,
  authorityIdentity: Sha256,
  auditGeneration: 'number.integer>=1',
  requestIdentity: Sha256,
}).onUndeclaredKey('reject');
export type ActivationRequest = typeof ActivationRequestRecord.infer;

export type ActivationRequestInput = Omit<ActivationRequestBody, 'schemaVersion'>;

function requestBody(request: ActivationRequest): ActivationRequestBody {
  const { requestIdentity: _identity, ...body } = request;
  return body;
}

function assertSubjectTarget(body: ActivationRequestBody): void {
  // Proof: removing the subject/ref join accepted a protected revision for another target.
  if (body.subject.kind === 'protected-revision' && body.subject.ref !== body.targetRef) {
    throw new Error('protected revision subject differs from target ref');
  }
}

/** Checks every request identity before it can authorize a stage or be reused after a PR moves. */
export function assertActivationRequest(input: unknown): ActivationRequest {
  const request = parseOrThrow(ActivationRequestRecord, input);
  assertSubjectTarget(requestBody(request));
  // Proof: omitting the digest check accepted a modified stored request under its old identity.
  if (request.requestIdentity !== hashCanonical(requestBody(request))) {
    throw new Error('activation request identity differs from its canonical fields');
  }
  return request;
}

/** Builds a request from controller-observed identities; no source-tree equality can alias it. */
export function createActivationRequest(input: ActivationRequestInput): {
  readonly request: ActivationRequest;
  readonly bytes: string;
  readonly identity: string;
} {
  const body = parseOrThrow(ActivationRequestBody, { ...input, schemaVersion: 1 });
  assertSubjectTarget(body);
  const request = assertActivationRequest({ ...body, requestIdentity: hashCanonical(body) });
  return {
    request,
    bytes: serializeCanonical(request),
    identity: request.requestIdentity,
  };
}

/** Refuses a noncanonical or forged stored request before it enters the controller state machine. */
export function decodeActivationRequest(bytes: string): ActivationRequest {
  const parsed: unknown = JSON.parse(bytes);
  const request = assertActivationRequest(parsed);
  // Proof: omitting canonical-byte validation accepted a reordered request payload.
  if (serializeCanonical(request) !== bytes) {
    throw new Error('activation request bytes are not canonical');
  }
  return request;
}

/** Requires the persisted request to still match the current observed PR and authority tuple. */
export function requireCurrentRequest(
  persisted: ActivationRequest,
  current: ActivationRequest,
): void {
  const stored = assertActivationRequest(persisted);
  const observed = assertActivationRequest(current);
  // Proof: independent field omissions let mounted current-request checks reuse the old candidate.
  if (
    stored.repositoryId !== observed.repositoryId ||
    hashCanonical(stored.subject) !== hashCanonical(observed.subject) ||
    stored.targetRef !== observed.targetRef ||
    stored.headSha !== observed.headSha ||
    stored.baseSha !== observed.baseSha ||
    stored.policyIdentity !== observed.policyIdentity ||
    stored.mappingIdentity !== observed.mappingIdentity ||
    stored.toolkitIdentity !== observed.toolkitIdentity ||
    // Proof: omitting the authority identity comparison let a different pinned bootstrap reuse the request.
    stored.authorityIdentity !== observed.authorityIdentity ||
    stored.auditGeneration !== observed.auditGeneration
  ) {
    throw new Error('activation request identity changed');
  }
}
