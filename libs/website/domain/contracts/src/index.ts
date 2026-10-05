export type ProposalStatus = 'submitted' | 'reviewing' | 'contacted' | 'closed';

export interface DraftView {
  description: string;
  brief: string;
  csrfToken: string;
  expiresAt: string;
}

/** Server-owned conversation stage; the UI offers affordances by stage, never by model text. */
export type ConversationStage = 'clarify' | 'brief' | 'contact' | 'exhausted' | 'handed_off';

/** Who answers the anonymous conversation; `disabled` means no stream request is admitted. */
export type ConversationProvider = 'openrouter' | 'demo' | 'disabled';

export type ConversationExhaustedReason =
  'turns' | 'conversation_spend' | 'source_spend' | 'site_spend' | 'unsettled';

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
