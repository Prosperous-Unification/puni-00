import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from '@/components/ui/modal';

import { IMPORT_WITH_AI_GUIDE_URL, IMPORT_WITH_AI_PROMPT } from './import-with-ai';
import { CLIPBOARD_REFUSED } from './plan-export-actions';

export interface ImportWithAiHelpProps {
  /**
   * The public MCP URL, once a live sign-in, write and refresh through it is recorded.
   *
   * Absent until then, and absence is rendered: the help says the address is not published
   * rather than offering one nobody has connected to (`guide-ai-project-imports`, "Public
   * authentication has not been proved").
   */
  verifiedMcpUrl?: string;
}

/** What the last copy of one value did, shown beside its button. */
type CopyOutcome = 'idle' | 'copied' | 'no-clipboard' | 'refused';

/**
 * Said when the page has no clipboard. Not `NO_CLIPBOARD`: that one points at the CSV,
 * and the way out here is the guide, which carries the same text.
 */
const NO_CLIPBOARD_HERE =
  'This page has no clipboard — that needs an https address. Copy it from the guide instead.';

const OUTCOME_TEXT: Record<Exclude<CopyOutcome, 'idle'>, string> = {
  copied: 'Copied.',
  'no-clipboard': NO_CLIPBOARD_HERE,
  refused: CLIPBOARD_REFUSED,
};

/**
 * Writes `text` to the clipboard and reports which of the three outcomes happened; the
 * clipboard is a permission, absent on an insecure origin and refusable after that.
 */
function useCopy(text: string): [CopyOutcome, () => void] {
  const [outcome, setOutcome] = useState<CopyOutcome>('idle');
  const copy = (): void => {
    // The DOM lib types `navigator.clipboard` as always present; it is absent on http and in
    // jsdom, so this annotation is the boundary that makes the check below reachable.
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (clipboard === undefined) {
      setOutcome('no-clipboard');
      return;
    }
    clipboard.writeText(text).then(
      () => {
        setOutcome('copied');
      },
      () => {
        setOutcome('refused');
      },
    );
  };
  return [outcome, copy];
}

/** One copy control and the sentence saying what it did, announced politely. */
function CopyControl({ label, text }: { label: string; text: string }) {
  const [outcome, copy] = useCopy(text);
  return (
    <div className="flex flex-col gap-1">
      <Button variant="outline" size="sm" type="button" className="self-start" onClick={copy}>
        {label}
      </Button>
      <p role="status" className="text-muted-foreground min-h-4 text-xs">
        {outcome === 'idle' ? '' : OUTCOME_TEXT[outcome]}
      </p>
    </div>
  );
}

/**
 * Export / Import → Import with AI: the five-step flow, the approved import prompt and a link
 * to the canonical guide.
 *
 * Deliberately no client table: vendors change their configuration faster than an fe-01
 * release, so per-client setup lives only in `docs/import-with-ai.md` and this links there.
 *
 * The trigger is a Radix {@link ModalTrigger}, which marks itself `aria-haspopup="dialog"`;
 * that is what keeps the phone's `Plan actions` sheet open under the help
 * (`closingControlIn` in `plan-toolbar-sheet.tsx`).
 */
export function ImportWithAiHelp({ verifiedMcpUrl }: ImportWithAiHelpProps) {
  return (
    <Modal>
      <ModalTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          type="button"
          data-hint="Connect an AI client to WBS and import an existing project through it"
        >
          Import with AI
        </Button>
      </ModalTrigger>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Import with AI</ModalTitle>
          <ModalDescription>
            Bring an existing project into a new WBS project through an AI client connected to WBS
            over MCP. It is a one-time copy, not a synchronization.
          </ModalDescription>
        </ModalHeader>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
          <li>Choose your AI client in the guide and add the WBS MCP server as it shows.</li>
          <li>
            Sign in through the browser when the client asks, requesting{' '}
            <code>wbs:read wbs:write</code>. Confirm the destination organization this sign-in is
            bound to, your current WBS role, and that the client can write. Switching organization
            needs fresh MCP authorization.
          </li>
          <li>
            Give the client your source: its Jira, Linear or Asana integration, Microsoft Project
            XML or CSV, or a spreadsheet.
          </li>
          <li>Copy the import prompt, fill in its brackets, and review the mapping it previews.</li>
          <li>
            Approve the destination organization and the write, then check the reconciliation it
            reports against the new project.
          </li>
        </ol>
        <section aria-labelledby="import-with-ai-connection" className="flex flex-col gap-1">
          <h3 id="import-with-ai-connection" className="text-sm font-semibold">
            Connection
          </h3>
          {verifiedMcpUrl === undefined ? (
            <p className="text-sm">
              The public MCP address is not published yet. It appears here once a live sign-in,
              write and refresh through it has been recorded.
            </p>
          ) : (
            <>
              <code className="text-sm break-all">{verifiedMcpUrl}</code>
              <CopyControl label="Copy MCP URL" text={verifiedMcpUrl} />
            </>
          )}
          <p className="text-sm">
            No AI client has a recorded live connection to WBS yet, so none is marked tested.
          </p>
        </section>
        <section aria-labelledby="import-with-ai-prompt" className="flex flex-col gap-1">
          <h3 id="import-with-ai-prompt" className="text-sm font-semibold">
            Import prompt
          </h3>
          <pre className="bg-muted max-h-40 overflow-y-auto rounded-md p-2 text-xs whitespace-pre-wrap">
            {IMPORT_WITH_AI_PROMPT}
          </pre>
          <CopyControl label="Copy import prompt" text={IMPORT_WITH_AI_PROMPT} />
        </section>
        <a
          className="text-sm underline"
          href={IMPORT_WITH_AI_GUIDE_URL}
          target="_blank"
          rel="noreferrer"
        >
          Read the full guide: client setup, source preparation and troubleshooting
        </a>
      </ModalContent>
    </Modal>
  );
}
