import { serializeHistory } from '@wbs/domain';
import {
  diffPlans,
  type PlanDiff,
  type PlanScheduleValue,
  type PlanSide,
  type PlanSideSchedule,
  type QuestionMeaning,
  readSavedCanonicalStage,
  readSavedConnectedScheduleBody,
  readScheduleMeaning as readCapturedScheduleMeaning,
  renderScheduleMeaning,
  type SavedConnectedScheduleBody,
  SavedHistoryError,
  type ScheduleMeaning,
  type StageMeaning,
  type VariantMeaning,
} from '@wbs/domain';

type Stage = SavedConnectedScheduleBody['connection']['stages'][number];
type Variant = NonNullable<Stage['variants']>['pri'];
type Question = Extract<Variant, { state: 'ready' }>['candidate']['question'];

/**
 * Compare verified saved/current sides using their required captured or resolved comparison value.
 * Original sides and provenance stay unchanged. Generic diffPlans compares common authored fields
 * and includes parent, retired owner and dependency facts only when both sides recorded them.
 * v1↔v2 packet spellings and their derived identities normalize only in corresponding stage copies.
 * No engine, current writer, live lookup or digest capability is accepted.
 */
export function compareSavedPlanMeaning(left: PlanSide, right: PlanSide): PlanDiff {
  const leftBody = readConnectedBody(left.schedule);
  const rightBody = readConnectedBody(right.schedule);
  if (left.comparison.kind === 'step-resolved' || right.comparison.kind === 'step-resolved') {
    const leftMeaning = readSideMeaning(left),
      rightMeaning = readSideMeaning(right);
    return diffPlans(
      withScheduleMeaning(left, pairResolvedSchedule(leftMeaning, rightMeaning)),
      withScheduleMeaning(right, pairResolvedSchedule(rightMeaning, leftMeaning)),
    );
  }
  return diffPlans(
    { ...left, schedule: readScheduleMeaning(left.schedule, leftBody, rightBody) },
    { ...right, schedule: readScheduleMeaning(right.schedule, rightBody, leftBody) },
  );
}

/** Saved-side owners already project versions1/2 to3/4; an unexpected internal shape is corruption. */
function readConnectedBody(schedule: PlanSideSchedule): SavedConnectedScheduleBody | null {
  if (!schedule.present) return null;
  const body = schedule.body;
  if (!(typeof body === 'object' && body !== null && !Array.isArray(body)))
    throw new SavedHistoryError('comparison_shape', '$.schedule.body');
  if (!('version' in body && (body['version'] === 3 || body['version'] === 4)))
    throw new SavedHistoryError('comparison_version', '$.schedule.body.version');
  return body['version'] === 4 ? readSavedConnectedScheduleBody(body) : null;
}

/** Preserve ordinary/absent bodies and every extra connected field; only aligned cross-format stages get projected. */
function readScheduleMeaning(
  schedule: PlanSideSchedule,
  body: SavedConnectedScheduleBody | null,
  other: SavedConnectedScheduleBody | null,
): PlanSideSchedule {
  if (!schedule.present || body === null || other === null) return schedule;
  const stages = body.connection.stages.map((stage, at) => {
    const counterpart = other.connection.stages.at(at);
    if (counterpart?.workPackageId !== stage.workPackageId || stage.format === counterpart.format)
      return stage;
    return readStageMeaning(stage, counterpart);
  });
  const projected = { ...body, connection: { ...body.connection, stages } };
  // Boundary: both strict historical readers and the packet reader validate finite plain JSON, including unknown extensions.
  return { ...schedule, body: projected as unknown as PlanScheduleValue };
}

/** Keep every stage fact except the cross-format discriminator and corresponding derived observation identity. */
function readStageMeaning(stage: Stage, other: Stage) {
  const { format: ignoredFormat, stageBytes, observation, variants, ...meaning } = stage;
  return {
    ...meaning,
    stageBytes: readSavedCanonicalStage(stage.format, stageBytes),
    observation:
      observation === null ? null : readObservationMeaning(observation, other.observation),
    variants:
      variants === null
        ? null
        : {
            pri: readVariantMeaning(
              variants.pri,
              other.variants === null ? null : other.variants.pri,
              stage.format,
            ),
            time: readVariantMeaning(
              variants.time,
              other.variants === null ? null : other.variants.time,
              stage.format,
            ),
          },
  };
}

