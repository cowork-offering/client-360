# Design ref: "Violet Dusk Linen" (21st.dev, serafimcloud) — Fabian-picked 2026-08-27

Founder: "found a style i like, we should adapt this also to the cockpit of course in subtle
accenture colors." → This theme's FEEL (linen-soft light surfaces, dusk-dark mode, quiet violet
accents, -0.01em tracking, soft 4px/10px shadows, 0.5rem radius) is the polish-wave direction.
Adapt to OUR tokens: primary/ring/chart-1 become Accenture #A100FF family (subtle: use their
saturation model — the theme runs a desaturated #846feb, so derive a calmer #A100FF-tinted ramp
rather than raw brand purple everywhere). Keep Graphik (brand) over Inter.

Source: https://21st.dev/community/themes/violet-dusk-linen · full CSS below (verbatim).

```css
:root {
  --background: #fbfbff; --foreground: #1a1b25; --card: #fbfbff; --card-foreground: #1a1b25;
  --popover: #ffffff; --popover-foreground: #1a1b25; --primary: #846feb;
  --primary-foreground: #ffffff; --secondary: #f0effd; --secondary-foreground: #3b3464;
  --muted: #f1f1f8; --muted-foreground: #63637e; --accent: #f0effd;
  --accent-foreground: #4b36cc; --destructive: #eb4f4f; --destructive-foreground: #ffffff;
  --border: #e2e2f2; --input: #d0d0eb; --ring: #846feb;
  --chart-1: #846feb; --chart-2: #b5a9f2; --chart-3: #3b3464; --chart-4: #d5d0f7; --chart-5: #6a57d1;
  --sidebar: #f8f8ff; --sidebar-foreground: #3f3f52; --sidebar-primary: #846feb;
  --sidebar-primary-foreground: #ffffff; --sidebar-accent: #f0effd;
  --sidebar-accent-foreground: #4b36cc; --sidebar-border: #ebebf5; --sidebar-ring: #846feb;
  --font-sans: Inter, sans-serif; --font-serif: Merriweather, serif;
  --font-mono: JetBrains Mono, monospace; --radius: 0.5rem;
  --shadow-color: #000000; --shadow-opacity: 0.05; --shadow-blur: 10px; --shadow-spread: 0px;
  --shadow-offset-x: 0px; --shadow-offset-y: 4px; --letter-spacing: -0.01em; --spacing: 0.25rem;
}
.dark {
  --background: #0b0a12; --foreground: #e6e6f2; --card: #0b0a12; --card-foreground: #e6e6f2;
  --popover: #14131f; --popover-foreground: #e6e6f2; --primary: #846feb;
  --primary-foreground: #ffffff; --secondary: #1d1b30; --secondary-foreground: #e6e6f2;
  --muted: #161524; --muted-foreground: #9898b8; --accent: #252244; --accent-foreground: #b5a9f2;
  --destructive: #811d1d; --destructive-foreground: #ffffff; --border: #222135; --input: #2c2a47;
  --ring: #846feb; --chart-1: #846feb; --chart-2: #6a57d1; --chart-3: #b5a9f2; --chart-4: #3b3464;
  --chart-5: #5244a3; --sidebar: #0d0c17; --sidebar-foreground: #c0c0d6;
  --sidebar-primary: #846feb; --sidebar-primary-foreground: #ffffff; --sidebar-accent: #1d1b30;
  --sidebar-accent-foreground: #e6e6f2; --sidebar-border: #222135; --sidebar-ring: #846feb;
  --font-sans: Inter, sans-serif; --shadow-opacity: 0.4; --shadow-blur: 20px;
  --shadow-offset-y: 8px; --letter-spacing: -0.01em; --spacing: 0.25rem; --radius: 0.5rem;
}
```
