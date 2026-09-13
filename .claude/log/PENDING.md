# SIEAmB — Pending Items

> Watched items with owner and next action. Review with `/pending-items`. Move resolved items to the bottom section with the resolution date.

## Waiting on others

| # | Item | Waiting on | Since | Notes / next check |
|---|---|---|---|---|
| P1 | Identidade visual (paleta, logo, fonte, arte do hero) | ~~Equipe de design~~ → **entregue via Canva em 13/09** | 2026-08-30 | Agora depende de P9 (download dos assets). Fontes confirmadas: Garet + Lora |
| P2 | Conteúdo real do evento (datas, valores, áreas temáticas, comitês, e-mail oficial, texto de apresentação) | Comissão (Najara/Thays) | 2026-08-30 | Pedido na mensagem de lançamento do protótipo. Quando chegar → skill `sieamb-update-content` |
| P3 | Arquivo/conteúdo do edital | Comissão (Thays confirmou que ainda não existe) | 2026-08-31 | Página de editais é fácil de adicionar quando o conteúdo chegar (referência: modelo ANPOCS, páginas HTML e não PDF) |
| P4 | Feedback detalhado do protótipo | Najara (vai olhar com calma) + professora Viviane (recebeu o link) | 2026-08-30 | Thays já deu feedback positivo + 2 pedidos (ver P3 e P7) |
| P5 | Samuel aceitar o convite de colaborador do GitHub | Samuel (@0Samuel09) | 2026-08-31 | Convite enviado com permissão write. Sem aceite, não consegue abrir PRs |
| P6 | Revisão das traduções zh-CN por falante nativo | A definir | 2026-08-30 | Perguntei no grupo se querem mais idiomas. Sem urgência até o evento. Nota: Daniela Torres assina com nome em chinês (杜宁娅), pode ser a revisora natural |
| P8 | **Decisão de hospedagem com a professora Viviane (líder)** — ela informou (13/09) que NÃO há verba para ~R$ 250/mês e sugeriu usar o Joomla do PPGEGRN para inscrições/pagamento | Comissão | 2026-09-03 | Joomla avaliado por Rodrigo em 13/09: instalação legada sem nenhum componente de inscrição/formulário/pagamento — inviável e inseguro para CPF + pagamento (detalhes com Rodrigo, não no repo). Próximo passo: apresentar a **opção R$ 0/mês** (free tiers + Mercado Pago sem mensalidade ou Even3 por transação) — ver STATUS.md |
| P9 | **Baixar os assets da identidade visual 2026 do Canva** (Daniela enviou link de edição em 13/09; fontes Garet + Lora) | Rodrigo | 2026-09-13 | Link exige login no Canva. Rodrigo baixa (PNG fundo transparente + SVG/PDF) para `packages/frontend/public/brand/` → skill `sieamb-apply-identity`. Verificar licença da fonte Garet antes de self-host (Lora é OFL/Google Fonts) |

## Owned by Rodrigo (action needed)

| # | Item | Due | Notes |
|---|---|---|---|
| R2 | Página de editais (estrutura placeholder "em breve" até o conteúdo chegar) | — | Depende de P3 para o conteúdo final; a página em si pode ser criada antes |
| R3 | Fase 1: Supabase + área logada (submissão com anexos e acompanhamento foi confirmada como desejada pela Thays) | — | Escopo já planejado (plan §5-6). Começar após decisão de hospedagem (R1) |

## Resolved

| Item | Resolved | How |
|---|---|---|
| Protótipo Phase 0 no ar | 2026-08-30 | https://rodrigo-rac2.github.io/SIEAmB/ |
| Grupo de WhatsApp do projeto criado | 2026-08-31 | Najara criou; Samuel e equipe de design adicionados |
| Branch protection main/develop + Samuel como colaborador | 2026-08-31 | Ruleset ativo, convite enviado |
| P7 — Anais do I SIEAmB | 2026-09-02 | Thays enviou os links: resumos no Journal of Ecoinnovation and Environmental Management v.1 n.1 (editoraverde.org) e artigos no eduCAPES. Página `/2025/anais` populada. Nota: a 1ª edição publicou em periódico parceiro, não em anais próprios com ISSN — modelo a discutir para a 2ª edição |
| R1 — Recomendação de hospedagem enviada ao grupo | 2026-09-02/03 | Mensagem completa (hospedagem em etapas, domínios disponíveis, Zenodo/DOI, bolsa Samuel R$ 700/mês) enviada por Rodrigo. Decisões agora aguardam a reunião com a professora líder (P8) |
