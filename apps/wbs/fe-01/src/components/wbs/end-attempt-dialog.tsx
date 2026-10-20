import { Button, Input, Label } from '@ui/saas-01';
import { useState } from 'react';

import type { AttemptOutcomeView } from '@/lib/wbs-api';

import { OUTCOME_WORDS } from './attempt-words';
import {
  Modal,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from './modal';

/** The node whose running attempt is being ended, as the dialog names it. */
export interface EndingAttempt {
  rowId: string;
  stepId: string;
  attemptNumber: number;
  /** The node's canonical reference, or `Dev for 010` for an uncoded one. */
  label: string;
}

/** The three outcomes in the order the dialog offers them: the hoped-for one first. */
const OUTCOMES: readonly AttemptOutcomeView[] = ['succeeded', 'failed', 'cancelled'];

/** What each outcome means, under its word. */
const OUTCOME_SENTENCES: Readonly<Record<AttemptOutcomeView, string>> = {
  succeeded: 'The run did what it set out to do.',
  failed: 'The run ended without the result; another attempt may follow.',
  cancelled: 'The run was stopped before it could say either.',
};

export interface EndAttemptDialogProps {
  ending: EndingAttempt;
  /**
   * The chosen outcome and the typed reference — trimmed, `undefined` when
   * empty — once, on the confirm button or Enter.
   */
  onEnd: (outcome: AttemptOutcomeView, reference: string | undefined) => void;
  /** `false` on Cancel, Escape or a click outside: nothing was sent. */
  onOpenChange: (open: boolean) => void;
}

/**
 * Ends a step node's running attempt (`step-node-attempts` D7): the three
 * outcomes and a reference box, then one `endAttempt` through the batch, now by
 * be-01's clock.
 *
 * A dialog of the table's rather than a form inside the step card: the card is
 * a hover surface that closes when the pointer leaves it, and a reference
 * half-typed into a surface that can vanish under a drifting hand is a draft
 * lost. **Cancelling writes nothing**, as the completion prompt's does; ending
 * is held back until an outcome is chosen, since be-01 has no default for one.
 */
export function EndAttemptDialog({ ending, onEnd, onOpenChange }: EndAttemptDialogProps) {
  const [outcome, setOutcome] = useState<AttemptOutcomeView | null>(null);
  const [reference, setReference] = useState('');
  const submit = (): void => {
    // Proof: this guard removed with the button's `disabled`, `holds End back
    // until an outcome is chosen` failed: the button was enabled with no
    // outcome chosen; watched 2026-10-12.
    if (outcome === null) return;
    const typed = reference.trim();
    onEnd(outcome, typed === '' ? undefined : typed);
  };
  const referenceId = `end-attempt-reference-${ending.rowId}-${ending.stepId}`;
  return (
    <Modal open onOpenChange={onOpenChange}>
      <ModalContent side="centre" closeButton={false} className="max-w-sm">
        <ModalHeader>
          <ModalTitle>
            End attempt {String(ending.attemptNumber)} of {ending.label}
          </ModalTitle>
          <ModalDescription>
            It ends now. One Undo puts it back running, with no outcome and no reference.
          </ModalDescription>
        </ModalHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="flex flex-col gap-4"
        >
          <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-sm font-medium">How did it end?</legend>
            {OUTCOMES.map((each) => (
              <Label
                key={each}
                className="has-[:checked]:border-primary has-[:checked]:bg-muted/60 flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 font-normal"
              >
                <input
                  type="radio"
                  name="attempt-outcome"
                  value={each}
                  className="mt-1"
                  checked={outcome === each}
                  onChange={() => {
                    setOutcome(each);
                  }}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{OUTCOME_WORDS[each]}</span>
                  <span className="text-muted-foreground text-xs">{OUTCOME_SENTENCES[each]}</span>
                </span>
              </Label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor={referenceId}>Reference</label>
            <Input
              id={referenceId}
              name="reference"
              placeholder="PR #12, a run URL…"
              autoComplete="off"
              value={reference}
              onChange={(event) => {
                setReference(event.currentTarget.value);
              }}
            />
            <span className="text-muted-foreground text-xs">Optional. A link or a label.</span>
          </div>
          <ModalFooter>
            <ModalClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </ModalClose>
            <Button type="submit" disabled={outcome === null}>
              End attempt
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
