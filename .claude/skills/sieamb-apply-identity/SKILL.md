---
name: sieamb-apply-identity
description: Apply the official visual identity from the design team (colors, fonts, logo, hero art). Use when the design assets arrive.
---

# Apply the SIEAmB visual identity

The entire placeholder theme is token-driven. The design handoff touches exactly these places, nothing else:

## 1. Design tokens — `packages/frontend/src/styles/tokens.css`

Replace the placeholder values: `--color-primary`, `--color-primary-dark`, `--color-primary-light`, `--color-accent`, `--color-accent-light`, and `--font-heading`/`--font-body` if the identity specifies typefaces. Keep the semantic colors (success/warning/error) legible against the new palette.

Fonts: self-host via `@font-face` in tokens.css with files in `packages/frontend/public/fonts/` (no Google Fonts CDN — keep it self-contained and LGPD-quiet).

## 2. Logo — `packages/frontend/src/components/layout/Header.tsx`

Replace the 🌿 emoji placeholder with an `<img>` pointing to the logo asset in `packages/frontend/public/` (SVG preferred). Also update:
- `favicon` — add real favicon files to `public/` and reference in `index.html`
- Footer if the identity includes a horizontal/white logo variant

## 3. Hero art — `packages/frontend/src/pages/HomePage.css`

`.hero` currently uses a gradient. If the identity has edition art, set it as background-image (put the asset in `public/`, add a dark overlay for text contrast) or set `heroImageUrl` on the event fixture and wire it in HomePage.

## 4. Verify

- Check contrast (WCAG AA) of topbar/footer text against the new primary-dark
- `npm run test && npm run test:e2e` — E2E asserts on text, not colors, so should stay green
- Responsive pass at 360px and 1440px
- Commit + push; remind Rodrigo the Pages CDN takes up to 10 min
