import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Button, buttonVariants } from './button';

/** The class list of the one `<button>` a markup string holds. */
function classesOf(markup: string): string[] {
  const match = /class="([^"]*)"/.exec(markup);
  if (match?.[1] === undefined) throw new Error(`no class attribute in ${markup}`);
  return match[1].split(' ');
}

describe('<Button>', () => {
  it('renders its children', () => {
    expect(renderToStaticMarkup(<Button>Click me</Button>)).toContain('>Click me</button>');
  });

  it('lets the outline variant put its edge back over the base border-0', () => {
    const classes = classesOf(renderToStaticMarkup(<Button variant="outline">Outline</Button>));
    expect(classes).toContain('border');
    expect(classes).toContain('border-control-edge');
    expect(classes).not.toContain('border-0');
  });

  // The `<Button>` case above cannot see this: the component merges again
  // through `cn` with its `className`. A caller putting the classes on its own
  // `<a>` has only `buttonVariants`, so the merge is asserted there.
  // Proof: with `buttonVariants` returning `buttonClasses(props)` unmerged,
  // this failed on `expect(received).not.toContain(expected)` with
  // `Expected to not contain: "border-0"`, the outline classes carrying both
  // `border-0` and `border`. Watched 2026-10-21.
  it('merges the outline classes for a caller that takes them raw', () => {
    const classes = buttonVariants({ variant: 'outline' }).split(' ');
    expect(classes).toContain('border');
    expect(classes).not.toContain('border-0');
    expect(classes).not.toContain('bg-transparent');
  });

  // Proof: with `border-0 bg-transparent` removed from the base, this failed on
  // `expect(received).toContain(expected)` with `Expected to contain:
  // "border-0"`. Watched 2026-10-21.
  it('neutralises the platform button face itself, without preflight', () => {
    const classes = classesOf(renderToStaticMarkup(<Button variant="ghost">Ghost</Button>));
    expect(classes).toContain('border-0');
    expect(classes).toContain('bg-transparent');
  });

  it('draws a pressed toggle filled in the primary', () => {
    const classes = classesOf(
      renderToStaticMarkup(
        <Button variant="outline" aria-pressed="true">
          Toggle
        </Button>,
      ),
    );
    expect(classes).toContain('aria-pressed:bg-primary');
    expect(classes).toContain('aria-pressed:text-primary-foreground');
    expect(classes).toContain('aria-pressed:border-primary');
  });
});
