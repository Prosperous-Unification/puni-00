import { type } from '@wbs/validation';

/**
 * The realtime vocabulary: every frame that crosses a socket between fe-01 and
 * gw-01, and the one place a frame is built.
 *
 * It was a partial vocabulary until 2026-09-02 and the gaps were not
 * theoretical. gw-01 sends `resume_denied` with `reason: 'unavailable'` when
 * be-01 cannot be reached; this file declared `'out_of_range'` as the only
 * reason. It sends an `error` frame naming the subscription it refused; this
 * file declared no `subscription` on that arm. And `presence`, `subscribe`,
 * `unsubscribe` and `who` were not here at all — eleven outbound frames were
 * hand-written `JSON.stringify` literals in three files, and the two tiers
 * agreed by having been written on the same afternoon.
 *
 * The builders are in `ws-frames.ts` beside this and re-exported here — they
 * **serialise**, because every sender's next move was
 * `socket.send(JSON.stringify(...))`. A frame's field names are this file's
 * now, which is what makes a divergence a compile error rather than a client
 * quietly ignoring a frame it does not recognise.
 */
export const WsFrame = type({
  subscription: 'string',
  seq: 'number',
  message: 'unknown',
});
export type WsFrame = typeof WsFrame.infer;

/** A client asking for everything it missed, per subscription. */
const ResumeFrame = type({
  type: "'resume'",
  resume_points: { '[string]': 'number' },
});

/**
 * How many frames were replayed per subscription.
 *
 * Sent **last**, after the replayed frames themselves: an acknowledgement that
 * arrived first would let a client advance its sequence past frames it has not
 * been handed. An empty map is a real answer — see `project-stream.ts`, which
 * refetches rather than reading silence as "you missed nothing".
 */
const ResumeAckFrame = type({
  type: "'resume_ack'",
  replayed: { '[string]': 'number' },
});

/**
 * The gateway cannot replay that subscription, and which of the two reasons.
 *
 * `out_of_range` is a range be-01 no longer holds — retention pruned it.
 * `unavailable` is be-01 not answering at all, so **nothing** is known about
 * the range; the client's only honest move for either is to read the whole
 * project again.
 */
const ResumeDeniedFrame = type({
  type: "'resume_denied'",
  subscription: 'string',
  reason: "'out_of_range' | 'unavailable'",
});

const PingFrame = type({ type: "'ping'" });
const PongFrame = type({ type: "'pong'" });

/** Who is on this connection's project, by username. */
const PresenceFrame = type({
  type: "'presence'",
  users: 'string[]',
});

/** A client joining or leaving one subscription's fan-out. */
const SubscribeFrame = type({
  type: "'subscribe'",
  subscription: 'string',
});
const UnsubscribeFrame = type({
  type: "'unsubscribe'",
  subscription: 'string',
});

/**
 * A client asking for the roster instead of waiting for the next join.
 *
 * A reconnecting client has missed every broadcast sent while it was away, so
 * asking is the only way to a current roster.
 */
const WhoFrame = type({ type: "'who'" });

/**
 * Something was refused, by the gateway's own word for it.
 *
 * `subscription` is present on `unknown_subscription` and absent on the others,
 * because that is the only refusal about a name the client sent.
 */
const ErrorFrame = type({
  type: "'error'",
  code: 'string',
  'subscription?': 'string',
  'retry_after?': 'number',
  'message?': 'string',
});

export const WsControlFrame = ResumeFrame.or(ResumeAckFrame)
  .or(ResumeDeniedFrame)
  .or(PingFrame)
  .or(PongFrame)
  .or(PresenceFrame)
  .or(SubscribeFrame)
  .or(UnsubscribeFrame)
  .or(WhoFrame)
  .or(ErrorFrame);
export type WsControlFrame = typeof WsControlFrame.infer;

// The builders live in `ws-frames.ts`, which imports nothing: fe-01 takes them
// as `@wbs/contracts/ws-frames`, because this barrel's arktype validators are
// deliberately outside the browser bundle (see `vitest.config.ts`'s alias
// note). Re-exported here so gw-01 has one file to read.
export * from './ws-frames';