/** Only the sanctioned18↔19 scheduler rename with identical solver suffix is an equivalent contract. */
function readContractMeaning(contract: string, other: string | null): string {
  if (contract.startsWith('18+') && other === '19+' + contract.slice(3)) return other;
  if (contract.startsWith('19+') && other === '18+' + contract.slice(3)) return contract;
  return contract;
}

/** Configuration remains compared; only its corresponding cross-format input digest is derived spelling. */
function readObservationMeaning(
  observation: NonNullable<Stage['observation']>,
  other: Stage['observation'],
) {
  const { inputHash: ignoredHash, ...configuration } = observation;
  return {
    ...configuration,
    contractVersion: readContractMeaning(
      configuration.contractVersion,
      other === null ? null : other.contractVersion,
    ),
  };
}

/** A variant without a question remains exactly itself, including its state/outcome and presence. */
function readQuestion(variant: Variant | null): Question | null {
  if (variant === null) return null;
  if (variant.state === 'ready') return variant.candidate.question;
  return variant.state === 'boundary-infeasible' ? variant.certificate.question : null;
}

/** Current packet meaning replaces only the original byte representation inside this comparison copy. */
function readQuestionMeaning(question: Question, other: Question | null, format: Stage['format']) {
  const {
    inputHash: ignoredInputHash,
    questionHash: ignoredQuestionHash,
    stageBytes,
    ...meaning
  } = question;
  return {
    ...meaning,
    contractVersion: readContractMeaning(
      meaning.contractVersion,
      other === null ? null : other.contractVersion,
    ),
    stageBytes: readSavedCanonicalStage(format, stageBytes),
  };
}

/** Ready and certificate branches retain their full distinct evidence; other variants have no identity projection. */
function readVariantMeaning(variant: Variant, other: Variant | null, format: Stage['format']) {
  if (variant.state === 'ready')
    return {
      ...variant,
      candidate: {
        ...variant.candidate,
        question: readQuestionMeaning(variant.candidate.question, readQuestion(other), format),
      },
    };
  if (variant.state === 'boundary-infeasible')
    return {
      ...variant,
      certificate: {
        ...variant.certificate,
        question: readQuestionMeaning(variant.certificate.question, readQuestion(other), format),
      },
    };
  return variant;
}

/** Resolve only detached comparison values; captured packets remain the source for summaries and version validation. */
function readSideMeaning(side: PlanSide): ScheduleMeaning {
  return side.comparison.kind === 'step-resolved'
    ? side.comparison.schedule
    : readCapturedScheduleMeaning(side.schedule, (id) => id);
}

/** A paired schedule is already a comparison value and must never be parsed as a frozen wire body. */
function withScheduleMeaning(side: PlanSide, schedule: PlanSideSchedule): PlanSide {
  return side.comparison.kind === 'captured'
    ? { ...side, schedule }
    : { ...side, comparison: { ...side.comparison, schedule: { kind: 'plain', value: schedule } } };
}

/** Keep raw byte identity unless an actual identity projection or sanctioned format pair explains its change. */
function pairResolvedSchedule(side: ScheduleMeaning, other: ScheduleMeaning): PlanSideSchedule {
  if (side.kind !== 'connected' || other.kind !== 'connected') return renderScheduleMeaning(side);
  const stages = side.body.connection.stages.map((stage, at) => {
    const counterpart = other.body.connection.stages.at(at);
    return readResolvedStage(
      stage,
      counterpart?.workPackageId === stage.workPackageId ? counterpart : null,
    );
  });
  const body = { ...side.body, connection: { ...side.body.connection, stages } };
  // Boundary: strict frozen readers checked finite JSON before these explicit typed identity projections.
  return {
    present: true,
    algorithmId: side.algorithmId,
    body: body as unknown as PlanScheduleValue,
  };
}

