import {
  executeFoundationRegistryCommand,
  type FoundationRegistryCommand,
  type FoundationRegistryCommandResponse,
  type FoundationRegistryEnrollment,
  type FoundationRegistryJournal,
  type FoundationRegistryJournalPorts,
} from './registry-journal-core';

/** Trusted identity/limits; journalMaximumBytes caps the complete measured domain, including unrelated occupants, not a directory quota or proof of physical isolation. */
export type RegistryEnrollment = FoundationRegistryEnrollment;
/** Strict schema1 command grammar; tokens are server-minted and no caller-supplied profile or lock bypass is accepted. */
export type RegistryCommand = FoundationRegistryCommand;
/** Schema1 ownership records. Failure fencing remains sticky through abandonment; only completion strictly below70% bytes/inodes with at least20GiB host reserve reopens. Phase/reconciliation records are trusted assertions, not physical proof. */
export type RegistryJournal = FoundationRegistryJournal;
export type RegistryCommandResponse = FoundationRegistryCommandResponse;
/** Object measurement/sync ports charge whole-filesystem statfs domains; managed installed-capacity authority is a separate explicit entrypoint. */
export type RegistryJournalPorts = FoundationRegistryJournalPorts;

/** Execute the existing explicit local schema1 API through the shared kernel-lock/durable coordinator. No catalog/bootstrap or automatic migration is selected; missing or invalid trusted state throws. */
export function executeRegistryCommand(
  directory: string,
  input: unknown,
  ports: RegistryJournalPorts,
): Promise<RegistryCommandResponse> {
  return executeFoundationRegistryCommand(directory, input, ports);
}
