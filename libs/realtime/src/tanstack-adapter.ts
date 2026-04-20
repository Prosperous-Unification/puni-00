import type { WsFrame } from '@wbs/contracts';

import { createReconnectingWs, type ReconnectingWsOptions } from './reconnecting-ws';

export interface TanstackDbAdapterOptions extends Omit<ReconnectingWsOptions, 'onFrame'> {
  onCollectionUpdate: (subscription: string, message: unknown) => void;
}

export function createTanstackDbAdapter(opts: TanstackDbAdapterOptions) {
  return createReconnectingWs({
    ...opts,
    onFrame: (frame: WsFrame) => {
      opts.onCollectionUpdate(frame.subscription, frame.message);
    },
  });
}
