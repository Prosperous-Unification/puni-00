import { type } from '@wbs/validation';

export const WsFrame = type({
  subscription: 'string',
  seq: 'number',
  message: 'unknown',
});
export type WsFrame = typeof WsFrame.infer;

const ResumeFrame = type({
  type: "'resume'",
  resume_points: { '[string]': 'number' },
});

const ResumeAckFrame = type({
  type: "'resume_ack'",
  replayed: { '[string]': 'number' },
});

const ResumeDeniedFrame = type({
  type: "'resume_denied'",
  subscription: 'string',
  reason: "'out_of_range'",
});

const PingFrame = type({ type: "'ping'" });
const PongFrame = type({ type: "'pong'" });

const ErrorFrame = type({
  type: "'error'",
  code: 'string',
  'retry_after?': 'number',
  'message?': 'string',
});

export const WsControlFrame = ResumeFrame.or(ResumeAckFrame)
  .or(ResumeDeniedFrame)
  .or(PingFrame)
  .or(PongFrame)
  .or(ErrorFrame);
export type WsControlFrame = typeof WsControlFrame.infer;
