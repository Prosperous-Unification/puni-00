/**
 * Finite wire capacity for every website write. JSON can encode each UTF-16 unit as six
 * ASCII bytes: an 8,000-unit brief plus 254-unit email, 128-byte key, version and field
 * syntax fits below 64 KiB. Separate 4,000-unit reference saves and percent-encoded
 * 2,000-unit native intakes also fit. Schema limits still bound accepted field lengths.
 * Proof: restoring 12,000 bytes failed maximum multibyte/escaped API and source-main saves.
 */
export const requestBodyByteLimit = 64 * 1024;
