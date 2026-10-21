import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Input } from './input';

describe('<Input>', () => {
  it('renders an input that fills its container, with the caller’s class merged in', () => {
    const markup = renderToStaticMarkup(<Input className="w-48" aria-label="Find" />);
    expect(markup).toStartWith('<input ');
    const classes = /class="([^"]*)"/.exec(markup)?.[1]?.split(' ');
    expect(classes).toContain('w-48');
    expect(classes).not.toContain('w-full');
  });

  it('fills its container when the caller names no width', () => {
    const markup = renderToStaticMarkup(<Input aria-label="Find" />);
    expect(/class="([^"]*)"/.exec(markup)?.[1]?.split(' ')).toContain('w-full');
  });
});
