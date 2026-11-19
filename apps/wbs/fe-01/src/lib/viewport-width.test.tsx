import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useViewportWidth } from './viewport-width';

const hasDom = typeof window !== 'undefined';
const itDom = hasDom ? it : it.skip;
const initialWidth = hasDom ? window.innerWidth : null;

function Width(): React.JSX.Element {
  return <output aria-label="Viewport width">{useViewportWidth()}</output>;
}

describe('the viewport width', () => {
  afterEach(() => {
    cleanup();
    if (initialWidth !== null)
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: initialWidth,
      });
  });

  itDom('reads the actual width and follows both directions of resize', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 375 });
    render(<Width />);
    expect(screen.getByLabelText('Viewport width')).toHaveTextContent('375');
    act(() => {
      window.innerWidth = 1440;
      window.dispatchEvent(new Event('resize'));
    });
    expect(screen.getByLabelText('Viewport width')).toHaveTextContent('1440');
    act(() => {
      window.innerWidth = 767;
      window.dispatchEvent(new Event('resize'));
    });
    expect(screen.getByLabelText('Viewport width')).toHaveTextContent('767');
  });
});
