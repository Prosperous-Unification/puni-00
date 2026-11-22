## Why

Developer visits currently feed a stream in the same GA4 property as production. Move future developer events to the new development-only property.

## What Changes

- Select the owner-provided web stream `G-1FGH62F56G` on both canonical development website origins.
- Refuse the retired development stream in new dev builds and keep both development IDs out of production.
- Use the existing consent-aware tag loader and validate the released dev bundle against the expected stream.
