# Design system

The shared visual language of PUNI's products: what every surface is painted from and the components it is built with.

## Language

**Theme**:
The one stylesheet of semantic tokens, in two palettes, that every product imports and nothing redeclares.
_Avoid_: design tokens file, global styles, palette file

**Palette**:
One complete assignment of values to every theme token, light or dark, switched by the `dark` class on the root.
_Avoid_: mode, scheme, skin

**Primitive**:
A shared component the lib exports, owned in this repo and styled only through theme tokens.
_Avoid_: widget, control, shadcn component

**Variant**:
One named shape a primitive comes in, declared in its cva table and rendered in its story.
_Avoid_: style, kind, flavour

**Catalogue**:
The written design spec and the Storybook together: how a person or an agent reads the system before drawing with it.
_Avoid_: docs site, gallery, showcase

**Registry**:
The shadcn-format listing of the primitives, built from the lib, that a product outside this repo pulls a component from.
_Avoid_: package, npm module, component store
