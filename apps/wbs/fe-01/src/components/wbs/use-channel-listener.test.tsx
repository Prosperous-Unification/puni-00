import { act, cleanup, render } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { type Channel, createChannel } from '@/modules/channel';

import { useChannelListener } from './use-channel-listener';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

afterEach(() => {
  cleanup();
});

/** Listens to `channel` with `listener`, and renders its children below the listener. */
function Listening({
  channel,
  listener,
  children,
}: {
  channel: Channel<string>;
  listener: (event: string) => void;
  children?: ReactNode;
}) {
  useChannelListener(channel, listener);
  return <>{children}</>;
}

/** Publishes once from its own mount effect — the way the plan feed's first read starts. */
function PublishOnMount({ channel, event }: { channel: Channel<string>; event: string }) {
  useEffect(() => {
    channel.publish(event);
  }, [channel, event]);
  return null;
}

describe('listening to a project channel', () => {
  itDom('hears an event a child publishes from its own mount effect', () => {
    const channel = createChannel<string>();
    const heard: string[] = [];

    render(
      <Listening channel={channel} listener={(event) => heard.push(event)}>
        <PublishOnMount channel={channel} event="first read refused" />
      </Listening>,
    );

    expect(heard).toEqual(['first read refused']);
  });

  itDom('calls the listener of the latest render and never a superseded one', () => {
    const channel = createChannel<string>();
    const first: string[] = [];
    const second: string[] = [];
    const view = render(<Listening channel={channel} listener={(event) => first.push(event)} />);

    view.rerender(<Listening channel={channel} listener={(event) => second.push(event)} />);
    act(() => {
      channel.publish('after the re-render');
    });

    expect(first).toEqual([]);
    expect(second).toEqual(['after the re-render']);
  });

  itDom('follows a channel replaced while it stays mounted, and leaves the old one', () => {
    const replaced = createChannel<string>();
    const replacement = createChannel<string>();
    const heard: string[] = [];
    const listener = (event: string) => heard.push(event);
    const view = render(<Listening channel={replaced} listener={listener} />);

    view.rerender(<Listening channel={replacement} listener={listener} />);
    act(() => {
      replaced.publish('from the replaced channel');
      replacement.publish('from the replacement');
    });

    expect(heard).toEqual(['from the replacement']);
  });

  itDom('hears nothing once it is unmounted, and a publication then throws nothing', () => {
    const channel = createChannel<string>();
    const heard: string[] = [];
    const view = render(<Listening channel={channel} listener={(event) => heard.push(event)} />);

    view.unmount();

    expect(() => {
      channel.publish('after the unmount');
    }).not.toThrow();
    expect(heard).toEqual([]);
  });

  itDom('lets a listener’s own failure reach the publisher by identity', () => {
    const channel = createChannel<string>();
    const failure = new Error('the toast stack is gone');
    render(
      <Listening
        channel={channel}
        listener={() => {
          throw failure;
        }}
      />,
    );

    let caught: unknown = null;
    try {
      channel.publish('refused');
    } catch (thrown: unknown) {
      caught = thrown;
    }

    expect(caught).toBe(failure);
  });
});