/** Stage shape/configuration/outcome/timing remain compared; only justified derived identity fields can disappear. */
function readResolvedStage(stage: StageMeaning, other: StageMeaning | null) {
  const {
    stage: packet,
    capturedIdentity,
    hasResolvedIdentity,
    stageBytes,
    variants,
    format,
    observation,
    ...meaning
  } = stage;
  const isCrossFormat = other !== null && format !== other.format;
  // Proof: omitting only this stage method's captured-identity-difference conjunct failed
  // `step-resolved connected same-old-id packets retain whitespace-only packet differences under a relevant roster`
  // at the exact stageBytes-difference lookup (undefined; 7 total expects); restoration passed with 8.
  // The question guard stayed intact. Before was one five-case/36-expect group, not a fresh selected triple.
  // The fault's raw-preservation tail was unreached; other gate terms and integrity admission are unproved here.
  const isIdentityPair =
    other !== null &&
    (hasResolvedIdentity || other.hasResolvedIdentity) &&
    serializeHistory(capturedIdentity) !== serializeHistory(other.capturedIdentity);
  const shouldResolvePacket = isCrossFormat || isIdentityPair;
  const hasEquivalentIdentity =
    other !== null && isIdentityPair && serializeHistory(packet) === serializeHistory(other.stage);
  const shouldNormalizeDigest = isCrossFormat || hasEquivalentIdentity;
  const projectedObservation =
    observation === null
      ? null
      : shouldNormalizeDigest
        ? readObservationMeaning(observation, isCrossFormat ? other.observation : observation)
        : observation;
  return {
    ...meaning,
    ...(isCrossFormat ? {} : { format }),
    stageBytes: shouldResolvePacket ? packet : stageBytes,
    observation: projectedObservation,
    variants:
      variants === null
        ? null
        : {
            pri: readResolvedVariant(variants.pri, other?.variants?.pri ?? null, isCrossFormat),
            time: readResolvedVariant(variants.time, other?.variants?.time ?? null, isCrossFormat),
          },
  };
}

/** Return the question only from the two outcomes that actually carry one. */
function readMeaningQuestion(variant: VariantMeaning | null): QuestionMeaning | null {
  if (variant?.state === 'ready') return variant.candidate.question;
  return variant?.state === 'boundary-infeasible' ? variant.certificate.question : null;
}

/** Same-format hash-only edits remain visible; packet translation never hides changed configuration or result evidence. */
function readResolvedQuestion(
  question: QuestionMeaning,
  other: QuestionMeaning | null,
  isCrossFormat: boolean,
) {
  const { stage, capturedIdentity, hasResolvedIdentity, stageBytes, ...captured } = question;
  // Proof: omitting only this question method's captured-identity-difference conjunct failed
  // `step-resolved connected same-old-id packets retain questionHash-only differences under a relevant roster`
  // at its named-path predicate (false; 4 total expects); restoration passed with 5. The stage guard stayed intact.
  // Before was the same five-case/36-expect group. The actual diff payload was not printed and the fault's
  // raw-preservation tail was unreached; this does not prove other gate terms or original-byte integrity.
  const isIdentityPair =
    other !== null &&
    (hasResolvedIdentity || other.hasResolvedIdentity) &&
    serializeHistory(capturedIdentity) !== serializeHistory(other.capturedIdentity);
  const shouldNormalizeDigest =
    isCrossFormat ||
    (other !== null && isIdentityPair && serializeHistory(stage) === serializeHistory(other.stage));
  const packet = isCrossFormat || isIdentityPair ? stage : stageBytes;
  if (!shouldNormalizeDigest) return { ...captured, stageBytes: packet };
  const { inputHash: ignoredInputHash, questionHash: ignoredQuestionHash, ...meaning } = captured;
  return {
    ...meaning,
    contractVersion: isCrossFormat
      ? readContractMeaning(meaning.contractVersion, other === null ? null : other.contractVersion)
      : meaning.contractVersion,
    stageBytes: packet,
  };
}

/** Decision placements/candidate starts are already resolved; every variant discriminator and proof remains present. */
function readResolvedVariant(
  variant: VariantMeaning,
  other: VariantMeaning | null,
  isCrossFormat: boolean,
) {
  if (variant.state === 'ready')
    return {
      ...variant,
      candidate: {
        ...variant.candidate,
        question: readResolvedQuestion(
          variant.candidate.question,
          readMeaningQuestion(other),
          isCrossFormat,
        ),
      },
    };
  if (variant.state === 'boundary-infeasible')
    return {
      ...variant,
      certificate: {
        ...variant.certificate,
        question: readResolvedQuestion(
          variant.certificate.question,
          readMeaningQuestion(other),
          isCrossFormat,
        ),
      },
    };
  return variant;
}
