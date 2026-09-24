import { act, cleanup, render } from '@testing-library/react';
import { type ReactNode, useLayoutEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { createChannel } from '@/modules/channel';
import type { Store } from '@/modules/store';

import { useSnapshotChanges } from './use-snapshot-changes';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

afterEach(() => {
  cleanup();
});

/** A store of one number; `tell` notifies without changing anything, as a careless store might. */
interface NumberStore extends Store<number> {
  set: (next: number) => void;
  tell: () => void;
}

function numberStore(start: number): NumberStore {
  const changes = createChannel<undefined>();
  let value = start;
  return {
    subscribe: (onChange) => changes.subscribe(onChange),
    snapshot: () => value,
    set: (next) => {
      value = next;
      changes.publish(undefined);
    },
    tell: () => {
      changes.publish(undefined);
    },
  };
}

function Watching({
  store,
  onChange,
  children,
}: {
  store: Store<number>;
  onChange: (next: number, previous: number) => void;
  children?: ReactNode;
}) {
  useSnapshotChanges(store, onChange);
  return <>{children}</>;
}

/** Changes the store from its own layout effect, which runs before its parent's. */
function ChangeOnLayout({ store, to }: { store: NumberStore; to: number }) {
  useLayoutEffect(() => {
    store.set(to);
  }, [store, to]);
  return null;
}

describe('following a store’s changes', () => {
  itDom('hands on every change once, with the snapshot it replaced', () => {
    const store = numberStore(0);
    const seen: [number, number][] = [];
    render(<Watching store={store} onChange={(next, previous) => seen.push([next, previous])} />);

    act(() => {
      store.set(1);
      store.set(2);
    });

    expect(seen).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });

  itDom('catches up with a change made between its render and its subscription', () => {
    const store = numberStore(0);
    const seen: [number, number][] = [];

    render(
      <Watching store={store} onChange={(next, previous) => seen.push([next, previous])}>
        <ChangeOnLayout store={store} to={5} />
      </Watching>,
    );

    expect(seen).toEqual([[5, 0]]);
  });

  itDom('hands on nothing when told of a change that left the snapshot as it was', () => {
    const store = numberStore(0);
    const seen: [number, number][] = [];
    render(<Watching store={store} onChange={(next, previous) => seen.push([next, previous])} />);

    act(() => {
      store.tell();
    });

    expect(seen).toEqual([]);
  });

  itDom('calls the callback of the latest render and never a superseded one', () => {
    const store = numberStore(0);
    const first: number[] = [];
    const second: number[] = [];
    const view = render(<Watching store={store} onChange={(next) => first.push(next)} />);

    view.rerender(<Watching store={store} onChange={(next) => second.push(next)} />);
    act(() => {
      store.set(1);
    });

    expect(first).toEqual([]);
    expect(second).toEqual([1]);
  });

  itDom('follows a store replaced while it stays mounted, and leaves the old one', () => {
    const replaced = numberStore(0);
    const replacement = numberStore(7);
    const seen: [number, number][] = [];
    const onChange = (next: number, previous: number) => seen.push([next, previous]);
    const view = render(<Watching store={replaced} onChange={onChange} />);

    view.rerender(<Watching store={replacement} onChange={onChange} />);
    act(() => {
      replaced.set(1);
      replacement.set(8);
    });

    expect(seen).toEqual([
      [7, 0],
      [8, 7],
    ]);
  });

  itDom('hands on nothing once it is unmounted', () => {
    const store = numberStore(0);
    const seen: number[] = [];
    const view = render(<Watching store={store} onChange={(next) => seen.push(next)} />);

    view.unmount();
    store.set(1);

    expect(seen).toEqual([]);
  });
});
