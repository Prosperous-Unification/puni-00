---
status: proposed
---

# Bot deterrence is a self-hosted proof of work

Before a conversation's first paid reply, the visitor's browser solves an HMAC-signed SHA-256 proof-of-work challenge minted and verified by the website API (ALTCHA's scheme, implemented in-house with `@noble/hashes`, no widget), bound to the browser's draft claim and valid for thirty minutes, with a difficulty that doubles when the day's spend reaches half the site ceiling. Cloudflare Turnstile was the alternative: it stops more bots, but it adds a third-party processor and script to a privacy notice that today names only OpenRouter and the model host, depends on an external service for the conversion path, and requires an account and keys Dany would have to manage; it stays available as a later addition. The proof of work is a cost multiplier, not a gate: a GPU solver pays it cheaply, so the spend ceilings and the inference pause remain the controls, and the manual brief stays free of any check. Reversing this means changing the privacy page and adding a processor, which is why it is recorded.
