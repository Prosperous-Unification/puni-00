import { type ReactNode } from 'react';

/**
 * A page that can show nothing of an organization, said as a state with a way
 * out: the headline, one plain sentence of what that means here, and the action.
 *
 * Only the headline is the `alert`, so a test or a reader hears one sentence
 * rather than the paragraph. F-014 (UI review 2026-10-13): Organization and
 * Spaces in local mode said "No organization is selected for this session."
 * and nothing else, a dead end in deployment words.
 */
export function AccessState({
  headline,
  detail,
  action,
}: {
  headline: string;
  detail: string;
  action: ReactNode;
}): React.JSX.Element {
  return (
    <section className="border-border bg-card text-card-foreground flex max-w-xl flex-col items-start gap-3 rounded-lg border p-6 shadow-sm">
      <p role="alert" className="font-semibold">
        {headline}
      </p>
      <p className="text-muted-foreground text-sm">{detail}</p>
      {action}
    </section>
  );
}
