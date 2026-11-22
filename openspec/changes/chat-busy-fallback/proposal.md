## Why

A chat request blocked by a rate limit looks retryable and leaves an unusable composer on screen. Visitors can still submit their brief for human follow-up.

## What Changes

- Show a quiet busy message with Send my request now and Edit brief available.
- Hide the chat composer and Retry during the server's wait window. Restore explicit Retry when a supported wait elapses.
- Keep the attempt and draft available. Limit enforcement and manual submission remain server-controlled.

- Present the final scoped handoff as email and submit once the saved brief is ready and no question remains.

## Capabilities

### Modified Capabilities

- `build-ai-chat-harness` presents the manual route during chat cooldown.
