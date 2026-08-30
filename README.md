# SIEAmB — Seminário Internacional de Estudos Ambientais

Conference platform for SIEAmB, hosted by UFCG (Programa de Pós-Graduação em Engenharia e Gestão de Recursos Naturais). Multi-event, multi-language (pt-BR, en, es, zh-CN).

**Live prototype:** https://rodrigo-rac2.github.io/SIEAmB/

## Stack

- **Monorepo** (npm workspaces): `packages/shared`, `packages/frontend`, `packages/e2e` (backend arrives in Phase 1)
- **Frontend**: React 18 + TypeScript + Vite + React Router + react-i18next
- **Tests**: Vitest (unit) + Playwright (E2E)
- **Deploy**: GitHub Pages (Phase 0) → Vercel + Supabase + Express (Phase 1+)

## Development

```bash
npm install
npm run dev          # frontend at http://localhost:5173
npm run test         # unit tests (shared + frontend)
npm run test:e2e     # Playwright smoke tests
npm run lint
npm run build
```

## Documentation

- [Implementation plan](docs/IMPLEMENTATION_PLAN.md) — full phased roadmap (P0 prototype → P4 certificates/anais)
- `CLAUDE.md` — conventions and architecture decisions

## Phase 0 status

- [x] Monorepo scaffold, shared types/validation (CPF, registration)
- [x] All public pages in 4 languages, multi-event routing (`/:eventSlug/*`)
- [x] News (avisos) list + detail, fee table, pre-registration form (static provider)
- [x] Unit + E2E smoke tests, CI, GitHub Pages deploy
- [ ] Supabase wiring (news + registration persistence) — next
- [ ] Official visual identity (design team) — lands in `packages/frontend/src/styles/tokens.css`
