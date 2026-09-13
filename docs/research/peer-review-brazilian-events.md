<!-- Research report, 2026-09-13, produced by a Claude research agent from primary sources; see (d) Sources -->

# Peer review in Brazilian academic events — research report for the SIEAmB submission/review module

Scope note: 30-ish searches/fetches. Even3 and Galoá help-center pages return HTTP 403 to fetchers, so their facts come from search-index snippets of those same pages (URLs listed). JEMS, Doity, SIGEventos, CBIS, CBC, ANPAD, IFES and the international docs were read from primary sources.

---

## (a) Comparison table — assignment, review form, decision

| Platform | Reviewer assignment / COI | Reviewers per paper | Review form: criteria, scale, fields | Decision & author output |
|---|---|---|---|---|
| **JEMS (SBC)** | Manual (Chair→Papers→assign from TPC list or e-mail) or "assignment suggestions" from TPC topic interests; TPC members can "claim" papers (bid-lite). Double-blind option hides author names; anonymous reviewer accounts for chairs who also submit. | Default **3** ("3 por padrão") | Fully configurable questions, each with `Weight` (weight inside the review) and `Global Weight` (weight of that review in the paper average). Review avg = Σ(score/max × weight) × 10. Rebuttal supported (max chars configurable, 0 = off). | Chair sorts by `Avg`/`Gavg`, sets status `accepted` / `rejected` / `active` (e.g. posters pending), sends per-track templates via Notify Authors (duplicate-safe). Reminders with configurable interval. |
| **Even3** | Automatic or manual distribution; manual reassignment is the documented way to handle no-shows. | Configurable "quantidade de avaliações" per submission | Two modes. **Avaliação padrão**: reviewer picks status `Aprovado` / `Reprovado` / `Aprovado com ressalvas` + `Justificativa`. **Avaliação por critérios**: organizer defines criteria, reviewer gives **1–5 per criterion** (help says "0 a 5" in one article), weighted average; reviewer issues no verdict. | Criteria mode: organizer sets a **nota de corte** (e.g. 8) and the committee decides; "ressalvas" in criteria mode only via support. Authors see the parecer in their area. Reviewer certificate can be issued. |
| **Doity** | Distribute "todos para todos" or split; cap "máximo de trabalhos para cada avaliador por área temática"; reviewer may decline (`Recusar Avaliação`) if enabled. | Configurable "Quantidade de avaliadores por trabalho" | Criteria = name + weight; **score fixed 1–5** by the platform ("no mínimo 1 e no máximo 5"); rating UI as star/number/concept; optional comment field, optional annotated file upload. Weighted avg example: (3×5+4×4+5×3)/12 = 3,8. Review is final once sent. | **Parecer final only by organizer/committee** (aprovado ou não). Authors never see scores: "recebem apenas o parecer final e os comentários da avaliação, caso você habilite". E-mail to author + co-authors, optional carta de aceite. Reminders, expired-deadline tab. |
| **Galoá** | Distribution by area/theme/keyword; deadline tracking + automatic reminders. | Configurable | Scores **1–5**, average computed automatically; field for comments to authors; award nomination flag. | Reviewer sets "Avaliação geral": `aprovado` / `rejeitado` / `ressubmissão requerida`. Proceedings with DOI, ORCID push. |
| **SIGEventos (UFRN)** | Automatic by `área` or `unidade` with X avaliações per work, balanced ("mais igualitária possível"), or manual by reviewer / by submission. Reviewer sees the submission anonymised. | X configurable | **Avaliação parcial** = notas per event criteria + free-text parecer; editable while the period is open. | **Avaliação final** by `Gestor de Avaliação Evento`, "independe das avaliações parciais", must be justified. All notas and pareceres are shown to authors, anonymously. |
| **ANPAD (EnANPAD/EnAPG/ENGEMA)** | Division coordinator + scientific committee do a desk check; the system blocks committee members from their own submissions. | "pelo menos, dois avaliadores. Em caso de discrepâncias… um terceiro" | Not public; double-blind, identification → exclusion. | Final selection weighs (i) reviews, (ii) slots, (iii) presentation time. Modality decided by committee, "não caberá recurso". |
| **OJS/OCS (PKP), pt-BR** | Editor assigns; reviewer accepts/declines the request first (Passo 1). | Editor's choice (2 typical) | Optional custom review forms; free text + "discussão da avaliação". Real form (Pensar/Unifor): per-criterion `Atende plenamente` / `Atende parcialmente` / `Não atende` / `N/A`. | Recommendation: `Aceitar`, `Correções obrigatórias`, `Submeter novamente para avaliação`, `Submeter a outro periódico`, `Rejeitar`, `Ver comentários`. |
| **EasyChair** | Bidding + COI declaration; PC chairs assign. | Typically 3 | `Overall evaluation` **−3 strong reject … +3 strong accept** (7 levels, 0 = borderline); `Reviewer's confidence` 0 null … 4 expert; review text + confidential remarks. | Chairs decide; rebuttal optional; sorted by weighted avg. |
| **OpenConf** | Topics matching, chair assignment. | Configurable | Default `Recommendation` **1 Reject … 6 Must Accept**; custom weighted forms in module. | Score = average of reviews. |
| **Microsoft CMT** | Bidding, TPMS-style automatic, meta-reviewers. | Configurable | Question types: Comment / Agreement / Options / Options with value. Example `Overall score` Strong Accept 4 … Reject 0; `Comments to authors`. | Meta-review layer; discussion page shows scores. |
| **ConfTool** | Bidding `much wanted / would like / uncertain / would dislike / conflict`; auto or manual with conflict warnings. | "How many reviewers are required per submission?" | Weighted criteria; total shown 0–100 (sum) or 0–10 (average); `Familiarity of expert` 0–10; comments for authors vs confidential. | Meta-reviewer sees all reviews; bulk reminders. |
| **HotCRP** | PC preferences/bidding, auto-assign, COI per paper. | 3+ | `Overall merit` 1–5, `Reviewer expertise`, paper summary, comments to authors, comments to PC; review ratings between PC members. | PC discussion, decision by chairs. |

