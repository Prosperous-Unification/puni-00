import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuthForm } from './auth-form';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/**
 * The accessible shape of the signed-out screen, which is what the shadcn swap
 * had to keep and — in one place — did not.
 *
 * This file exists because of that miss. `F shadcn-foundation` moved the form
 * into a `Card`, and the registry's `CardTitle` is a `div`, so "Log in" stopped
 * being a heading and nothing said so: every test and both browser specs found
 * the *controls* by label, and no assertion anywhere in the repository asked
 * what the title was. The suite went green on a page whose outline had lost a
 * level. Two reviewers found it by reading.
 *
 * The lesson is the one R5 keeps teaching, in its other form: a contract with
 * no assertion behind it is not kept, it is merely un-contradicted.
 *
 * Proof: `CardTitle` put back to a `div`, `names itself with a heading` failed
 * on `Unable to find an accessible element with the role "heading" and name
 * "Log in"`. Watched 2026-08-09; quoted in
 * `openspec/changes/shadcn-foundation/verify.md`.
 */
describe('the signed-out screen', () => {
  const nothing = () => {
    // The tests here never sign in; the callback is required and unused.
  };

  itDom('names itself with a heading', () => {
    render(<AuthForm onSignedIn={nothing} />);

    expect(screen.getByRole('heading', { name: 'Log in' })).toBeDefined();
  });

  itDom('renames that heading when the mode changes', () => {
    render(<AuthForm onSignedIn={nothing} />);

    fireEvent.click(screen.getByRole('button', { name: 'Need an account? Register' }));

    expect(screen.getByRole('heading', { name: 'Register' })).toBeDefined();
  });

  // The labels wrap their controls rather than pointing at them with `htmlFor`,
  // and this is the assertion that says so — the swap's whole aria claim rests
  // on it, and it was made in `verify.md` before anything checked it here.
  itDom('labels both fields, by nesting rather than by id', () => {
    render(<AuthForm onSignedIn={nothing} />);

    expect(screen.getByLabelText('Username')).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByLabelText('Password')).toBeInstanceOf(HTMLInputElement);
  });

  itDom('names its submit for the mode it is in', () => {
    render(<AuthForm onSignedIn={nothing} />);

    expect(screen.getByRole('button', { name: 'Log in' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Need an account? Register' }));
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDefined();
  });
});
