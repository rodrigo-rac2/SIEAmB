# SIEAmB — Seminário Internacional de Estudos Ambientais

Plataforma web do **SIEAmB**, evento científico promovido pela UFCG (Programa de Pós-Graduação em Engenharia e Gestão de Recursos Naturais). Este repositório contém o site do evento, com suporte a múltiplas edições e múltiplos idiomas.

🌐 **Site no ar:** https://rodrigo-rac2.github.io/SIEAmB/

📋 **Plano completo do projeto:** [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)

📌 **Status atual e histórico:** [.claude/context/STATUS.md](.claude/context/STATUS.md) e [.claude/context/HISTORY.md](.claude/context/HISTORY.md)

---

## Índice

1. [O que é este projeto](#o-que-é-este-projeto)
2. [Arquitetura e fases](#arquitetura-e-fases)
3. [Estrutura do repositório](#estrutura-do-repositório)
4. [Como rodar localmente](#como-rodar-localmente)
5. [Como o site funciona (conceitos-chave)](#como-o-site-funciona-conceitos-chave)
6. [Onde fica cada conteúdo](#onde-fica-cada-conteúdo)
7. [Testes](#testes)
8. [Fluxo de trabalho com Git (leia antes de contribuir)](#fluxo-de-trabalho-com-git)
9. [CI/CD e deploy](#cicd-e-deploy)
10. [Convenções do projeto](#convenções-do-projeto)
11. [Problemas comuns (troubleshooting)](#problemas-comuns-troubleshooting)

---

## O que é este projeto

O SIEAmB é um seminário internacional acadêmico. O site precisa de:

- **Páginas institucionais**: sobre o evento, organização, áreas temáticas, datas, local, contato
- **Sistema de avisos** (notícias do evento)
- **Inscrições** de participantes (com pagamento via Mercado Pago no futuro)
- **Submissão de artigos** científicos com revisão às cegas (fase futura)
- **Certificados** com código de validação (fase futura)

O site é **multi-edição**: cada ano é uma edição nova (ex.: `/2026/`), e as edições antigas continuam acessíveis como arquivo. O domínio raiz sempre redireciona para a edição atual.

Somos os mantenedores deste projeto daqui pra frente — o código precisa ficar sempre num estado que outra pessoa consiga assumir.

## Arquitetura e fases

O projeto evolui em fases (detalhes no [plano](docs/IMPLEMENTATION_PLAN.md)):

| Fase | O quê | Status |
|---|---|---|
| **0** | Protótipo visual + pré-inscrição, hospedado no GitHub Pages | ✅ **Concluída (estamos aqui)** |
| 1 | Backend Express + Supabase (persistência real), painel admin, e-mails | Próxima |
| 2 | Submissão de artigos com revisão double-blind | Planejada |
| 3 | Pagamento (Mercado Pago: Pix, cartão, boleto) | Planejada |
| 4 | Certificados + anais | Planejada |

**Stack:** React 18 + TypeScript + Vite (frontend) · Express.js (backend, fase 1+) · PostgreSQL/Supabase (fase 1+) · Vitest (testes unitários) · Playwright (testes E2E).

Na Fase 0 **não existe backend rodando**: o site é 100% estático e os dados vêm de arquivos JSON (fixtures). A arquitetura já está preparada para trocar a fonte de dados sem reescrever as telas (ver [DataProvider](#2-dataprovider-abstração-de-dados)).

## Estrutura do repositório

É um **monorepo** com npm workspaces — vários pacotes num repositório só:

```
SIEAmB/
├── .github/workflows/       # CI (lint+testes) e deploy para o GitHub Pages
├── .claude/                 # Contexto para sessões do Claude Code (status, histórico, skills)
├── docs/
│   └── IMPLEMENTATION_PLAN.md   # Plano completo das 5 fases
├── packages/
│   ├── shared/              # @sieamb/shared — código compartilhado entre front e back
│   │   └── src/
│   │       ├── types/       # Tipos TypeScript (Event, NewsItem, Registration…)
│   │       ├── validation/  # Schemas zod (validação do formulário de inscrição)
│   │       └── utils/       # Validador de CPF, formatação de datas/dinheiro
│   ├── frontend/            # @sieamb/frontend — o site em React
│   │   └── src/
│   │       ├── pages/       # Uma pasta = uma página (HomePage, NewsListPage…)
│   │       ├── components/  # Componentes reutilizáveis (layout, news, registration…)
│   │       ├── contexts/    # EventContext (edição atual da URL)
│   │       ├── services/    # DataProvider e implementações (static, supabase, api)
│   │       ├── locales/     # Traduções: pt-BR.json, en.json, es.json, zh-CN.json
│   │       ├── data/        # Fixtures JSON (conteúdo do site na Fase 0)
│   │       ├── styles/      # tokens.css (identidade visual) + base.css
│   │       └── i18n.ts      # Configuração de idiomas
│   └── e2e/                 # @sieamb/e2e — testes end-to-end com Playwright
│       └── tests/smoke.spec.ts
├── package.json             # Raiz: scripts que orquestram os workspaces
└── CLAUDE.md                # Convenções para sessões do Claude Code
```

**Regra de ouro:** código que serve tanto ao front quanto ao back (tipos, validação) vai em `packages/shared`, nunca duplicado.

## Como rodar localmente

Pré-requisitos: **Node.js 22** (veja `.nvmrc` — use `nvm use` se tiver nvm) e npm 10+.

```bash
# 1. Clonar e instalar (instala TODOS os pacotes de uma vez)
git clone https://github.com/rodrigo-rac2/SIEAmB.git
cd SIEAmB
npm install

# 2. Rodar o site em modo de desenvolvimento
npm run dev            # abre em http://localhost:5173 com hot-reload

# 3. Rodar os testes
npm run test           # unitários (shared + frontend)
npm run test:e2e       # end-to-end (buida o site e testa no navegador)

# 4. Checagens de qualidade (a CI roda isso em todo PR)
npm run lint
npm run typecheck

# 5. Build de produção + preview local
npm run build
npm run preview
```

Para os testes E2E na primeira vez: `npx playwright install chromium`.

## Como o site funciona (conceitos-chave)

### 1. Multi-edição (multi-evento)

Todas as rotas do site vivem embaixo de `/:eventSlug/` (ex.: `/2026/inscricoes`). O arquivo `packages/frontend/src/data/events.json` define as edições, e **exatamente uma** tem `isCurrent: true` — é para ela que a raiz `/` redireciona. Edições antigas ficam com `isArchived: true` e continuam navegáveis. O `EventContext` lê o slug da URL e disponibiliza a edição para todas as páginas.

### 2. DataProvider (abstração de dados)

Nenhuma tela chama `fetch` direto. Tudo passa pela interface `DataProvider` (`packages/frontend/src/services/`):

- `StaticDataProvider` — lê os JSONs de `src/data/` (modo atual, Fase 0)
- `SupabaseDataProvider` — lerá do Supabase (Fase 0.5/1)
- `ApiDataProvider` — lerá da API Express (Fase 1+)

A variável `VITE_DATA_PROVIDER` (`static` | `supabase` | `api`) escolhe a implementação. Isso significa que quando o backend chegar, **as telas não mudam** — só a implementação do provider.

### 3. Internacionalização (i18n)

4 idiomas: **pt-BR (padrão)**, inglês, espanhol e mandarim. Regras:

- Nenhum texto de interface é escrito direto no componente ("hardcoded"). Todo texto vem de `t('chave.da.traducao')` lendo os arquivos `src/locales/*.json`
- Ao adicionar um texto novo, adicione a chave **nos 4 arquivos**
- A primeira visita sempre renderiza pt-BR (ignoramos o idioma do navegador de propósito). A troca é pelas bandeirinhas na barra do topo e fica salva no `localStorage`
- Conteúdo dinâmico (avisos) não é traduzido na Fase 0 — só a interface

### 4. Identidade visual por tokens + tema por edição

O tema funciona em **duas camadas** (decisão registrada no [ADR-001](docs/adr/001-per-edition-themes.md)):

1. **`packages/frontend/src/styles/tokens.css`** — CSS custom properties globais (`var(--color-primary)` etc.). São os padrões neutros e o fallback, não a identidade de nenhuma edição.
2. **`theme` do evento** — cada edição pode ter um objeto `theme` (tipo `EventTheme` no shared) em `events.json` que sobrescreve os tokens **só para aquela edição**. O `PageLayout` aplica isso no wrapper da edição via `eventThemeVars()` (`src/lib/theme.ts`).

Por que assim? O site é permanente, mas **a paleta muda a cada edição** (requisito da comissão) — e as edições arquivadas ficam com a paleta delas para sempre. Compare `/2026/` com `/2025/` (que tem tema azul) para ver funcionando.

Regras práticas: a identidade da edição atual entra no `theme` do evento (não no tokens.css); nunca coloque cor/fonte fixa num componente, sempre `var(--...)` — é isso que faz o tema por edição cascatear sem mudança de código.

## Onde fica cada conteúdo

Na Fase 0, todo o conteúdo do site são arquivos JSON em `packages/frontend/src/data/`:

| Arquivo | Conteúdo | Observações |
|---|---|---|
| `events.json` | Edições do evento | `isCurrent` controla o redirect da raiz |
| `importantDates.json` | Prazos e datas | `isExtended: true` mostra selo "prorrogado" |
| `thematicAreas.json` | Áreas temáticas | |
| `feeTiers.json` | Tabela de valores | Valores em **centavos** (R$ 80,00 = `8000`) |
| `committee.json` | Organização/comitês | Agrupado por `role` na página |
| `sponsors.json` | Realização/apoio | |
| `news.json` | Avisos | `status: "PUBLISHED"` para aparecer; `bodyMd` é markdown |

Textos de interface (menus, botões, mensagens) ficam em `src/locales/*.json` — **são coisas diferentes**: fixture é conteúdo do evento, locale é texto da interface.

## Testes

Testes não são opcionais neste projeto — a CI bloqueia PR com teste quebrado.

- **Unitários (Vitest):** `packages/shared/src/**/*.test.ts` (CPF, validação) e `packages/frontend/src/**/*.test.{ts,tsx}` (componentes, providers). Rode com `npm run test`.
- **E2E (Playwright):** `packages/e2e/tests/`. Simulam um usuário real no navegador (desktop Chrome + celular Pixel 7): navegação em todas as páginas, formulário de inscrição, troca de idioma, 404. Rode com `npm run test:e2e`. Para depurar visualmente: `cd packages/e2e && npx playwright test --ui`.

Se você mudar comportamento do site, atualize/adicione testes no mesmo PR.

## Fluxo de trabalho com Git

⚠️ **As branches `main` e `develop` são protegidas: ninguém faz push direto nelas.** Todo trabalho entra por Pull Request com pelo menos 1 aprovação.

```
main      ← produção. Push aqui = deploy automático no GitHub Pages
develop   ← integração. PRs de feature entram aqui primeiro
feature/* ← seu trabalho do dia a dia
```

Passo a passo para contribuir:

```bash
# 1. Parta sempre da develop atualizada
git checkout develop && git pull

# 2. Crie sua branch (nome descritivo, em inglês)
git checkout -b feature/news-pagination

# 3. Trabalhe, rode os testes localmente, commite
npm run lint && npm run typecheck && npm run test
git add -A && git commit -m "Add pagination to the news list"

# 4. Suba e abra o PR contra a develop
git push -u origin feature/news-pagination
gh pr create --base develop
```

- O PR precisa da CI verde + 1 aprovação para poder ser mergeado
- Quando a develop acumula um conjunto estável de mudanças, abre-se um PR `develop → main`; o merge na main publica o site
- Commits em inglês, mensagem no imperativo ("Add X", "Fix Y"), explicando o *porquê* quando não for óbvio
- Force push e deleção de main/develop estão bloqueados

## CI/CD e deploy

Dois workflows em `.github/workflows/`:

- **`ci.yml`** — roda em todo PR e push em main/develop: ESLint, TypeScript (`tsc`), testes unitários e smoke E2E. Se falhar, o PR não merga.
- **`deploy-pages.yml`** — roda em push na `main`: builda o frontend e publica no GitHub Pages.

⏱️ **O CDN do GitHub Pages tem cache de ~10 minutos.** Depois de um deploy, o site pode demorar até 10 min para atualizar. Aba anônima ajuda a conferir sem cache.

## Convenções do projeto

- **Código, comentários, commits e nomes**: inglês. **Conteúdo visível ao usuário**: pt-BR (via locales)
- TypeScript `strict` — sem `any` gratuito
- Texto de UI sempre via i18n, nunca hardcoded
- Cores/fontes sempre via tokens CSS, nunca fixas no componente
- Toda entidade de conteúdo carrega `eventId` (arquitetura multi-edição)
- Dinheiro em centavos inteiros, nunca float
- Datas em ISO com fuso `-03:00` (America/Fortaleza)
- Validações compartilhadas entre front e back vivem em `@sieamb/shared` (zod)

## Problemas comuns (troubleshooting)

| Problema | Solução |
|---|---|
| `npm run dev` falha após pull | `npm install` (dependências novas no lockfile) |
| E2E falha com "Executable doesn't exist" | `npx playwright install chromium` |
| Site publicado não mostra minha mudança | Cache do CDN (até 10 min). Confira em aba anônima |
| Erro de tipo em `@sieamb/shared` | O shared não tem build separado — confira `tsconfig` e reinicie o TS server do editor |
| Testes E2E passam local e falham na CI | CI usa `locale: 'pt-BR'` e viewport mobile também — rode `npx playwright test` completo, não só um projeto |
| Rota dá 404 no GitHub Pages mas funciona local | O SPA usa o truque do `404.html` — confira `public/404.html` e o script em `index.html` |

---

## Equipe

- **Rodrigo Alves Costa** ([@rodrigo-rac2](https://github.com/rodrigo-rac2)) — desenvolvimento e manutenção
- **Samuel** ([@0Samuel09](https://github.com/0Samuel09)) — manutenção
- Comissão organizadora SIEAmB/UFCG — conteúdo e direção do evento

Licença: [MIT](LICENSE)
