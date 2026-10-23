import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { CardTitle } from './card';

describe('<CardTitle>', () => {
  it('is an h2 by default', () => {
    expect(renderToStaticMarkup(<CardTitle>Sign in</CardTitle>)).toStartWith('<h2 ');
  });

  it('takes the heading level it is given', () => {
    expect(renderToStaticMarkup(<CardTitle as="h3">Sign in</CardTitle>)).toStartWith('<h3 ');
  });
});