---

## (b) "Consensus standard" — what a Brazilian reviewer/committee expects

**Structure that shows up in every Brazilian source**

1. Per-criterion score on a **short ordinal scale (1–5 is the de facto default)** — Even3, Doity (hard-coded 1–5), Galoá, CBC. Variants: 0–100 per criterion (IFES), labelled ordinal choices without numbers (CBIS), `Atende / parcialmente / não atende` (OJS forms).
2. **Weights per criterion** and a weighted average as "nota do trabalho" (Doity, JEMS, CBC).
3. A **global verdict** field separate from the scores: 3 options is the norm — `Aprovado / Aprovado com ressalvas / Reprovado` (Even3), `Aceitação / Aceitação com revisões / Rejeição` (CBIS), `aprovado / rejeitado / ressubmissão requerida` (Galoá). Some platforms (Doity, Even3-criteria) deliberately hide the verdict from the reviewer and leave it to the committee with a **nota de corte**.
4. **Comments to authors** (mandatory justification) plus **confidential comments to the committee** (CBIS, EasyChair, ConfTool). SIGEventos warns every review is shown to authors so "toda avaliação deve ser justificada".
5. **Reviewer familiarity/confidence** (CBIS "Familiaridade do Revisor", EasyChair, ConfTool, HotCRP).
6. **2 reviewers minimum, 3rd on disagreement** (ANPAD, CBC, IFES). 3 by default in JEMS.
7. Extras that Brazilian forms commonly add: **best-paper nomination**, **downgrade suggestion** (artigo completo → resumo expandido), **adequação ao tema do evento** as a gate.

**Quoted Portuguese forms (verbatim, with sources)**

