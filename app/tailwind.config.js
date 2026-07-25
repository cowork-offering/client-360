/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    // Semantic colors map to the tokens in styles/tokens.css. Components never
    // hardcode a hex — same rule as the LWC design-token mandate.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      surface: "var(--surface)",
      raised: "var(--surface-raised)",
      overlay: "var(--surface-overlay)",
      border: "var(--border)",
      "border-strong": "var(--border-strong)",
      ink: "var(--ink)",
      "ink-muted": "var(--ink-muted)",
      "ink-label": "var(--ink-label)",
      "ink-body": "var(--ink-body)",
      "ink-body-strong": "var(--ink-body-strong)",
      "ink-faint": "var(--ink-faint)",
      wash: "var(--surface-overlay)",
      "wash-2": "var(--wash-2)",
      divider: "var(--row-divider)",
      accent: "var(--accent)",
      "accent-ink": "var(--accent-ink)",
      "accent-wash": "var(--accent-wash)",
      positive: "var(--positive)",
      warning: "var(--warning)",
      critical: "var(--critical)",
      info: "var(--info)",
    },
    extend: {
      fontFamily: {
        sans: "var(--font-sans)",
        mono: "var(--font-mono)",
      },
      fontSize: {
        "2xs": ["10.5px", "1.3"],
      },
    },
  },
  plugins: [],
};
