import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FrameLayoutState } from './table-frame';
import { type ColumnResize, ColumnResizeHandle } from './use-plan-layout';

const state: FrameLayoutState = {
  hasAnyNotBefore: false,
  deepestDepth: 0,
  numberingFrozen: false,
  widestDependencyChip: null,
  waitsForSeveral: false,
};

afterEach(cleanup);

/** jsdom has no native pointer capture or PointerEvent coordinates. */
function mountResize(width: number | undefined, columnId = 'number') {
  const resize: ColumnResize = { drag: vi.fn(), commit: vi.fn(), abandon: vi.fn() };
  render(
    <table>
      <thead>
        <tr>
          <th>
            <ColumnResizeHandle
              columnId={columnId}
              heading="Column"
              width={width}
              state={state}
              resize={resize}
            />
          </th>
        </tr>
      </thead>
    </table>,
  );
  const separator = screen.getByRole('separator', { name: 'Resize Column' });
  const capture = vi.fn();
  separator.setPointerCapture = capture;
  return { resize, separator, capture };
}

function point(separator: HTMLElement, name: string, pointerId: number, clientX: number) {
  const pointer = new Event(name, { bubbles: true, cancelable: true });
  Object.defineProperties(pointer, {
    pointerId: { value: pointerId },
    clientX: { value: clientX },
  });
  fireEvent(separator, pointer);
}

describe('the extracted column resize gesture', () => {
  it('uses the initial width across multiple moves and commits only on matching release', () => {
    const { resize, separator, capture } = mountResize(100);
    point(separator, 'pointermove', 7, 80);
    expect(resize.drag).not.toHaveBeenCalled();
    point(separator, 'pointerdown', 7, 20);
    expect(capture).toHaveBeenCalledExactlyOnceWith(7);
    point(separator, 'pointermove', 7, 40);
    point(separator, 'pointermove', 7, 50);
    expect(resize.drag).toHaveBeenNthCalledWith(1, 'number', 120);
    expect(resize.drag).toHaveBeenNthCalledWith(2, 'number', 130);
    expect(resize.commit).not.toHaveBeenCalled();
    point(separator, 'pointermove', 8, 90);
    point(separator, 'pointerup', 8, 90);
    expect(resize.drag).toHaveBeenCalledTimes(2);
    expect(resize.commit).not.toHaveBeenCalled();
    point(separator, 'pointerup', 7, 60);
    expect(resize.commit).toHaveBeenCalledExactlyOnceWith('number', 140);
    point(separator, 'pointermove', 7, 80);
    point(separator, 'pointerup', 7, 80);
    expect(resize.drag).toHaveBeenCalledTimes(2);
    expect(resize.commit).toHaveBeenCalledTimes(1);
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator.style.touchAction).toBe('none');
  });

  it('abandons a cancelled gesture without committing and ignores later events', () => {
    const { resize, separator } = mountResize(100);
    point(separator, 'pointercancel', 7, 20);
    expect(resize.abandon).not.toHaveBeenCalled();
    point(separator, 'pointerdown', 7, 20);
    point(separator, 'pointermove', 7, 40);
    point(separator, 'pointercancel', 7, 40);
    point(separator, 'pointermove', 7, 60);
    point(separator, 'pointerup', 7, 60);
    expect(resize.abandon).toHaveBeenCalledTimes(1);
    expect(resize.drag).toHaveBeenCalledExactlyOnceWith('number', 120);
    expect(resize.commit).not.toHaveBeenCalled();
  });

  it('measures an unresolved Name once and clamps its width', () => {
    const { resize, separator } = mountResize(undefined, 'name');
    const header = separator.closest('th');
    if (header === null) throw new Error('test has no header');
    const measure = vi
      .spyOn(header, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 300, 0));
    point(separator, 'pointerdown', 7, 20);
    point(separator, 'pointermove', 7, 40);
    expect(resize.drag).toHaveBeenLastCalledWith('name', 320);
    point(separator, 'pointermove', 7, -500);
    expect(resize.drag).toHaveBeenLastCalledWith('name', 200);
    point(separator, 'pointerup', 7, 1000);
    expect(resize.commit).toHaveBeenCalledExactlyOnceWith('name', 600);
    expect(measure).toHaveBeenCalledTimes(1);
  });
});
