---
status: proposed
---

# One token vocabulary carries the PUNI brand

Every product paints from one stylesheet, `@shared/ui/theme.css`, that uses shadcn's semantic token names with PUNI's brand values, and the WBS editor gives up the slate defaults it was tuned on to adopt them. The names are shadcn's rather than the website's (`--ink`, `--paper`) because they are the vocabulary every UI generator and agent tool already speaks, so a component vendored or generated against them needs no translation; the values are the website's because the website is where the brand was decided. The alternative, two palettes with a mapping layer, was rejected: it is a second thing to keep in step and the one an agent would get wrong. The cost is a repaint of WBS whose 161 UI-review findings were measured against slate; the five contrast suites re-prove the new values, and a value changes until they pass, never a threshold. Reversing this means repainting two apps, which is why it is recorded.
