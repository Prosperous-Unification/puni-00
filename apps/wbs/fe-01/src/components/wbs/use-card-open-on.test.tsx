import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

import { type CellCards, createCellCards } from './cell-card-store';
import { useCardOpenOn } from './use-card-open-on';

afterEach(cleanup);

describe('cell-card React delivery', () => {
  it('renders only when its selected cell opens or closes', () => {
    const cards = createCellCards();
    let renders = 0;
    const { result: reading } = renderHook(() => {
      renders += 1;
      return useCardOpenOn(cards, 'a:name');
    });
    expect(reading.current).toBe(false);
    const initialRenders = renders;
    act(() => {
      cards.updateHovered(() => 'b:name');
    });
    act(() => {
      cards.updateHovered(() => 'c:name');
    });
    expect(reading.current).toBe(false);
    expect(renders).toBe(initialRenders);
    act(() => {
      cards.updateHovered(() => 'a:name');
    });
    expect(reading.current).toBe(true);
    expect(renders).toBe(initialRenders + 1);
    act(() => {
      cards.updateFocused(() => 'b:name');
    });
    expect(reading.current).toBe(true);
    expect(renders).toBe(initialRenders + 1);
    act(() => {
      cards.leave('a:name');
    });
    expect(reading.current).toBe(false);
    expect(renders).toBe(initialRenders + 2);
  });

  it('follows a changed cell and store', () => {
    const first = createCellCards();
    const second = createCellCards();
    first.arriveOn('a:name');
    second.arriveOn('b:name');
    let renders = 0;
    const {
      result: reading,
      rerender,
      unmount,
    } = renderHook(
      ({ cards, cell }: { cards: CellCards; cell: string }) => {
        renders += 1;
        return useCardOpenOn(cards, cell);
      },
      { initialProps: { cards: first, cell: 'a:name' } },
    );
    expect(reading.current).toBe(true);
    rerender({ cards: first, cell: 'b:name' });
    expect(reading.current).toBe(false);
    rerender({ cards: second, cell: 'b:name' });
    expect(reading.current).toBe(true);
    const switchedRenders = renders;
    act(() => {
      first.updateHovered(() => 'b:name');
    });
    expect(renders).toBe(switchedRenders);
    act(() => {
      second.leave('b:name');
    });
    expect(reading.current).toBe(false);
    expect(renders).toBe(switchedRenders + 1);
    unmount();
    act(() => {
      second.arriveOn('b:name');
    });
    expect(renders).toBe(switchedRenders + 1);
  });

  it('renders the server snapshot closed even when the store has an open card', () => {
    const cards = createCellCards();
    cards.arriveOn('a:name');
    function Reading() {
      return createElement('span', null, String(useCardOpenOn(cards, 'a:name')));
    }
    expect(renderToString(createElement(Reading))).toBe('<span>false</span>');
  });
});
