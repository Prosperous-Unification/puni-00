---
status: proposed
---

# UI kits own their primitives; core owns only the vocabulary

PUNI's surfaces are built from numbered UI kits (`@ui/saas-01`, later `@ui/agency-site-01`) that each own a complete theme and their own styled components, over one core (`@ui/core-01`) that holds shadcn's token vocabulary, the brand constants and helpers, and no component. Two kits wanting a Button means two Buttons. The alternative, one shared primitive layer that kits restyle, was rejected: it is the abstraction that drifts first, it forces a dense editor and a marketing site to agree on one component API, and it is the opposite of the copy-and-own convention every UI generator already follows. Shared behaviour moves down to core only once two kits carry the same code. The vocabulary is shadcn's rather than the website's (`--ink`, `--paper`) because it is what generators and agent tools speak, so a component vendored or generated against it needs no translation. The number on a kit is a lifetime, as on `be-01`: a `saas-02` can coexist with `saas-01` during a migration. Reversing this means merging kits into one component layer, which is why it is recorded.