Example 1 — CBIS'24 (SBIS), "Regras de Avaliação de Trabalhos Científicos" (https://ftp.medicina.ufmg.br/cbis2024/CBIS24_Regras_de_Avaliacao_de_Trabalhos_Cient%C3%ADficos.pdf):

> 1) Relevância dos Resultados para a Área…: ● Resultados sem contribuições relevantes ● Resultados discutíveis e pouco claros ● Resultados coerentes com a proposta ● Resultados importantes que contribuam com a área
> 2) Originalidade e Inovação do Trabalho: ● …sem clara sustentação ● …ao menos uma contribuição original ● Trabalho de concepção original e/ou inovação
> 3) Qualidade Técnica do Trabalho: ● Insuficiente ● Fraca ● Regular ● Boa
> 4) Apresentação do Trabalho: ● Texto inadequado para publicação nos anais ● Texto confuso ● Texto compreensível e de qualidade aceitável ● Texto claro, estruturado e bem redigido
> 5) Familiaridade do Revisor com o Tema do Trabalho: ● Conheço muito bem e já realizei estudos similares ● Tenho algum conhecimento ● Não tenho conhecimento…
> 6) Avaliação Geral do Trabalho: … esta nota será usada para aprovação ou não do artigo. ● Rejeição ● Aceitação, com revisões ● Aceitação
> 7) Melhor Trabalho: ● Não ● Sim
> 8) Indicação para publicação como resumo expandido: no caso do artigo completo não ser aprovado, você recomendaria a aprovação como um resumo expandido?
> Comentários para os Autores: … a) melhorar o trabalho, em caso de aprovação; b) explicar os pontos fortes e fracos que JUSTIFIQUEM a avaliação.
> Comentários para o Comitê de Programa: … Esse campo não será exibido aos autores.

