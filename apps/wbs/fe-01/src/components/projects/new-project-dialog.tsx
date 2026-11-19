import { Button, Input, Label } from '@ui/saas-01';
import type { SubmitEvent } from 'react';

import {
  Modal,
  ModalContent,
  type ModalContentProps,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/wbs/modal';

/** The page's creation outcome, without its catalog, network or committed identities. */
export type NewProjectDialogState =
  | { kind: 'editing' }
  | { kind: 'creating' }
  | { kind: 'created-refreshing' }
  | { kind: 'refused'; message: string }
  | { kind: 'created-refresh-failed' }
  | { kind: 'created-unavailable' }
  | { kind: 'unconfirmed' };

function describeCreation(
  state: NewProjectDialogState,
): { role: 'status' | 'alert'; text: string } | null {
  switch (state.kind) {
    case 'editing':
      return null;
    case 'creating':
      return { role: 'status', text: 'Creating project…' };
    case 'created-refreshing':
      return { role: 'status', text: 'Refreshing lists…' };
    case 'refused':
      return { role: 'alert', text: state.message };
    case 'created-refresh-failed':
      return { role: 'alert', text: 'Project created; lists could not be refreshed.' };
    case 'created-unavailable':
      return { role: 'alert', text: 'Project created, but it is currently unavailable.' };
    case 'unconfirmed':
      return {
        role: 'alert',
        text: 'Creation could not be confirmed. Refresh the project list before trying again.',
      };
    default: {
      const unexpected: never = state;
      throw new Error('Unknown project creation dialog state: ' + String(unexpected));
    }
  }
}

/**
 * The controlled names and progress of one explicit project/package creation.
 * Networking, synchronous submission ownership and refresh/navigation belong to
 * the page. Pending dismissal is ignored; a context withdrawal can still close
 * the controlled surface without claiming that a server write was cancelled.
 */
export function NewProjectDialog({
  open,
  state,
  projectName,
  workPackageName,
  onProjectNameChange,
  onWorkPackageNameChange,
  onOpenChange,
  onCreate,
  onRetryRefresh,
  onCloseAutoFocus,
}: {
  open: boolean;
  state: NewProjectDialogState;
  projectName: string;
  workPackageName: string;
  onProjectNameChange: (name: string) => void;
  onWorkPackageNameChange: (name: string) => void;
  onOpenChange: (open: boolean) => void;
  onCreate: (projectName: string, workPackageName: string) => void;
  onRetryRefresh: () => void;
  /** Optional presentation hand-back; the page retains and validates the exact opening summary. */
  onCloseAutoFocus?: ModalContentProps['onCloseAutoFocus'];
}): React.JSX.Element {
  const isPending = state.kind === 'creating' || state.kind === 'created-refreshing';
  const canEdit = state.kind === 'editing' || state.kind === 'refused';
  const canCreate = canEdit && projectName.trim() !== '' && workPackageName.trim() !== '';
  const canRetryRefresh =
    state.kind === 'created-refresh-failed' || state.kind === 'created-unavailable';
  const feedback = describeCreation(state);
  const submitCreation = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate) return;
    onCreate(projectName, workPackageName);
  };
  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) onOpenChange(nextOpen);
      }}
    >
      <ModalContent
        onCloseAutoFocus={onCloseAutoFocus}
        closeButton={false}
        className="sm:max-w-lg"
        onEscapeKeyDown={(event) => {
          if (isPending) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (isPending) event.preventDefault();
        }}
      >
        <ModalHeader>
          <ModalTitle>New project</ModalTitle>
          <ModalDescription>
            Name the project and the first work package to create together.
          </ModalDescription>
        </ModalHeader>
        <form
          aria-label="Create project and first work package"
          aria-busy={isPending}
          className="space-y-4"
          onSubmit={submitCreation}
        >
          <Label className="grid gap-2">
            Project name
            <Input
              value={projectName}
              disabled={!canEdit}
              required
              onChange={(event) => { onProjectNameChange(event.currentTarget.value); }}
            />
          </Label>
          <Label className="grid gap-2">
            First work package name
            <Input
              value={workPackageName}
              disabled={!canEdit}
              required
              onChange={(event) => { onWorkPackageNameChange(event.currentTarget.value); }}
            />
          </Label>
          {feedback !== null && (
            <p
              role={feedback.role}
              className={
                feedback.role === 'alert'
                  ? 'text-destructive text-sm'
                  : 'text-muted-foreground text-sm'
              }
            >
              {feedback.text}
            </p>
          )}
          <ModalFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => { onOpenChange(false); }}
            >
              {canEdit || isPending ? 'Cancel' : 'Close'}
            </Button>
            {canEdit && (
              <Button type="submit" disabled={!canCreate}>
                Create project
              </Button>
            )}
            {canRetryRefresh && (
              <Button type="button" onClick={onRetryRefresh}>
                Retry refresh
              </Button>
            )}
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
