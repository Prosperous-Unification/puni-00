import {
  getScopingQuestion,
  isQuestionId,
  isStartingChoiceId,
  type QuestionId,
  type StartingChoiceId,
} from '@website/contracts';

export interface ScopingTurn {
  message?: string;
  answers?: Partial<Record<QuestionId, string>>;
  edit?: { kind: 'references'; references: string } | { kind: 'decline_email' };
}
export interface ScopingScenario {
  protocol: 'scoping';
  startingChoice?: StartingChoiceId;
  description?: string;
  turns: ScopingTurn[];
  stopOnBrief: boolean;
  ending?: 'exploration';
  transportFault?: 'truncation' | 'refusal';
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function hasKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}
/** Validates scenario decisions before any paid request; an absent question answer is never guessed. */
export function parseScopingScenario(
  script: Record<string, unknown>,
  name: string,
): ScopingScenario {
  const refuse = (field: string): never => {
    throw new Error(`Sales corpus script ${name}: malformed ${field}`);
  };
  if (
    !hasKeys(script, [
      'name',
      'protocol',
      'startingChoice',
      'description',
      'turns',
      'assertions',
      'stopOnBrief',
      'ending',
      'transportFault',
    ])
  )
    refuse('fields');
  const startingChoice = script['startingChoice'];
  const description = script['description'];
  if (startingChoice !== undefined && !isStartingChoiceId(startingChoice)) refuse('startingChoice');
  if (
    description !== undefined &&
    (typeof description !== 'string' || !description.trim() || description.length > 2000)
  )
    refuse('description');
  if (startingChoice === undefined && description === undefined) refuse('opening');
  if (script['stopOnBrief'] !== undefined && typeof script['stopOnBrief'] !== 'boolean')
    refuse('stopOnBrief');
  const ending = script['ending'];
  // Proof: bypassing this predicate admitted malformed/conflicting endings in the corpus boundary test.
  if (
    ending !== undefined &&
    (ending !== 'exploration' ||
      script['stopOnBrief'] !== undefined ||
      script['transportFault'] !== undefined)
  )
    refuse('ending');
  const transportFault = script['transportFault'];
  if (
    transportFault !== undefined &&
    transportFault !== 'truncation' &&
    transportFault !== 'refusal'
  )
    refuse('transportFault');
  const turns = script['turns'];
  if (!Array.isArray(turns) || turns.length > 7) return refuse('turn count');
  const parsed = turns.map((turn: unknown): ScopingTurn => {
    if (!isRecord(turn) || !hasKeys(turn, ['message', 'answers', 'edit'])) return refuse('turn');
    const message = turn['message'];
    if (
      message !== undefined &&
      (typeof message !== 'string' || !message.trim() || message.length > 2000)
    )
      return refuse('message');
    let answers: ScopingTurn['answers'];
    if (turn['answers'] !== undefined) {
      if (!isRecord(turn['answers']) || Object.keys(turn['answers']).length === 0)
        return refuse('answers');
      answers = {};
      for (const [question, answer] of Object.entries(turn['answers'])) {
        // Proof: eval-scoping.test rejects a forged answer before any provider call.
        if (
          !isQuestionId(question) ||
          typeof answer !== 'string' ||
          !getScopingQuestion(question).answers.some((choice) => choice.id === answer)
        )
          return refuse(`answer for ${question}`);
        answers[question] = answer;
      }
    }
    let edit: ScopingTurn['edit'];
    if (turn['edit'] !== undefined) {
      const candidate = turn['edit'];
      if (!isRecord(candidate)) return refuse('edit');
      if (candidate['kind'] === 'decline_email' && hasKeys(candidate, ['kind']))
        edit = { kind: 'decline_email' };
      else if (
        candidate['kind'] === 'references' &&
        hasKeys(candidate, ['kind', 'references']) &&
        typeof candidate['references'] === 'string' &&
        candidate['references'].length <= 4000
      )
        edit = { kind: 'references', references: candidate['references'] };
      else return refuse('edit');
    }
    if (message === undefined && answers === undefined) return refuse('empty turn');
    return {
      ...(typeof message === 'string' ? { message } : {}),
      ...(answers ? { answers } : {}),
      ...(edit ? { edit } : {}),
    };
  });
  return {
    protocol: 'scoping',
    ...(isStartingChoiceId(startingChoice) ? { startingChoice } : {}),
    ...(typeof description === 'string' ? { description } : {}),
    turns: parsed,
    // Proof: implicitly opting ordinary scenarios into exploration failed the mounted undeclared-closure negative.
    stopOnBrief: ending !== 'exploration' && script['stopOnBrief'] !== false,
    ...(ending === 'exploration' ? { ending } : {}),
    ...(transportFault === 'truncation' || transportFault === 'refusal' ? { transportFault } : {}),
  };
}
/** Reads only the live question and revision from the mounted API; malformed state blocks evaluation. */
export function readScopingState(view: unknown) {
  const scoping = isRecord(view) ? view['scoping'] : undefined;
  if (
    !isRecord(scoping) ||
    scoping['version'] !== 1 ||
    (scoping['questionId'] !== null && !isQuestionId(scoping['questionId'])) ||
    typeof scoping['revision'] !== 'number' ||
    !Number.isSafeInteger(scoping['revision']) ||
    scoping['revision'] < 0 ||
    (scoping['candidateBrief'] !== null && typeof scoping['candidateBrief'] !== 'string') ||
    typeof scoping['emailInvitationDeclined'] !== 'boolean'
  )
    throw new Error('Evaluation conversation has malformed scoping state');
  return {
    questionId: scoping['questionId'],
    revision: scoping['revision'],
    candidateBrief: scoping['candidateBrief'],
    emailInvitationDeclined: scoping['emailInvitationDeclined'],
    references: scoping['references'],
  };
}

/**
 * Bounded English-corpus proxy for a browsing/example next step, never a model-quality verdict.
 * A saved/candidate brief is checked separately; explicit invented project assertions also fail.
 */
export function hasExploratoryGuidance(reply: string): boolean {
  // Proof: bypassing guidance passed the mounted unhelpful ending; removing the project guard passed invented-project.
  return (
    /\b(?:browse|browsing|explore|exploring)\b[^.!?\n]{0,100}\b(?:examples|options)\b|\b(?:come back|return)\b[^.!?\n]{0,100}\b(?:task|goal|idea)\b/i.test(
      reply,
    ) &&
    !/\b(?:your|this) (?:project|business|app)\b[^.!?\n]{0,60}\b(?:will|needs?|requires?)\b/i.test(
      reply,
    )
  );
}

/**
 * The visible acknowledgement before the catalogue question in a freshly committed structured
 * reply. Exact-label v6 presentation has an omitted acknowledgement and returns an empty string.
 * {@link getScopingQuestion} supplies the exact label.
 * Call only when the committed revision advanced; refusal replies retain an older question.
 */
export function readAcknowledgement(reply: string, questionId: QuestionId): string {
  const label = getScopingQuestion(questionId).label;
  if (reply === label) return '';
  // Proof: keeping the catalogue suffix failed the mounted valid declarative-acknowledgement control.
  return reply.slice(0, -(label.length + 2));
}
