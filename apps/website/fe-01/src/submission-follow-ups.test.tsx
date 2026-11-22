import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { SubmissionFollowUps } from './submission-follow-ups';

test('the operator inbox lists follow-up messages in order and nothing without them', () => {
  const markup = renderToStaticMarkup(
    <SubmissionFollowUps followUps={['Also weekend slots', 'And a waitlist']} />,
  );
  expect(markup).toContain('Messages after submission');
  expect(markup.indexOf('Also weekend slots')).toBeLessThan(markup.indexOf('And a waitlist'));
  expect(renderToStaticMarkup(<SubmissionFollowUps followUps={[]} />)).toBe('');
});
