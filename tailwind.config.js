import typography from "@tailwindcss/typography";

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
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: paletteVars("surface"),
        accent: paletteVars("accent"),
        primary: rgbVar("--c-primary"),
        link: rgbVar("--c-link"),
        focus: rgbVar("--c-focus"),
        success: rgbVar("--c-success"),
        warning: rgbVar("--c-warning"),
        danger: rgbVar("--c-danger"),
      },
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
            "--tw-prose-links": "rgb(var(--c-link) / 1)",
            maxWidth: "none",
          },
        },
        invert: {
          css: {
            "--tw-prose-links": "rgb(var(--c-accent-400) / 1)",
          },
        },
      }),
    },
  },
  plugins: [typography],
};
