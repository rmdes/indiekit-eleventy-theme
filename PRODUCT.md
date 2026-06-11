# Product

## Register

product

## Users

Two layered operator personas, plus visitors:

- **Site operators (simple mode):** non-technical owners — a writer, artist, or association member (e.g. chardonsbleus.org) who had Indiekit installed for them. They arrange their site from presets in the site-config admin UI and must never be able to break it.
- **Site operators (advanced mode):** tech-savvy IndieWeb self-hosters (e.g. rmendes.net) comfortable with zones, per-post-type layout rules, and custom blocks. They want full real-estate control without editing Nunjucks or CSS.
- **Visitors/readers:** consume the rendered static sites on any device; many arrive via webmentions, feeds, and the fediverse.

The theme is shared by every site in a multi-site deployment; all per-site variance comes from the site-config plugin at runtime (never from theme forks).

## Product Purpose

A neutral, IndieWeb-native Eleventy theme that — together with `@rmdes/indiekit-endpoint-site-config` — works as a general-purpose site builder: backend-UI-driven control of identity, branding, navigation, and full page composition (zones, sections, widgets, per-post-type layouts, standalone composed pages). Success: three different site archetypes (personal blog + streams, association/magazine site, portfolio/landing site) fully expressible from the admin UI alone, with zero theme edits.

## Brand Personality

Playful, indie, personal. The web as a personal place — warm, characterful, hand-crafted feel; the admin is allowed delight. Quietly confident craft rather than enterprise polish.

## Anti-references

- **Elementor/page-builder rot:** div soup, inline styles stored in content, arbitrary pixel positioning, 5MB pages. We compose structured, theme-guaranteed zones — never a freeform canvas.
- **Enterprise CMS admin** (Drupal/WordPress-admin grayness): dense, joyless, jargon-heavy settings forests.
- **Generic SaaS dashboard aesthetics** for the rendered sites: identical card grids, gradient heroes, cookie-cutter landing pages.

## Design Principles

1. **Semantics are sacred.** No configuration an operator can produce may break microformats (h-entry, h-card, h-feed), feeds, webmention discovery, or accessibility. Standards-compliance is enforced by the system, not by operator discipline.
2. **Structure over freedom.** Constrained zone/block composition with curated variants — the theme guarantees layout quality; operators choose intent, not pixels.
3. **Intent, not internals.** Stored configuration describes what the operator means (block types + options), never theme implementation (template paths, CSS classes). The theme can evolve without migrating sites.
4. **Preset-first, power beneath.** Simple mode is the default and fully sufficient; advanced control is progressive disclosure, never a prerequisite.
5. **Performance is a feature.** No configuration may tank Core Web Vitals; layout primitives are precompiled, content is server-rendered, embeds are lazy.

## Accessibility & Inclusion

WCAG AA everywhere — rendered sites AND the builder admin UI. Composition editing must be fully keyboard-operable (non-pointer equivalents for add/move/remove/configure). APCA contrast validation already guards branding choices; the same philosophy extends to all builder output. Reduced-motion alternatives for all admin and theme motion.