Example 2 — XXI Congresso Brasileiro de Custos, "Critérios para avaliação dos trabalhos" (https://anaiscbc.emnuvens.com.br/anais/article/download/3871/3872/3969):

> cada avaliador atribuiu notas aos trabalhos, numa escala de 1 a 5, de acordo com 10 critérios, com pesos diferenciados: 1. Originalidade do trabalho e relevância do tema (peso 1), 2. Pertinência do título e qualidade do resumo e introdução (peso 2), 3. Qualidade da revisão de literatura (peso 2), 4. Consistência teórica do trabalho e contribuição (peso 3), 5. Metodologia utilizada (adequação e qualidade) (peso 2), 6. Análise de dados e resultados… (peso 1), 7. Clareza, pertinência e consecução dos objetivos (peso 2), 8. Conclusões: fundamento, coerência e alcance (peso 1), 9. Qualidade da redação e organização do texto… (peso 2), 10. Atendimento da formatação exigida pelo congresso (peso 1).
> … cada avaliador atribuiu um conceito (A, B, C ou D)… A "aceitar prioritariamente", B "aceitar", C "aceitar se competição for baixa" e D "rejeitar".
> "o avaliador não é um dos autores do artigo", "o avaliador não possui coautoria com nenhum autor, mesmo em outros trabalhos" e "o avaliador não é do mesmo estado de algum autor".
> Nos casos em que os conceitos divergiram muito… (conceito D por um avaliador e A ou B pelo outro), o artigo foi reencaminhado a um terceiro avaliador. A avaliação divergente entre as três foi desconsiderada.
> Nota final = (Nota_média_2_a_10 + Conceito_médio) / 2

Example 3 — IFES, III Jornada EDIV 2020, "Critérios de avaliação de resumos" (https://sigeventos.ifes.edu.br/sigeventos/verArquivo?idArquivo=2381303&key=e8968d4a2ab40dae385388ffef4675e0):

> 01 Título: deve ser claro, compatível com o conteúdo do trabalho, coerente. 02 Objetivos: … claros e explícitos. 03 Metodologia/Desenvolvimento: … 04 Resultados: … efetivamente apresentados. 05 Conclusões: … coerentes, relacionadas com os objetivos… 06 Linguagem e Redação: … 07 Originalidade do Trabalho: quão inovador e inusitado é o conteúdo do trabalho?
> O resumo será avaliado por dois especialistas… Cada um dos critérios será avaliado de 0-100, obtendo-se a nota pelo cálculo de média simples. Para ser aprovado, o resumo deve obter nota igual ou superior a 70 pontos… Caso o trabalho seja aprovado por um avaliador, mas reprovado por outro, um terceiro especialista avaliará.
> … enviar o resumo na versão completa, para compor os anais… e também uma versão sem o nome dos autores para permitir uma avaliação às cegas.

Example 4 — Even3 help, "Emitir o parecer de um trabalho" (https://ajuda.even3.com.br/hc/pt-br/articles/360002161791): status `aprovado`, `reprovado` or `aprovado com ressalvas`; "quando um trabalho é avaliado como aprovado com ressalvas, ele será aprovado, porém precisará de alterações que devem ser apontadas pelo avaliador na Justificativa". Criteria mode: "o avaliador não emite parecer final, apenas as notas, e o parecer final depende da comissão científica (com base na nota de corte)".

Example 5 — ANPAD EnAPG 2025 call (https://anpad.com.br/uploads/edition_file/Chamada-de-Trabalhos-Divisionais-EnAPG-2025-675af15bd04d1.pdf): "8.1 O processo de avaliação dos trabalhos é anônimo. Caso apresente a identificação de um ou mais autores(as), o trabalho será excluído… 8.2 Cada trabalho será avaliado por, pelo menos, dois avaliadores. Em caso de discrepâncias na avaliação, um terceiro avaliador será designado… 8.10 Quando ocorre de algum membro do comitê… submeter para a divisão/tema em que atua, o sistema bloqueia o acesso ao trabalho deste usuário… 6.6 … identificação explícita (nome digitado no corpo do trabalho, em seu resumo ou nas propriedades do arquivo), identificação oculta ou citação de obra dos(as) próprios(as) autores(as)…"

Example 6 — OJS pt-BR recommendation labels (Revista Hipótese / OJS 3 guides): `Aceitar` ("texto cientificamente adequado, sem correções"), `Correções obrigatórias` ("adequado, mas são necessárias correções apontadas nos comentários"), `Submeter novamente para avaliação` ("grande volume de modificações… nova rodada"), plus `Rejeitar`.

**Other Brazilian specifics confirmed**
- Two files at submission when the platform cannot blind automatically: identified + anonymised (IFES). ANPAD instead forbids names anywhere in the PDF, including file properties.
- Author metadata lives in the platform, not the PDF (ANPAD 6.5). Registered profile data (iANPAD) is frozen at submission.
- Acceptance ⇒ at least one author registers and pays by a date, otherwise the paper is dropped from programme and anais (ANPAD 10.1–10.2, SBBD, SBSC, CBC, which back-filled from the waitlist).
- Presentation modality (oral/pôster) is decided by the committee from the ranking and room capacity, not chosen by the author (CBC: 120 oral + 118 pôster; ANPAD: "não caberá recurso").
- No-show penalty: ANPAD bans the author from submitting until the end of the following year.
- Authors are automatically invited to serve as reviewers (ANPAD 12.3); reviewer certificate ("certificado de avaliador") is a standard platform feature (Even3, Doity, Softaliza) and reviewers expect it with carga horária.
- Rebuttal exists in JEMS and is used by SBC symposia (SBBD 2023: "rebuttal" round for borderline papers, 1 week), but is absent from Even3/Doity/Galoá/SIGEventos and ANPAD. For a non-CS event it is not expected.
- Typical timelines: ANPAD 6 weeks submission→results, then 3 weeks to register; SBBD: 5.5 weeks to first notification, 1 week rebuttal, 1 week final, ~3 weeks camera-ready; small events (SBC-EB) 2 weeks review, 5 days to camera-ready.
- ORCID/Lattes: Galoá is an ORCID institutional member and pushes proceedings to authors' ORCID; Even3 documents how authors add the paper to Lattes. CPF: Even3/Doity ask for CPF for Brazilian participants (payments/certificates) — I did not reach a primary doc for this in this pass, treat as to-verify.

---

## (c) Recommended design for SIEAmB

### Submission artifacts
- Tracks: `artigo_completo` and `resumo_expandido` (both sources treat these as the two Brazilian tracks; CBIS lets reviewers downgrade one to the other — keep that field).
- Files: one **anonymised PDF** is the review artifact. Do not ask for an identified version at submission (ANPAD model); the identified/camera-ready version comes after acceptance. Author metadata (names, affiliations, ORCID, Lattes URL, e-mail, CPF only if certificates/payment require it) lives in the form.
- Anonymisation checks at upload (server-side, block or warn): PDF `/Author`, `/Creator`, XMP metadata; author surnames and affiliation strings from the form found in the extracted text of page 1 or acknowledgements; "nós/nosso trabalho anterior [cit]" heuristics are too noisy — just show the ANPAD-style checklist and make the author tick "declaro que o arquivo não contém identificação".
- Keep the frozen-at-submission rule for author list (ANPAD 6.11): after deadline, author list and file are immutable except by committee action.

### Storage and access
- Private object storage (R2 per ADR), signed URLs with short TTL, keyed per assignment. Reviewers can only resolve URLs of papers assigned to them (authz check on `review_assignment`, not on the file).
- Inline viewer optional; download is what every Brazilian platform does. Watermark "Uso exclusivo para avaliação — II SIEAmB" on the served copy is cheap and deters leaks.
- Reviewer never receives author fields; author never receives reviewer identity. Committee members with conflicts (own submission or same área they coordinate) get a hard block, ANPAD 8.10 style, including in list/aggregation views.

### Assignment rules
- 2 reviewers per paper by default, 3rd auto-triggered on disagreement (see decision). Configurable per event.
- Assignment: manual by área coordinator + "sugestões" ranked by (área match, keyword overlap, current load). Skip bidding for v1: none of the BR platforms your committee will have used offers it, and with 100–300 papers and a small committee it adds a phase to babysit.
- Balance load like SIGEventos: show `trabalhos atribuídos / concluídos` per reviewer, cap per reviewer per área (Doity's "máximo por área temática").
- Conflict of interest rules to encode (from CBC): reviewer is an author; reviewer shares any co-authorship with an author in this event; same institution (CBC used same state, institution is the sane version). Plus reviewer self-declared COI on the assignment screen ("Declaro conflito de interesse" → assignment released, coordinator notified). Reviewer may also decline for "fora da minha área" (Doity, OJS Passo 1).

### Review form spec (what a Portuguese-speaking committee will recognise instantly)
Section A — Triagem (gate)
- `adequacao_tema`: Sim / Não. If "Não", scores are optional and recommendation defaults to Rejeitar (CBC rule).

Section B — Critérios, each **1–5** with label anchors (1 Insuficiente, 2 Fraco, 3 Regular, 4 Bom, 5 Excelente), weight configurable per event, defaults below (a blend of CBC, IFES, CBIS):
1. Relevância e aderência ao tema do evento (peso 2)
2. Originalidade e contribuição (peso 3)
3. Fundamentação teórica e revisão de literatura (peso 2)
4. Metodologia: adequação e rigor (peso 3)
5. Resultados, análise e discussão (peso 2)
6. Conclusões: coerência com os objetivos (peso 1)
7. Redação, organização e clareza (peso 2)
8. Atendimento ao template e normas (peso 1)
For `resumo_expandido` use a shorter subset (1, 2, 4, 5, 7) — this matches IFES-style resumo criteria.
Computed: `nota_ponderada` = Σ(score×peso)/Σpeso on 1–5, also shown ×2 as 2–10 because committees think in 0–10 (CBC, Even3 cut-off "8").

Section C — Parecer
- `recomendacao` (required): `Aceitar` / `Aceitar com revisões obrigatórias` / `Rejeitar`. Three options, mirroring Even3/CBIS/Galoá. If the paper is an artigo completo add `Aceitar como resumo expandido` (CBIS item 8) — it's the standard way BR events save weak full papers.
- `confianca` (required): `Alta – já pesquisei o tema` / `Média` / `Baixa` (CBIS wording).
- `comentarios_autores` (required, min ~300 chars): shown to authors verbatim. Enforce because SIGEventos/ANPAD culture expects a justified parecer and authors will complain about a bare score.
- `comentarios_comite` (optional): never shown to authors.
- `indicacao_melhor_trabalho`: Sim/Não.
- `arquivo_anotado` (optional PDF upload, Doity feature) — strip metadata on upload so the reviewer's name in `/Author` doesn't leak.
- Review is editable until the reviewer's deadline or the coordinator closes the round; then read-only (SIGEventos allows edits while open, Doity locks on submit — allow edits, it reduces support tickets).

### Decision flow
1. Desk check by área coordinator before assignment: template, page limit, anonymisation, scope (ANPAD 8.6, CBIS items 1–2). States: `desk_rejected` with reason template.
2. Two reviews in. Aggregation view per paper: both `nota_ponderada`, both `recomendacao`, both `confianca`, mean, spread, comments. Sortable by mean and by "divergência".
3. Divergence rule (auto-flag, coordinator assigns 3rd reviewer): recommendations are `Aceitar` vs `Rejeitar`, or |nota1 − nota2| ≥ 1.5 on the 1–5 scale. With three reviews, drop the outlier for the mean (CBC) but keep it visible.
4. Committee decision per paper: `Aceito (oral)` / `Aceito (pôster)` / `Aceito com revisões obrigatórias` / `Rejeitado`. Decision is the committee's, not the reviewers' (Doity, Even3-criteria, SIGEventos all separate the two), and a `justificativa` is required when it contradicts both reviews (SIGEventos rule).
5. Cut-off: event-level `nota_de_corte` (default 3.5/5 = 7/10, which is what IFES's 70 and Even3's "8" converge on) as a suggestion in the UI, never automatic — capacity decides oral vs pôster (CBC ranked by final score to fill 120 oral + 118 pôster slots).
6. Author output: decision, modality, both reviewers' scores per criterion (SIGEventos shows them; Doity hides them — show them, it reduces "por que fui reprovado?" e-mails), comments to authors, deadline for versão final and registration. Reviewer identity never. Optional `carta de aceite` PDF (Doity) — authors need it for travel funding requests.
7. Rebuttal: skip. No BR platform outside SBC has it and your committee won't expect it. Revision round: only for `Aceito com revisões obrigatórias`: author uploads versão final, área coordinator (not the reviewers) checks the changes against the comments and flips to `Aceito`. Keep it single-round.

### Notifications & deadlines
- Reviewer invitation with accept/decline (OJS/Doity), assignment e-mail with deadline, reminders at T−7, T−2, T+1 (JEMS interval-based, Galoá automatic), coordinator digest of overdue reviews with one-click "reatribuir".
- Author e-mails: submission receipt (with ID), desk-reject, decision, versão final reminder, registration reminder. Send to all co-authors (Doity).
- All deadlines in America/Fortaleza and displayed with timezone — authors from other states will hit the wrong midnight otherwise.

### After acceptance
- Versão final upload (identified, with authors/ORCID as printed), template check, `apresentacao_modalidade` shown, presenter designation, link to registration: paper stays `aceito_pendente_inscricao` until at least one author has a paid registration by `data_limite_inscricao` (ANPAD 10.2), then `confirmado`; the coordinator can promote from the waitlist (CBC).
- Certificates: apresentação (per paper, per presenting author), autoria, and **avaliador/parecerista** with carga horária and número of papers reviewed, all with QR validation URL. Reviewer certificate is a real motivator for a volunteer committee.
- Proceedings export: anais list ordered by área, later DOI via Galoá/Crossref if you go that route; Lattes/ORCID: expose a stable public URL per paper with title, authors, event, year, pages so authors can register it in Lattes (Even3 has a help article just for this).

### Pitfalls and mitigations
| Pitfall | Seen in | Mitigation |
|---|---|---|
| Identification inside "anonymised" PDF (name in `/Author`, acknowledgements, self-citations "em nosso trabalho [3]") | ANPAD excludes the paper; CBC/IFES rely on authors | Metadata scan + surname/affiliation text scan at upload, checklist tick, desk check by coordinator before assignment, allow re-upload only before deadline |
| Reviewer no-show / late reviews | Doity has a dedicated "excederam o prazo" tab, Even3 says reassign manually | Reviewer accept/decline step, escalating reminders, overdue dashboard, one-click reassign, reserve pool of reviewers per área, 3 assignments where you need 2 for high-risk áreas |
| Reviewer evaluates a paper that the author later edits | SIGEventos manual warns about this | Freeze submission files at deadline; no edits after assignment |
| Bare scores with no justification → author appeals | SIGEventos ("toda avaliação deve ser justificada") | Required `comentarios_autores` with minimum length; coordinator can return a review as "insuficiente" (HotCRP review ratings idea, simplified) |
| Divergent reviews decided by averaging | CBC/ANPAD/IFES all use a 3rd reviewer | Auto-flag + 3rd reviewer, outlier dropped for the mean but visible |
| Committee member sees own paper in aggregation views | ANPAD 8.10 | Row-level block on `paper.authors ∩ user`, applied to lists, exports and e-mails |
| Deadline slips cascade into camera-ready and programme | SBBD dates show the chain | Event-level date model with dependent dates; changing one shifts and re-notifies; keep ~3 weeks between decision and registration deadline (ANPAD) |
| Accepted paper with no registered author printed in programme | ANPAD, SBSC, CBC | `aceito_pendente_inscricao` state and waitlist promotion |
| Author-chosen modality vs committee-decided | ANPAD/CBC decide by committee | Author states preference only; committee decides; no appeal, stated in the call |
| Reviewer's annotated PDF leaks identity | Doity allows the upload | Strip metadata, rename file, warn reviewer |

---

## (d) Sources

JEMS / SBC
- https://jems.sbc.org.br/manual/index.php?page=Fase_de_revisao_de_artigos
- https://jems.sbc.org.br/manual/index.php?page=Fase_de_selecao_de_artigos
- https://submissoes.sbc.org.br/manual/index.php?page=perguntas_frequentes_dos_coordenadores
- https://sbbd.org.br/2023/chamada-artigos-completos/
- https://www2.sbc.org.br/sbceb2024/chamada-de-trabalhos/
- https://sbsc2020.uniriotec.br/chamada-trabalhos/

Even3 (help center, 403 to fetchers; facts from indexed snippets)
- https://ajuda.even3.com.br/hc/pt-br/articles/360002161791-Emitir-o-parecer-de-um-trabalho
- https://ajuda.even3.com.br/hc/en-us/articles/115003754626-How-does-the-review-by-criteria-work
- https://ajuda.even3.com.br/hc/en-us/articles/360001819892-How-does-the-standard-review-work
- https://ajuda.even3.com.br/hc/en-us/articles/360027376452-Add-rules-for-reviewing-submissions
- https://ajuda.even3.com.br/hc/pt-br/articles/17393044632603-Configurar-a-quantidade-de-avalia%C3%A7%C3%B5es-para-as-submiss%C3%B5es
- https://ajuda.even3.com.br/hc/en-us/articles/360041123991-How-do-automatic-and-manual-distributions-work
- https://ajuda.even3.com.br/hc/pt-br/articles/115002350166-Atribuir-um-trabalho-a-um-avaliador-manualmente
- https://ajuda.even3.com.br/hc/pt-br/articles/360016420952-Conferir-o-parecer-dos-avaliadores-no-meu-trabalho
- https://ajuda.even3.com.br/hc/pt-br/articles/26909725821979-Emitir-certificado-de-avaliador
- https://ajuda.even3.com.br/hc/pt-br/articles/41365102696475-Inserir-informa%C3%A7%C3%B5es-no-Curr%C3%ADculo-Lattes
- https://ideias.even3.com.br/16 (aprovação com ressalvas in criteria mode)

Doity
- https://ajuda.doity.com.br/pt-br/article/cadastrando-criterios-de-avaliacao-1kmekq6/
- https://ajuda.doity.com.br/pt-br/article/como-avaliar-um-trabalho-vho18o/
- https://ajuda.doity.com.br/pt-br/article/emitindo-o-parecer-final-do-trabalho-11gaeey/
- https://ajuda.doity.com.br/pt-br/article/configurando-a-etapa-de-avaliacao-dos-trabalhos-1uvnvyo/
- https://ajuda.doity.com.br/pt-br/article/por-que-os-trabalhos-nao-estao-disponiveis-para-avaliacao-6isob/

Galoá (403 to fetchers; snippets)
- https://eventos.galoa.com.br/isaacbrasil-2025/page/6460
- https://eventos.galoa.com.br/premiomarcosmoraes-2023/page/3187-area-de-avaliadores
- https://galoa.com.br/plataforma-para-submissao-de-trabalhos/
- https://galoa.com.br/orcid/

SIGEventos (UFRN)
- https://ufsb.edu.br/sti/images/manuais/Manual_SigEventos.pdf (Manual do Gestor v2.0)
- https://ctic.unifesspa.edu.br/images/2019/ManualdoGestor.pdf
- https://sigeventos.ufrn.br/evento/EIPE2022/pagina/avaliadores

ANPAD / ENGEMA
- https://anpad.com.br/uploads/edition_file/Chamada-de-Trabalhos-Divisionais-EnAPG-2025-675af15bd04d1.pdf
- https://www.enanpad.org.br/uploads/edition_file/Chamada-Trabalhos-EnANPAD-2026-Pt-OF-698cf5869be4f.pdf (cert error, not fetched)
- https://anpad.org.br/engema-2025/
- https://engema.org.br/28/ (403)

Real Brazilian review forms / normas
- https://ftp.medicina.ufmg.br/cbis2024/CBIS24_Regras_de_Avaliacao_de_Trabalhos_Cient%C3%ADficos.pdf
- https://anaiscbc.emnuvens.com.br/anais/article/download/3871/3872/3969
- https://sigeventos.ifes.edu.br/sigeventos/verArquivo?idArquivo=2381303&key=e8968d4a2ab40dae385388ffef4675e0
- https://cobenge26.abenge.org.br/docs/pareceristas
- https://ojs.unifor.br/rpen/avaliacaoporpares
- https://revistahipotese.editoraiberoamericana.com/revista/en/DirAv
- https://econtents.sbu.unicamp.br/boletins/index.php/ppec/article/download/9174/4613/13223 (OJS 3 para Avaliador)
- https://www.softaliza.com.br/avaliacoes (reviewer certificates, 2–3 reviewers)

International references
- https://www3.cs.stonybrook.edu/~mueller/teaching/cse528/Review-Instructions.pdf (EasyChair)
- https://airwiki.elet.polimi.it/index.php/EasyChair_Reviews
- https://www.openconf.com/documentation/scoring.php
- https://cmt3.research.microsoft.com/docs/help/chair/manage-review-questions.html
- https://www.conftool.net/en/configuration-documentation/review-module-configuration.html
- https://www.conftool.net/en/administrator-documentation/assigning-reviews.html
- https://mobicom22.hotcrp.com/help/formulas ; https://help.hotcrp.com/help/reviewratings
