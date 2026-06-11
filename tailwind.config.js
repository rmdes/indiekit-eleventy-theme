import typography from "@tailwindcss/typography";

/**
 * Tailwind config — Theming v2 (Path D).
 *
 * Three tiers of color tokens, all driven by CSS variables emitted by
 * @rmdes/indiekit-endpoint-site-config:
 *
 *   Tier 1 — Palette scales (surface-50..950, accent-50..950). Escape hatch
 *            for templates that need raw palette utility classes.
 *   Tier 2 — Semantic roles (bg, fg, fg-muted, heading, link, action,
 *            action-fg, panel, border, focus). The PRIMARY template API.
 *            Templates should reach for these first; user overrides in the
 *            admin form bind directly to these.
 *   Tier 3 — Alert states (success, warning, danger + matching -fg). Fixed
 *            values, system-managed, NOT user-configurable.
 *
 * Naming note (spec §16.1): the Tier 2 panel role exposes as `bg-panel`,
 * NOT `bg-surface`. This is intentional — the Tier 1 palette occupies the
 * `surface-{50..950}` namespace, so the Tier 2 single-shade panel role uses
 * a different utility name. The underlying CSS variable is still --c-surface.
 */
const SCALE = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

function rgbVar(name) {
  return `rgb(var(${name}) / <alpha-value>)`;
}

function paletteVars(prefix) {
  return Object.fromEntries(SCALE.map((k) => [k, rgbVar(`--c-${prefix}-${k}`)]));
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./**/*.njk",
    "./**/*.md",
    "./_includes/**/*.njk",
    "./content/**/*.md",
    "./lib/**/*.js",
  ],
  // Composition container tokens (site builder Phase 1) are constructed
  // dynamically in lib/render-composition.mjs (`comp-${node.as}` etc.), so the
  // content scanner never sees the full class names. Safelist the closed
  // vocabulary so the @layer components rules in css/tailwind.css survive
  // tree-shaking. Keep in sync with containerClasses().
  safelist: [
    "comp-stack",
    "comp-columns",
    "comp-cols-2-1",
    "comp-gap-tight",
    "comp-gap-normal",
    "comp-gap-loose",
    "comp-w-narrow",
    "comp-w-default",
    "comp-w-wide",
    "comp-sticky",
    "comp-main",
    "comp-complementary",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Tier 1 — palette scales (escape hatches; templates SHOULD prefer Tier 2)
        surface: paletteVars("surface"),
        accent: paletteVars("accent"),

        // Tier 2 — semantic roles (primary template API)
        bg: rgbVar("--c-bg"),
        fg: rgbVar("--c-fg"),
        "fg-muted": rgbVar("--c-fg-muted"),
        heading: rgbVar("--c-heading"),
        link: rgbVar("--c-link"),
        action: rgbVar("--c-action"),
        "action-fg": rgbVar("--c-action-fg"),
        // `panel` — Tier 2 surface role; bound to --c-surface but exposed
        // under a distinct utility name to avoid colliding with the Tier 1
        // palette (bg-surface-100, etc).
        panel: rgbVar("--c-surface"),
        border: rgbVar("--c-border"),
        focus: rgbVar("--c-focus"),

        // Tier 3 — alerts (fixed, system-managed)
        success: rgbVar("--c-success"),
        "success-fg": rgbVar("--c-success-fg"),
        warning: rgbVar("--c-warning"),
        "warning-fg": rgbVar("--c-warning-fg"),
        danger: rgbVar("--c-danger"),
        "danger-fg": rgbVar("--c-danger-fg"),
      },
      borderColor: ({ theme }) => ({
        DEFAULT: theme("colors.border"),
        ...theme("colors"),
      }),
      ringColor: ({ theme }) => ({
        DEFAULT: theme("colors.focus"),
        ...theme("colors"),
      }),
      fontFamily: {
        sans: "var(--font-sans)",
        serif: "var(--font-serif)",
        mono: "var(--font-mono)",
      },
      maxWidth: {
        content: "720px",
        wide: "1200px",
      },
      typography: () => ({
        DEFAULT: {
          css: {
            "--tw-prose-body": "rgb(var(--c-fg) / 1)",
            "--tw-prose-headings": "rgb(var(--c-heading) / 1)",
            "--tw-prose-links": "rgb(var(--c-link) / 1)",
            "--tw-prose-bold": "rgb(var(--c-heading) / 1)",
            "--tw-prose-hr": "rgb(var(--c-border) / 1)",
            maxWidth: "none",
          },
        },
        // No `invert` block — Tier 2 variables are already mode-aware via the
        // .dark selector + @media (prefers-color-scheme: dark) emitted by
        // the plugin's theme.css generator. Setting --tw-prose-links to
        // --c-link works in both modes because --c-link itself flips.
      }),
    },
  },
  plugins: [typography],
};
