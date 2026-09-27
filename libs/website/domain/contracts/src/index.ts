export type ProposalStatus = 'submitted' | 'reviewing' | 'contacted' | 'closed';

export interface DraftView {
  description: string;
  brief: string;
  csrfToken: string;
  expiresAt: string;
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
