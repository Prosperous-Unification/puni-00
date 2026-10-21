# Design system

The shared visual language of PUNI's products: one vocabulary, and the kits that give it a look.

## Language

**Core**:
The one package every kit builds on: the token vocabulary, the brand constants and helpers, and no component.
_Avoid_: base, foundation package, shared ui

**Kit**:
A numbered package that owns a complete theme and its own primitives for one purpose, such as a SaaS editor or an agency site.
_Avoid_: variant, flavour, preset, skin

**Theme**:
A kit's stylesheet assigning a value to every vocabulary token in two palettes; an app imports exactly one.
_Avoid_: design tokens file, global styles, palette file

**Palette**:
One complete assignment of values to every theme token, light or dark, switched by the `dark` class on the root.
_Avoid_: mode, scheme

**Primitive**:
A component a kit exports, owned in this repo and styled only through vocabulary tokens.
_Avoid_: widget, control, shadcn component

**Variant**:
One named shape a primitive comes in, declared in its cva table and rendered in its story.
_Avoid_: style, kind

**Catalogue**:
A kit's written design spec and its Storybook together: how a person or an agent reads the kit before drawing with it.
_Avoid_: docs site, gallery, showcase

**Registry**:
The shadcn-format listing of a kit's primitives, built from the kit, that a product outside this repo pulls a component from.
_Avoid_: package, npm module, component store
