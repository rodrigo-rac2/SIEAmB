---
name: sieamb-update-content
description: Update event content (dates, fees, areas, committee, news) from committee-provided data. Use when Rodrigo pastes real content from Najara/Thays to replace placeholder fixtures.
---

# Update SIEAmB event content

Phase 0 content lives in JSON fixtures at `packages/frontend/src/data/`. Once Supabase is wired (see STATUS.md), the same shapes go into the seed script at `packages/backend/prisma/seed.ts` instead — check which mode is active before editing.

## Fixture files and shapes

| File | Entity | Notes |
|---|---|---|
| `events.json` | Event editions | `isCurrent: true` on exactly ONE event — this controls the root redirect. Dates are ISO with `-03:00` offset |
| `importantDates.json` | Deadlines | `sortOrder` controls display order; `isExtended: true` shows the "prorrogado" badge |
| `thematicAreas.json` | Áreas temáticas | `code` like "AT-01" |
| `feeTiers.json` | Fee matrix | `amountCents` is integer centavos (R$ 80,00 = 8000). Category × modality; missing combos render as "—" |
| `committee.json` | Organização | Grouped by `role` on the page |
| `sponsors.json` | Realização/apoio | `tier`: realizacao, patrocinio, apoio |
| `news.json` | Avisos | `status: "PUBLISHED"` to show; `isPinned` floats to top; `bodyMd` is markdown |

## Rules

- All fixture content is **pt-BR** (dynamic content is not translated in Phase 0).
- UI strings are NOT here — they live in `packages/frontend/src/locales/<locale>.json` (4 files; keep all 4 in sync when adding keys).
- Every entity needs `eventId` matching the event (`evt-2026` for the current edition).
- After editing: `npm run test && npm run build` — the StaticDataProvider tests assert on fixture invariants (current event exists, news sorted pinned-first, dates sorted).
- If dates/fees changed, check the E2E smoke assertions in `packages/e2e/tests/smoke.spec.ts` still match (they assert on some fixture text).
- Commit + push to `main` → auto-deploys to GitHub Pages (CDN takes up to 10 min to refresh).
