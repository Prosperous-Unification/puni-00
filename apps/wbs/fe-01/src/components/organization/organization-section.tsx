import { type ReactNode } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SELECT_CLASS } from '@/components/ui/control';

export { CONTROL_HEIGHT, SELECT_CLASS } from '@/components/ui/control';

/** A one-line organization form: fields stacked on a phone, side by side from `sm`. */
export const FORM_CLASS = 'flex flex-col gap-3 sm:flex-row sm:items-end';

/** One field of an organization form: its caption above its control. */
export const FIELD_CLASS = 'flex flex-col gap-1.5';

/** The caption above a field in an organization form. */
export const FIELD_LABEL_CLASS = 'text-sm font-medium';

/**
 * An organization list, with the user agent's bullet, indent and margins taken
 * off: this app has no preflight (`styles.css` says why), so a bare `<ul>`
 * keeps its 40px indent inside the card.
 */
export const LIST_CLASS = 'm-0 flex list-none flex-col p-0';

/** A row of an organization list: who on the left, its controls on the right or below. */
export const ROW_CLASS = 'flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between';

/** The controls of one row, wrapping rather than overflowing on a phone. */
export const ROW_ACTIONS_CLASS = 'flex flex-wrap items-center gap-2';

/**
 * A row's role select: a line of its own on a phone, so the buttons after it
 * share the next line instead of one of them wrapping alone.
 */
export const ROW_SELECT_CLASS = `${SELECT_CLASS} basis-full sm:basis-auto`;

/** A panel's in-place outcome sentence. */
export const STATUS_CLASS = 'text-sm';

/** A panel's failure sentence. */
export const ALERT_CLASS = 'text-destructive text-sm';

/**
 * One panel of the organization page: a region named by its `h2`, drawn as the
 * Directory draws its People and Teams panels.
 *
 * The `section` carries the region role and its name, so every test that
 * finds a panel by `getByRole('region', { name })` keeps finding it; the card
 * inside is only the drawing.
 */
export function OrganizationSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <section aria-labelledby={id}>
      <Card className="border-border">
        <CardHeader>
          <CardTitle id={id}>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-4">{children}</CardContent>
      </Card>
    </section>
  );
}
