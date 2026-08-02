// Public entry point for consumers outside this project (nx's
// enforce-module-boundaries requires cross-project imports to go through a
// project's declared `@wbs/*` path rather than a relative/absolute one).
//
// `tool-remote-scripts`' swap executor is the reason this exists: it needs
// `renderTemplate` plus the raw text of both `.tmpl` files, imported here
// with `with { type: 'text' }` so Bun's bundler inlines them into whatever
// bundle imports this module — no template file needs to exist separately
// on the deploy target at runtime.
import siteCaddyTmplText from './templates/site.caddy.tmpl' with { type: 'text' };
import tierComposeTmplText from './templates/tier.compose.tmpl' with { type: 'text' };

export { renderAll, type RenderAllOptions, type RenderContext, renderTemplate } from './render';

export const siteCaddyTmpl: string = siteCaddyTmplText;
export const tierComposeTmpl: string = tierComposeTmplText;
