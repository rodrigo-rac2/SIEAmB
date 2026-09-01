# ADR-001: Per-edition visual themes

**Date:** 2026-09-01 · **Status:** Accepted, implemented

## Context

The committee confirmed (Najara, WhatsApp, 2026-09-01, answering the design team): *"O site será permanente, mas a paleta do layout será mudada a cada edição."* The site hosts every edition simultaneously (multi-event routing under `/:eventSlug/`), and archived editions must keep looking the way they looked in their year. A single global stylesheet cannot express that.

## Decision

Two-layer theming:

1. **`packages/frontend/src/styles/tokens.css`** — global CSS custom properties (colors, fonts, spacing). These are the *neutral defaults and fallbacks*, not any edition's identity.
2. **`EventTheme` per event** — the event record (fixture `events.json` today, `events` table later) carries an optional `theme` object typed as `EventTheme` in `@sieamb/shared` (`primary`, `primaryDark`, `primaryLight`, `accent`, `accentLight`, `headingFont`, `bodyFont`). `eventThemeVars()` (`packages/frontend/src/lib/theme.ts`) maps it to CSS custom-property overrides, and `PageLayout` applies them as inline style on the `.event-shell` wrapper that encloses TopBar, Header, main and Footer.

Because every component consumes colors exclusively via `var(--...)`, the override cascades to the whole edition with zero component changes. Omitted fields fall back to tokens.css. Events with `theme: null` render the defaults.

## Consequences

- **Current edition identity goes in the event's `theme`**, not in tokens.css — so the yearly rollover (skill `sieamb-new-edition`) is data-only: new event row with a new theme, old edition freezes with its palette.
- Pages outside an event context (e.g. `/edicoes-anteriores`) render the neutral defaults.
- Structural tokens (spacing, radii, shadows) stay global on purpose — editions change palette/typeface, not layout.
- Non-color assets (logo, hero art) are event fields (`heroImageUrl`, future `logoUrl`), same pattern.
- Tests pin the behavior: unit tests on `eventThemeVars`, E2E asserting `/2026/` and `/2025/` render different topbar colors (2025 ships a demo blue theme as living proof).

## Alternatives rejected

- **Swap tokens.css per deployment**: would retheme archived editions retroactively — exactly what the committee doesn't want.
- **CSS files per edition** (`theme-2026.css`…): works, but rollover needs code + build changes; data-driven themes need none, and Phase 1's admin panel can eventually edit them.
