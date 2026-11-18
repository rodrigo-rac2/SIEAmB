# SIEAmB — Seminário Internacional de Estudos Ambientais

Plataforma web do **SIEAmB**, evento científico promovido pela UFCG (Programa de Pós-Graduação em Engenharia e Gestão de Recursos Naturais). Este repositório contém o site do evento, com suporte a múltiplas edições e múltiplos idiomas.

🌐 **Site no ar:** https://sieamb.org · ambiente de desenvolvimento: https://dev.sieamb.org

🗂️ **Backlog:** [GitHub Issues](https://github.com/rodrigo-rac2/SIEAmB/issues) organizadas por [milestones](https://github.com/rodrigo-rac2/SIEAmB/milestones) (ver [Backlog e processo](#backlog-e-processo))

🧭 **Decisões técnicas:** [docs/adr/](docs/adr/) (ADR-001 a ADR-009) · o plano original de agosto de 2026, mantido como histórico, está em [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)

📌 **Status atual e histórico:** [.claude/context/STATUS.md](.claude/context/STATUS.md) e [.claude/context/HISTORY.md](.claude/context/HISTORY.md)

---

## Índice

1. [O que é este projeto](#o-que-é-este-projeto)
2. [O que está no ar e a arquitetura](#o-que-está-no-ar-e-a-arquitetura)
3. [Estrutura do repositório](#estrutura-do-repositório)
4. [Como rodar localmente](#como-rodar-localmente)
5. [Como o site funciona (conceitos-chave)](#como-o-site-funciona-conceitos-chave)
6. [Contas, trabalhos e painel da organização](#contas-trabalhos-e-painel-da-organização)
7. [Onde fica cada conteúdo](#onde-fica-cada-conteúdo)
8. [Testes](#testes)
9. [Backlog e processo (leia antes de contribuir)](#backlog-e-processo)
10. [Fluxo de trabalho com Git](#fluxo-de-trabalho-com-git)
11. [CI/CD, ambientes e deploy](#cicd-ambientes-e-deploy)
12. [Convenções do projeto](#convenções-do-projeto)
13. [Problemas comuns (troubleshooting)](#problemas-comuns-troubleshooting)

---

## O que é este projeto

O SIEAmB é um seminário internacional acadêmico. O site precisa de:

- **Páginas institucionais**: sobre o evento, organização, áreas temáticas, datas, local, contato
- **Sistema de avisos** (notícias do evento)
- **Inscrições** de participantes, com pagamento por cartão ou boleto via Mercado Pago e e-mails de confirmação e lembrete
- **Contas**, **submissão de trabalhos** e **avaliação** (a avaliação não é às cegas: a organização indica um ou mais avaliadores por trabalho)
- **Painel da organização**: inscrições, trabalhos, pessoas e papéis, comunicados
- **Certificados** e **anais** (ainda não construídos)

O site é **multi-edição**: cada edição tem um slug com o ano do evento (ex.: `/2027/`), e as edições antigas continuam acessíveis como arquivo. O domínio raiz sempre redireciona para a edição atual. Slugs antigos de uma edição (`legacySlugs` no evento, ex.: `/2026/` → `/2027/`) redirecionam mantendo o resto do caminho.

Somos os mantenedores deste projeto daqui pra frente — o código precisa ficar sempre num estado que outra pessoa consiga assumir.

## O que está no ar e a arquitetura

| Parte | Produção (https://sieamb.org) | Desenvolvimento (https://dev.sieamb.org) |
|---|---|---|
| Páginas públicas em 4 idiomas, duas edições | ✅ No ar | ✅ |
| Inscrição gravada no banco | ✅ No ar | ✅ |
| Pagamento (cartão e boleto, Mercado Pago) e e-mails | ✅ No ar desde 16/11/2026 | ✅ (sandbox) |
| Contas, Minha área | ⏳ Desligado | ✅ desde 17/11/2026 |
| Envio de trabalhos, avaliadores, painel da organização, comunicados, notificações | ⏳ Desligado | ✅ |
| Formulário de avaliação, resultados, certificados, anais | Não construído | Não construído |

O que está "desligado" em produção já está pronto e testado em desenvolvimento, e entra com o release preparado no PR [#274](https://github.com/rodrigo-rac2/SIEAmB/pull/274). O retrato atualizado fica em [.claude/context/STATUS.md](.claude/context/STATUS.md).

**Stack:** React 18 + TypeScript + Vite (frontend) · funções da Vercel em `api/v1/` com a lógica em `packages/server` (não existe servidor Express) · Supabase (PostgreSQL, Auth para as contas, Storage para os arquivos) · Prisma só para o schema e as migrations · Resend por SMTP (e-mails) · Mercado Pago (pagamentos) · Vitest e Playwright (testes).

**Como as peças se encaixam** (registro completo em [ADR-009](docs/adr/009-runtime-architecture.md)):

- O **conteúdo público** (datas, taxas, áreas, equipe, avisos, editais) são arquivos JSON no repositório. Mudar conteúdo é um PR.
- O navegador só **grava a inscrição** direto no banco (inserção anônima, sem leitura). Todo o resto passa por uma função da Vercel, que confere quem está pedindo.
- **Contas e senhas** ficam no Supabase Auth. **Papéis** são por edição (tabela `event_members`), mais o dono do site (`users.is_platform_admin`).
- **Todo e-mail** é primeiro uma linha numa tabela de saída e depois é enviado. Um **job em segundo plano**, iniciado pelo próprio banco a cada 10 minutos, reenvia o que falhou, registra os lembretes e confere pagamentos em aberto.
- Partes novas são **ligadas por ambiente** com um par de variáveis (`VITE_ACCOUNTS_ENABLED` e `ACCOUNTS_ENABLED`, por exemplo). Desligadas, as telas não aparecem e as funções respondem 503.

## Estrutura do repositório

É um **monorepo** com npm workspaces — vários pacotes num repositório só:

```
SIEAmB/
├── .github/workflows/       # CI, E2E contra deploys da Vercel, política de branches, backup e vigia do banco
├── .claude/                 # Contexto para sessões do Claude Code (status, histórico, skills)
├── api/v1/                  # Funções da Vercel: só a porta de entrada, a lógica está em packages/server
│   ├── account.ts           #   contas (/api/v1/account/<ação>)
│   ├── submissions.ts       #   trabalhos (/api/v1/submissions/<ação>)
│   ├── admin.ts             #   painel da organização (/api/v1/admin/<ação>)
│   ├── payments/            #   pedidos, status, webhook do Mercado Pago, job em segundo plano
│   └── registrations/       #   aviso de inscrição recebida
├── docs/
│   ├── adr/                 # Decisões técnicas (001 a 009): leia antes de mudar como algo funciona
│   ├── db-backups.md        # Como o backup é feito e como restaurar
│   └── IMPLEMENTATION_PLAN.md   # Plano de agosto de 2026, mantido como histórico
├── packages/
│   ├── shared/              # @sieamb/shared — tipos, validação (zod), CPF, formatação
│   ├── frontend/            # @sieamb/frontend — o site em React
│   │   └── src/
│   │       ├── pages/       # Uma pasta = uma página (account, papers, panel, …)
│   │       ├── components/  # Componentes reutilizáveis (layout, news, registration, shared…)
│   │       ├── contexts/    # EventContext (edição da URL), AuthContext (conta logada)
│   │       ├── services/    # DataProvider e as chamadas às funções (account, submissions, admin, payments)
│   │       ├── locales/     # Traduções: pt-BR.json, en.json, es.json, zh-CN.json
│   │       ├── data/        # Conteúdo do site em JSON, taxas e regras de submissão
│   │       ├── styles/      # tokens.css (identidade visual) + base.css
│   │       └── i18n.ts      # Configuração de idiomas
│   ├── server/              # @sieamb/server — a lógica atrás das funções, com seus testes
│   │   └── src/             #   payments, account, submissions, admin, core (banco e fila de e-mails)
│   ├── db/                  # @sieamb/db — schema Prisma e migrations em SQL escritas à mão
│   └── e2e/                 # @sieamb/e2e — testes de navegador com Playwright
├── vercel.json              # Build, rotas das funções e do site
├── package.json             # Raiz: scripts que orquestram os workspaces
└── CLAUDE.md                # Convenções para sessões do Claude Code
```

**Regra de ouro:** código que serve a mais de um pacote do site (tipos, validação) vai em `packages/shared`, nunca duplicado. Uma exceção conhecida: `packages/server` não consegue importar o `shared` depois de publicado (ADR-009) e mantém a própria checagem de CPF.

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
npm run test           # unitários e de componentes (shared, frontend, server, db)
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

Todas as rotas do site vivem embaixo de `/:eventSlug/` (ex.: `/2027/inscricoes`). O arquivo `packages/frontend/src/data/events.json` define as edições, e **exatamente uma** tem `isCurrent: true` — é para ela que a raiz `/` redireciona. Edições antigas ficam com `isArchived: true` e continuam navegáveis. O `EventContext` lê o slug da URL e disponibiliza a edição para todas as páginas.

### 2. DataProvider (abstração de dados)

Nenhuma tela chama `fetch` direto. Tudo passa pela interface `DataProvider` (`packages/frontend/src/services/`):

- `StaticDataProvider` — lê os JSONs de `src/data/`; a pré-inscrição apenas simula sucesso (uso local e testes)
- `SupabaseDataProvider` — **modo atual em todos os ambientes da Vercel** (desde 2026-10-25, #149). Conteúdo público continua vindo dos JSONs; a pré-inscrição é gravada na tabela `pre_registrations` do Supabase com a chave anônima (RLS só permite INSERT, nunca leitura; a leitura é pelo painel do Supabase ou pela service role)

A variável `VITE_DATA_PROVIDER` (`static` | `supabase`) escolhe a implementação. Atenção: um build sem `VITE_DATA_PROVIDER=supabase` volta a simular sucesso na pré-inscrição sem gravar nada.

Contas, trabalhos, painel e pagamentos não passam pelo `DataProvider`: cada um tem seu serviço em `src/services/` (`account.ts`, `submissions.ts`, `admin.ts`, `payments.ts`), que chama a função correspondente em `/api/v1/` com o token da conta logada.

### 3. Internacionalização (i18n)

4 idiomas: **pt-BR (padrão)**, inglês, espanhol e mandarim. Regras:

- Nenhum texto de interface é escrito direto no componente ("hardcoded"). Todo texto vem de `t('chave.da.traducao')` lendo os arquivos `src/locales/*.json`
- Ao adicionar um texto novo, adicione a chave **nos 4 arquivos**
- A primeira visita sempre renderiza pt-BR (ignoramos o idioma do navegador de propósito). A troca é pelas bandeirinhas na barra do topo e fica salva no `localStorage`
- O conteúdo (datas, áreas, equipe, avisos, textos da edição) também é traduzido: cada texto nos JSONs pode ser uma string só em português ou um objeto `{ "pt-BR", "en", "es", "zh-CN" }`, resolvido por `localize()` / `useLocalized()` com o português como reserva. Um teste de navegador falha se aparecer português nos outros idiomas
- As traduções para mandarim foram feitas por máquina e precisam de revisão de um falante nativo (#23)
- E-mails para quem se inscreve ou envia trabalho saem nos quatro idiomas; avisos para a organização e comunicados, só em português

### 4. Identidade visual por tokens + tema por edição

O tema funciona em **duas camadas** (decisão registrada no [ADR-001](docs/adr/001-per-edition-themes.md)):

1. **`packages/frontend/src/styles/tokens.css`** — CSS custom properties globais (`var(--color-primary)` etc.). São os padrões neutros e o fallback, não a identidade de nenhuma edição.
2. **`theme` do evento** — cada edição pode ter um objeto `theme` (tipo `EventTheme` no shared) em `events.json` que sobrescreve os tokens **só para aquela edição**. O `PageLayout` aplica isso no wrapper da edição via `eventThemeVars()` (`src/lib/theme.ts`).

Por que assim? O site é permanente, mas **a paleta muda a cada edição** (requisito da comissão) — e as edições arquivadas ficam com a paleta delas para sempre. Compare `/2027/` com `/2025/` (que tem tema azul) para ver funcionando.

Regras práticas: a identidade da edição atual entra no `theme` do evento (não no tokens.css); nunca coloque cor/fonte fixa num componente, sempre `var(--...)` — é isso que faz o tema por edição cascatear sem mudança de código.

## Contas, trabalhos e painel da organização

Prontos em desenvolvimento, ainda desligados em produção. Decisões em [ADR-007](docs/adr/007-accounts.md) e [ADR-008](docs/adr/008-submissions-and-organisation.md).

- **Conta**: nome e e-mail; a senha é escolhida depois do link de confirmação. A conta é opcional para se inscrever e obrigatória para enviar trabalho.
- **Trabalho**: os autores são uma lista ordenada com nome e e-mail, e qualquer um deles envia. Só quem enviou altera ou retira. As regras (prazo, páginas, limites) estão em `packages/frontend/src/data/submissionRules.json`, lidas pela página e pelo servidor. O arquivo fica num bucket privado.
- **Avaliação**: não é às cegas. A organização indica um ou mais avaliadores por trabalho, nunca um autor dele. O formulário de avaliação ainda não existe.
- **Painel** em `/:edição/painel`: inscrições, trabalhos, pessoas e papéis, comunicados e pedidos.

| | Dono(a) do site | Administrador | Organizador | Avaliador |
|---|---|---|---|---|
| Abre o painel | Sim | Sim | Sim | Não |
| Dá e tira papéis | Os três | Organizador e Avaliador | Avaliador | Nenhum |
| Inscrições: cadastrar, mudar situação, excluir, ver CPF | Sim | Sim | Só vê a lista, sem documentos | Não |
| Altera ou retira o trabalho de outra pessoa | Sim | Sim | Não | Não |
| Indica avaliadores, encerra as submissões, envia comunicados | Sim | Sim | Sim | Não |
| Corrige nome e instituição de outra conta, envia link de nova senha | De qualquer pessoa | De quem está abaixo | Não | Não |
| Muda e-mail ou CPF de outra conta, define a senha | Sim | Não | Não | Não |

Ninguém vê um papel acima do seu. O dono do site é marcado direto no banco (`users.is_platform_admin`), nunca pelo site.

## Onde fica cada conteúdo

O conteúdo do site são arquivos JSON em `packages/frontend/src/data/`:

| Arquivo | Conteúdo | Observações |
|---|---|---|
| `events.json` | Edições do evento | `isCurrent` controla o redirect da raiz |
| `importantDates.json` | Prazos e datas | `isExtended: true` mostra selo "prorrogado" |
| `thematicAreas.json` | Áreas temáticas | |
| `feeTiers.json` | Tabela de valores | Valores em **centavos** (R$ 80,00 = `8000`) |
| `committee.json` | Organização/comitês | Agrupado por `role` na página |
| `sponsors.json` | Realização/apoio | |
| `news.json` | Avisos | `status: "PUBLISHED"` para aparecer; `bodyMd` é markdown |
| `editais.json` | Editais e modelos | Os arquivos ficam em `public/docs/<ano>/` |
| `submissionRules.json` | Regras de submissão | Prazo, modalidades, páginas, limites por pessoa; o servidor lê o mesmo arquivo |

Textos de interface (menus, botões, mensagens) ficam em `src/locales/*.json` — **são coisas diferentes**: fixture é conteúdo do evento, locale é texto da interface.

## Testes

Testes não são opcionais neste projeto — a CI bloqueia PR com teste quebrado.

- **Unitários e de componentes (Vitest):** `packages/shared` (CPF, validação), `packages/frontend` (telas e serviços), `packages/server` (regras de pagamento, contas, trabalhos e painel, com banco e e-mail simulados) e `packages/db` (lê o schema e os arquivos de migration). Rode com `npm run test`.
- **E2E (Playwright):** `packages/e2e/tests/`. Simulam um usuário real no navegador (desktop Chrome + celular Pixel 7). Contra qualquer build: navegação, formulário de inscrição, troca de idioma, 404. Só contra desenvolvimento e previews, usando o banco `sieamb-dev`: contas, trabalhos, painel e notificações. Rode com `npm run test:e2e`. Para depurar visualmente: `cd packages/e2e && npx playwright test --ui`.
- **Os testes de navegador dividem o banco de desenvolvimento com pessoas de verdade.** Por isso usam endereços próprios (`e2e+<execução>-…@sieamb.org`), que nunca recebem e-mail, apagam o que criaram num passo que roda sempre, e o que é sobre dado de teste fica só entre contas de teste. Dados de exemplo para olhar o painel: `npm run seed:demo -w @sieamb/e2e`.

Se você mudar comportamento do site, atualize/adicione testes no mesmo PR.

## Backlog e processo

Todo o trabalho do site vive em **GitHub Issues**, em inglês. Não existe outra lista de tarefas: se não está em uma issue, não está no backlog.

- **[Milestones](https://github.com/rodrigo-rac2/SIEAmB/milestones)** são as datas duras do evento e definem a ordem do backlog. Trabalhe sempre na milestone mais próxima:
  1. **Edital (23 Oct 2026)** — conteúdo correto no ar: datas, taxas, sobre, equipe, página de editais
  2. **Registrations + submissions open (10 Nov 2026)** — inscrições reais, caminho de pagamento, submissão mínima, admin
  3. **Peer review (Jan-Mar 2027)** — fluxo de revisão (ADR-003)
  4. **Event (24-26 Mar 2027)** — programação, certificados, anais
- **Labels** (só quatro): `content` (textos, datas, taxas, equipe) · `feature` (funcionalidade nova) · `infra` (hospedagem, CI, DNS, backups) · `waiting-committee` (bloqueada esperando a comissão organizadora).
- **Como pegar trabalho**: escolha uma issue aberta sem responsável na milestone atual, atribua a si mesmo, crie a branch `feature/<numero>-<slug>` e mencione `Closes #<numero>` no PR. O merge fecha a issue.
- **Toda mudança passa por uma issue, sem exceção** (decisão de 2026-10-11): mesmo um ajuste de uma linha que vai ser resolvido na hora ganha uma issue antes do PR, porque as issues fechadas são o log de resolução do projeto. Pedidos com mais de um assunto viram issues separadas, e um PR pode fechar várias (`Closes #a`, `Closes #b`) quando mexem no mesmo arquivo.
- **Achou um bug ou uma ideia?** Abra uma issue antes de codar. Pedidos da comissão (WhatsApp) viram issues também, com a label `waiting-committee` enquanto faltar informação.
- `.claude/context/STATUS.md` continua sendo o resumo narrativo (onde estamos, decisões), mas a lista de tarefas é só a das issues.

## Fluxo de trabalho com Git

⚠️ **As branches `main` e `develop` são protegidas: ninguém faz push direto nelas, nem o admin.** Todo trabalho entra por Pull Request (desde 2026-10-10 este é o processo para todo mundo, sem exceção).

```
main      ← produção. Merge aqui = deploy automático em https://sieamb.org. Só recebe PRs de develop ou hotfix/*
develop   ← integração. Merge aqui = deploy automático em https://dev.sieamb.org
feature/* ← seu trabalho do dia a dia. Cada PR ganha uma URL de preview na Vercel
hotfix/*  ← correção urgente direto em produção: PR para main E depois PR para develop
```

Passo a passo para contribuir:

```bash
# 1. Parta sempre da develop atualizada
git checkout develop && git pull

# 2. Crie sua branch a partir da issue (número + slug, em inglês)
git checkout -b feature/11-editais-page

# 3. Trabalhe, rode os testes localmente, commite
npm run lint && npm run typecheck && npm run test
git add -A && git commit -m "Add the editais page"

# 4. Suba e abra o PR contra a develop
git push -u origin feature/11-editais-page
gh pr create --base develop   # no corpo, escreva "Closes #11"
```

- O PR precisa da CI verde + 1 aprovação para poder ser mergeado. Enquanto só houver uma pessoa ativa, o Rodrigo faz o merge com bypass de admin, mas sempre via PR
- Confira a URL de preview que o bot da Vercel comenta no PR antes de pedir revisão
- Quando a develop acumula um conjunto estável de mudanças, abre-se um PR `develop → main`; o merge na main publica o site em https://sieamb.org
- Commits em inglês, mensagem no imperativo ("Add X", "Fix Y"), explicando o *porquê* quando não for óbvio
- Force push e deleção de main/develop estão bloqueados

## CI/CD, ambientes e deploy

**Ambientes (Vercel, plano gratuito, projeto `sieamb`; dois bancos Supabase: `sieamb-prod` para produção e `sieamb-dev` para desenvolvimento, previews, uso local e testes):**

| Ambiente | URL | Branch | Quando atualiza |
|---|---|---|---|
| Produção | https://sieamb.org (www redireciona) | `main` | a cada merge na `main` |
| Desenvolvimento | https://dev.sieamb.org | `develop` | a cada merge na `develop` |
| Preview | `https://sieamb-<hash>-sieamb.vercel.app` | cada PR | a cada push no PR (o bot da Vercel comenta a URL) |

O domínio `sieamb.org` está registrado na Cloudflare (DNS também lá). A configuração de build está em `vercel.json` (build do monorepo, `VITE_BASE=/`, rewrites de SPA). A Vercel está conectada ao GitHub, então não existe passo manual de deploy. Para deploy manual de emergência: `npx vercel --prod`.

**Workflows em `.github/workflows/`:**

- **`ci.yml`** — roda em todo PR e push em main/develop: job `quality` (ESLint, TypeScript, testes unitários e de integração com Vitest) e job `e2e-smoke` (Playwright contra um build local).
- **`e2e-preview.yml`** — dispara quando a Vercel termina um deploy (preview do PR, `develop` ou `main`) e roda a suíte Playwright **contra a URL publicada** (`BASE_URL`), inclusive os testes `@deployed` (rewrites de SPA, idioma persistido, fotos servidas, redirecionamento do www). O check `e2e-preview` aparece no PR.
- **`branch-policy.yml`** — o GitHub não restringe a branch de origem de um PR, então este check falha quando um PR para `main` não vem de `develop` ou `hotfix/*`, e quando alguém tenta mergear `main` em `develop`.

- **`db-backup.yml`** — backup semanal cifrado do banco de produção (domingo), e à mão antes de um release. Ver [docs/db-backups.md](docs/db-backups.md).
- **`db-keepalive.yml`** e **`db-watchdog.yml`** — o plano gratuito do Supabase pausa um banco sem uso; o primeiro lê tabelas públicas a cada 4 horas, o segundo confere a cada 6 horas e reativa um banco pausado.
- **`email-sweep.yml`** — dispara o job em segundo plano (reenvio de e-mails, lembretes, conferência de pagamentos) de hora em hora e pelo botão "Run workflow". **Quem mantém o horário de 10 em 10 minutos é o banco** (`pg_cron`, migration `20261118010000_background_job_schedule`): o GitHub, nesse intervalo, rodava umas três vezes por dia.

**Migrations:** SQL escrito à mão em `packages/db/prisma/migrations/`, aplicado com `DIRECT_URL=<pooler de sessão do banco certo> npm run migrate:deploy -w @sieamb/db`. Confira para qual banco o endereço aponta antes de rodar. Em produção, sempre depois de um backup.

**Checks obrigatórios** (ruleset `protect-main-develop`): `quality`, `e2e-smoke`, `e2e-preview` e `branch-policy` precisam estar verdes para mergear em `develop` ou em `main`. O `e2e-preview` deduz a URL do deploy a partir da branch (`sieamb-git-<branch>-sieamb.vercel.app`, `dev.sieamb.org`, `sieamb.org`), espera o `/version.json` servir o commit em teste e só então roda o Playwright, sem depender do app do Vercel no GitHub. As requisições de teste levam o header secreto `x-sieamb-e2e` (segredo `E2E_BYPASS_TOKEN` no GitHub Actions e no `.env.local`), que casa com uma regra *Bypass* no firewall do Vercel para a mitigação automática de DDoS não barrar nossos próprios testes. Issues fecham automaticamente só quando o PR de release chega na `main` (o GitHub só processa `Closes #N` na branch padrão).

Para rodar a suíte E2E contra qualquer ambiente publicado: `BASE_URL=https://dev.sieamb.org npm run test:e2e`.

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
| Rota dá 404 em um deploy novo mas funciona local | O SPA depende dos `rewrites` em `vercel.json` (tudo cai em `index.html`); confira se o arquivo está no build |

---

## Equipe

- **Rodrigo Alves Costa** ([@rodrigo-rac2](https://github.com/rodrigo-rac2)) — desenvolvimento e manutenção
- **Samuel** ([@0Samuel09](https://github.com/0Samuel09)) — manutenção
- Comissão organizadora SIEAmB/UFCG — conteúdo e direção do evento

Licença: [MIT](LICENSE)
