# SIEAmB — Pending Items

> Watched items with owner and next action. Review with `/pending-items`. Move resolved items to the bottom section with the resolution date.

## Waiting on others

| # | Item | Waiting on | Since | Notes / next check |
|---|---|---|---|---|
| P2 | Conteúdo real do evento (datas, valores, áreas temáticas, comitês, e-mail oficial, texto de apresentação) | Comissão (Najara/Thays) | 2026-08-30 | Pedido na mensagem de lançamento do protótipo. Quando chegar → skill `sieamb-update-content` |
| P3 | Arquivo/conteúdo do edital | Comissão (Thays confirmou que ainda não existe) | 2026-08-31 | Página de editais é fácil de adicionar quando o conteúdo chegar (referência: modelo ANPOCS, páginas HTML e não PDF) |
| P4 | Feedback detalhado do protótipo | Najara (vai olhar com calma) + professora Viviane (recebeu o link) | 2026-08-30 | Thays já deu feedback positivo + 2 pedidos (ver P3 e P7) |
| P5 | Samuel aceitar o convite de colaborador do GitHub | Samuel (@0Samuel09) | 2026-08-31 | Convite enviado com permissão write. Sem aceite, não consegue abrir PRs |
| P6 | Revisão das traduções zh-CN por falante nativo | A definir | 2026-08-30 | Perguntei no grupo se querem mais idiomas. Sem urgência até o evento. Nota: Daniela Torres assina com nome em chinês (杜宁娅), pode ser a revisora natural |
| P8 | **Decisão de hospedagem com a professora Viviane (líder)** — ela informou (13/09) que NÃO há verba para ~R$ 250/mês e sugeriu usar o Joomla do PPGEGRN para inscrições/pagamento | Comissão | 2026-09-03 | Joomla avaliado por Rodrigo em 13/09: instalação legada sem nenhum componente de inscrição/formulário/pagamento — inviável e inseguro para CPF + pagamento (detalhes com Rodrigo, não no repo). Próximo passo: apresentar a **opção R$ 0/mês** (free tiers + Mercado Pago sem mensalidade ou Even3 por transação) — ver STATUS.md |
| P9 | Tema e datas oficiais de 2026 para a arte/hero (o modelo da Daniela ainda traz o tema e as datas de 2025) | Comissão | 2026-09-13 | Perguntar no grupo. Enquanto isso o hero usa o lockup + tagline genérica |
| P10 | Nomes (e bios) da equipe da 2ª edição — fixa (idealizadores) + variável | Najara (ofereceu enviar) | 2026-10-10 | Pedir também foto opcional e instituição. Layout por edição como chinabrasilunicamp.wixsite.com/2023 |
| P11 | Texto de apresentação da 2ª edição (para "Sobre o evento", somado ao texto geral + texto 2025) | Comissão | 2026-10-10 | Texto geral e o de 2025 já capturados do Wix |
| P12 | Datas dos lotes de inscrição alinhadas ao novo cronograma (evento 24–26/03/2027) | Comissão | 2026-10-10 | Valores já definidos: 30/50, 50/70, 70/90. Datas na arte (26/05–20/10) são antigas |
| P13 | Conta Mercado Pago (CNPJ da empresa júnior) — sem ela, pagamento vai pelo Even3 como em 2025 | Comissão / empresa júnior | 2026-10-10 | Decisão até 24/10: se não houver conta MP, inscrição no site + pagamento Even3 |

## Owned by Rodrigo (action needed)

| # | Item | Due | Notes |
|---|---|---|---|
| R2 | Página de editais (estrutura placeholder "em breve" até o conteúdo chegar) | — | Depende de P3 para o conteúdo final; a página em si pode ser criada antes |
| R4 | Aplicar o input de 10/10 (datas março/2027, online, taxas, sobre + idealizadores + equipe por edição) | 2026-10-17 | Ver STATUS.md "Client input 2026-10-10" |
| R7 | Playwright do CI rodando contra o preview da Vercel (evento `deployment_status`) em vez do build local | — | dev.sieamb.org e proteção de preview já resolvidos em 10/10 |
| R5 | Inscrições abertas no site em produção (domínio + Vercel + Supabase) | **2026-11-10** | Compromisso com a Najara. Plano de rollout na sessão de 10/10 |
| R3 | Fase 1: Supabase + área logada (submissão com anexos e acompanhamento foi confirmada como desejada pela Thays) | — | Escopo já planejado (plan §5-6). Começar após decisão de hospedagem (R1) |

## Resolved

| Item | Resolved | How |
|---|---|---|
| Protótipo Phase 0 no ar | 2026-08-30 | https://rodrigo-rac2.github.io/SIEAmB/ |
| Grupo de WhatsApp do projeto criado | 2026-08-31 | Najara criou; Samuel e equipe de design adicionados |
| Branch protection main/develop + Samuel como colaborador | 2026-08-31 | Ruleset ativo, convite enviado |
| P7 — Anais do I SIEAmB | 2026-09-02 | Thays enviou os links: resumos no Journal of Ecoinnovation and Environmental Management v.1 n.1 (editoraverde.org) e artigos no eduCAPES. Página `/2025/anais` populada. Nota: a 1ª edição publicou em periódico parceiro, não em anais próprios com ISSN — modelo a discutir para a 2ª edição |
| P1 + assets — Identidade visual 2026 aplicada | 2026-09-13 | Paleta de 6 cores da Daniela, Garet (Book/Heavy, gratuitas) + Lora self-hosted, logo/lockup/texturas dos PNGs transparentes enviados por ela. Canva Pro não foi necessário |
| R6 — sieamb.org registrado e no ar na Vercel | 2026-10-10 | Cloudflare Registrar + DNS, Vercel Hobby team `sieamb`, apex + www, Git conectado |
| R1 — Recomendação de hospedagem enviada ao grupo | 2026-09-02/03 | Mensagem completa (hospedagem em etapas, domínios disponíveis, Zenodo/DOI, bolsa Samuel R$ 700/mês) enviada por Rodrigo. Decisões agora aguardam a reunião com a professora líder (P8) |
