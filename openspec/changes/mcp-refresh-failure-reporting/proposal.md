# MCP refresh failures are reported

## Why

When be-01 rejects a tool call's upstream credential, mcp-01 refreshes the session and retries
once. Two failures on that path leave no operator record (WBS 080.19): a refresh that fails for
a reason other than an edge refusal or a refused session, such as the session store throwing
while the family is looked up, is treated as a refusal and silently ends the session; and an
asynchronous session end that rejects escapes the tool handler as an MCP protocol error whose
text is the raw failure message.

## What Changes

**Unexpected refresh failure**

- From: the session ends and the caller is told to reauthorize; nothing is reported.
- To: one sanitized operator record and the generic tool-result disclosure with its reference;
  the session is kept.
- Impact: non-breaking; operators see store failures that were invisible.

**Refused refresh**

- From: a missing, expired or revoked session surfaced as a plain `Error`.
- To: a typed session refusal; the session ends as before and nothing is reported.

**Rejected session end**

- From: a protocol error carrying the raw rejection text to the MCP client.
- To: one operator record and the generic tool-result disclosure; the result does not claim
  the session ended.

## Non-Goals

- Upstream refresh failures that `refreshSession` already maps to the edge-gate outcome
  (provider unreachable, lease timeout) keep that modeled outcome.
- The HTTP pre-call path (`callerSessionFor`) and the OAuth endpoints are unchanged.
- No new operator record for a modeled session end.

## Constraints

Shared failure reporting through the composition's existing reporter: exactly one record per
occurrence, no caller credential or owned secret in the record or the public text.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `failure-reporting`: the MCP tool-call boundary reports failed refreshes and failed session ends.
- `mcp-session`: a refused refresh is a typed session outcome; an unexpected one keeps the session.

## Domain Terms

None new.
