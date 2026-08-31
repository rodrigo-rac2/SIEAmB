---
name: sieamb-new-edition
description: Create a new event edition and archive the previous one (yearly rollover). Use when a new SIEAmB edition starts.
---

# Roll over to a new SIEAmB edition

The domain always loads the current edition; old ones stay browsable read-only.

## Steps (Phase 0 / fixture mode)

1. In `packages/frontend/src/data/events.json`:
   - Set `isCurrent: false` and `isArchived: true` on the outgoing edition
   - Add the new event object: next `edition` number, new `slug` (the year, e.g. "2027"), `isCurrent: true`, real dates when known
   - Exactly ONE event may have `isCurrent: true` (tests enforce this)
2. Add the new edition's content to every other fixture (`importantDates`, `thematicAreas`, `feeTiers`, `committee`, `sponsors`, `news`) scoped to the new `eventId`. Copy-and-adjust from the previous edition is fine as a starting point.
3. Old edition keeps its fixtures — do NOT delete them; that's the archive.
4. Update E2E smoke tests that hardcode the current slug (`/2026/` appears in `packages/e2e/tests/smoke.spec.ts`).
5. `npm run test && npm run test:e2e`, commit, push.

## Once Supabase/backend is live (Phase 1+)

The rollover becomes data-only: insert the new `events` row, flip `is_current` (partial unique index enforces single current), seed tiers/dates/areas via admin panel or seed script. No code change should be needed — if one is, that's a bug in the multi-event abstraction; fix the abstraction.
