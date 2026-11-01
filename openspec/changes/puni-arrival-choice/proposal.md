# Arrival analytics choice

Visitors currently have to discover privacy controls to make an analytics choice. Expose a quiet inline choice on arrival while keeping request work usable.

The public app and private site observe the canonical analytics controller's validated preference independently of vendor readiness. Missing, malformed and expired preferences expose equal actions; persisted acceptance or rejection hides the arrival choice. Unreadable or unwritable preference storage remains explicit and actionable. Footer privacy controls remain available and initially collapsed.

This change does not alter collection, cookie scope, consent expiry, payloads, provider setup or remote deployment. It does not promise complete analytics reports. The strip stays in normal flow without moving focus, and uses the existing controller to persist choices.
