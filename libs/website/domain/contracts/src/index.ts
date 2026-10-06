export type ProposalStatus = 'submitted' | 'reviewing' | 'contacted' | 'closed';

export interface DraftView {
  description: string;
  brief: string;
  csrfToken: string;
  expiresAt: string;
}

/** Server-owned conversation stage; the UI offers affordances by stage, never by model text. */
export type ConversationStage = 'clarify' | 'brief' | 'contact' | 'exhausted' | 'handed_off';

/** The stage a paid reply is written for; recorded on each conversation operation. */
export type ConversationReplyStage = 'clarify' | 'brief' | 'contact';

/** Stored lifecycle of an anonymous conversation; see {@link deriveStage}. */
export type ConversationState = 'open' | 'exhausted' | 'handed_off';

/** Visitor turns per anonymous conversation, the Home request included. */
export const conversationTurnLimit = 8;

/**
 * The stage of the reply to the next visitor turn: the first two are `clarify`, the third is
 * `brief` and every later one is `contact`.
 */
export function deriveReplyStage(completedVisitorTurns: number): ConversationReplyStage {
  if (!Number.isSafeInteger(completedVisitorTurns) || completedVisitorTurns < 0)
    throw new Error('Completed visitor turns must be a nonnegative integer');
  const answering = completedVisitorTurns + 1;
  if (answering <= 2) return 'clarify';
  return answering === 3 ? 'brief' : 'contact';
}

/**
 * The server-owned stage of a stored conversation: a closed state wins, otherwise the stage of
 * the next reply ({@link deriveReplyStage}). The browser never chooses it.
 */
export function deriveStage(
  state: ConversationState,
  completedVisitorTurns: number,
): ConversationStage {
  if (state === 'exhausted' || state === 'handed_off') return state;
  return deriveReplyStage(completedVisitorTurns);
}

/** Who answers the anonymous conversation; `disabled` means no stream request is admitted. */
export type ConversationProvider = 'openrouter' | 'demo' | 'disabled';

export type ConversationExhaustedReason =
  'turns' | 'conversation_spend' | 'source_spend' | 'site_spend';

export interface ConversationOperationView {
  state: 'not-started' | 'inflight' | 'completed' | 'unknown';
  idempotencyKey: string;
  truncated: boolean;
}

/** `GET /conversation`: the claim-bound anonymous conversation over one intake draft. */
export interface ConversationView {
  stage: ConversationStage;
  turns: { role: 'user' | 'assistant'; content: string }[];
  visitorTurnsRemaining: number;
  provider: ConversationProvider;
  brief: string;
  description: string;
  csrfToken: string;
  initialOperation: ConversationOperationView | null;
  latestOperation: (ConversationOperationView & { message: string }) | null;
  exhaustedReason: ConversationExhaustedReason | null;
}

export interface SubmissionView {
  id: string;
  description: string;
  brief: string;
  email: string;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export type ConceptTemplate = 'booking' | 'workflow' | 'dashboard';

export interface ConceptView {
  kind: 'concept';
  template: ConceptTemplate;
  title: string;
  summary: string;
  sections: { title: string; body: string }[];
  simulated: true;
  provider: 'demo' | 'openrouter';
  subject: string;
  revision: 0 | 1;
}
export * from './brief';
export * from './reply-stream';
