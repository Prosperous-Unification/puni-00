import { type } from '@wbs/validation';

export const InternalPushRequest = type({
  subscription: 'string',
  seq: 'number',
  message: 'unknown',
  'trace_id?': 'string',
});
export type InternalPushRequest = typeof InternalPushRequest.infer;

export const InternalPushResponse = type({ delivered_to_sockets: 'number' });
export type InternalPushResponse = typeof InternalPushResponse.infer;

export const InternalForwardRequest = type({
  message: 'unknown',
  trace_id: 'string',
});
export type InternalForwardRequest = typeof InternalForwardRequest.infer;

export const InternalForwardResponse = type({
  ack: 'true',
  'push_responses?': 'unknown[]',
});
export type InternalForwardResponse = typeof InternalForwardResponse.infer;

export const InternalResumeRequest = type({
  resume_points: { '[string]': 'number' },
  trace_id: 'string',
});
export type InternalResumeRequest = typeof InternalResumeRequest.infer;

export const InternalResumeResponse = type({
  '[string]': [
    { status: "'replaying'", count: 'number' },
    '|',
    { status: "'denied'", reason: "'out_of_range'" },
  ],
});
export type InternalResumeResponse = typeof InternalResumeResponse.infer;
