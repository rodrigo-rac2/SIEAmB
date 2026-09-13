# ADR-003: Peer-review workflow modelled on Brazilian conference practice

**Date:** 2026-09-13 · **Status:** Accepted (Phase 2 design) · **Evidence:** `docs/research/peer-review-brazilian-events.md`

## Context

Rodrigo's own reviewer experience (objective scores against criteria + comments to authors + a general recommendation) matched what a research pass over JEMS/SBC, Even3, Doity, Galoá, SIGEventos, ANPAD calls and real Brazilian review forms (CBIS, Congresso Brasileiro de Custos, IFES) shows is the consensus. The original plan §6 had three hard-coded scores and no gate/confidence/best-paper fields, asked for two PDFs at submission, and had no desk-check, divergence or "accepted pending registration" states.

## Decisions

1. **One anonymised PDF at submission** (ANPAD model). Author metadata lives in the form, never in the file. Identified camera-ready only after acceptance. Upload-time anonymisation checks: PDF `/Author`, `/Creator`, XMP; form surnames/affiliations found in page-1/acknowledgements text → block with checklist; author ticks "declaro que o arquivo não contém identificação". Files freeze at the deadline.
2. **Review form** (per event, per track; defaults below):
   - Gate: `adequacao_tema` Sim/Não (Não ⇒ scores optional, recommendation defaults to Rejeitar).
   - Criteria scored **1–5** with anchors (Insuficiente/Fraco/Regular/Bom/Excelente) and **weights**: relevância e aderência (2), originalidade e contribuição (3), fundamentação teórica (2), metodologia (3), resultados e discussão (2), conclusões (1), redação e clareza (2), normas/template (1). `resumo_expandido` uses the subset {1,2,4,5,7}. `nota_ponderada` on 1–5, also shown ×2 (committees think 0–10).
   - `recomendacao` (required): Aceitar / Aceitar com revisões obrigatórias / Rejeitar, plus **Aceitar como resumo expandido** for full papers.
   - `confianca` (required): Alta / Média / Baixa. `comentarios_autores` (required, ≥300 chars, shown verbatim). `comentarios_comite` (optional, never shown). `indicacao_melhor_trabalho`. Optional annotated PDF (metadata stripped).
   - Editable until the reviewer deadline or round close.
3. **Assignment**: 2 reviewers per paper by default, manual by SCIENTIFIC_CHAIR/AREA_CHAIR with ranked suggestions (área match, keyword overlap, load). No bidding in v1. Hard conflict-of-interest block (author, any co-authorship in the event, same institution ⇒ warning) + reviewer self-declared COI and "fora da minha área" decline. Load cap per reviewer per área.
4. **Decision flow**: desk check (template, page limit, anonymisation, scope) → `DESK_REJECTED` or assignment; aggregation view (per-criterion scores, weighted means, recommendations, confidence, spread); **divergence auto-flag** (Aceitar vs Rejeitar, or |Δnota| ≥ 1.5) ⇒ 3rd reviewer, outlier dropped from the mean but visible; **committee decides** (reviews recommend): Aceito (oral) / Aceito (pôster) / Aceito com revisões obrigatórias / Rejeitado, with mandatory justification when contradicting both reviews; event-level `nota_de_corte` (default 3.5/5) shown as suggestion, capacity decides oral vs pôster. **No rebuttal** (only SBC/CS events use it). Single revision round checked by the área coordinator, not the reviewers.
5. **Author output**: decision, modality, per-criterion scores of each review, comments to authors, deadlines for versão final and registration, optional carta de aceite PDF. Never reviewer identity or committee comments.
6. **Post-acceptance states**: `ACCEPTED_PENDING_REGISTRATION` until at least one author has a confirmed registration by the deadline, then `CONFIRMED`; waitlist promotion by the coordinator. Committee decides modality; author states preference only.
7. **Reviewer certificate** ("avaliador/parecerista") with carga horária and number of papers, QR validation — standard motivator for volunteer committees.

## Consequences (schema)

- `Submission`: `fileAnonUrl` (required at submit), `finalFileUrl` (post-acceptance); drop identified `fileUrl` at submission. New states `DESK_REJECTED`, `ACCEPTED_PENDING_REGISTRATION`, `CONFIRMED`; `decision` + `modality` fields; `presenterAuthorId`.
- New `ReviewCriterion(eventId, track, label, weight, sortOrder)` and `ReviewScore(assignmentId, criterionId, score)` replace the three fixed score columns on `ReviewAssignment`.
- `ReviewAssignment` gains `fitsTheme`, `confidence`, `recommendation` (4 values), `bestPaperNomination`, `annotatedFileUrl`, `selfDeclaredConflict`.
- Event settings: `reviewersPerPaper` (2), `divergenceThreshold` (1.5), `cutoffScore` (3.5), reviewer deadline + reminder offsets (T−7, T−2, T+1).

## Addendum (same day) — second research pass on PKP tooling and 17 real Brazilian rubrics

Evidence: `docs/research/peer-review-pkp-and-brazilian-forms.md`. Additional decisions:

8. **Two Brazilian patterns coexist**: score-and-rank (2 reviewers, weighted scores, mean, cut-off, 3rd on split, capacity ranking → oral/pôster) and gate-and-revise (Aceito / Necessita correção / Não aceito, one revision loop). SIEAmB I promised "duas etapas: revisão de conteúdo e revisão textual e de forma" — our design supports both: scores+recommendation feed the ranking, and the single revision round is the "revisão de forma" pass by the área coordinator.
9. **Review forms are versioned and frozen once any review uses them** (OJS rule): editing creates a new version; reviews keep pointing at the version they answered. `ReviewCriterion` gets `formVersion`.
10. **Per-item visibility flag** (`visibleToAuthors`) on criteria/questions, and the **weighted total is hidden from the reviewer** (Unijuí) — reviewers score items, the committee sees totals.
11. **Gate = Não requires a justification** (Unijuí "eliminatória"); recommendation defaults to Rejeitar.
12. **Two reviewer deadlines**: `responseDueAt` (accept/decline, e.g. 48h–7d) and `reviewDueAt`; auto-reminders on both; on expiry the assignment is auto-released and the coordinator is prompted to reassign (IFRN pattern). Per-reviewer cap per área (JAI: 7).
13. **Rejection reason codes** (SBPC-style checklist) on desk-reject and reject: fora do escopo, sem resultados / resultados preliminares, já publicado, revisão bibliográfica sem contribuição, sem autorização ética (CEP/CEUA/SISGEN) quando aplicável, problemas graves de redação, identificação no arquivo. Shown to authors with the decision.
14. **Author-visible status vocabulary** (IME/Realize): Aguardando análise → Em avaliação → Aguardando correção → Corrigido, aguardando verificação → Aprovado (oral/pôster) / Reprovado.
15. **Anonymisation checklist text**: reuse the PKP pt-BR boilerplate ("Assegurando a avaliação cega por pares") verbatim in the submission form.
16. **Qualis reality**: CAPES has no Qualis Eventos for Ciências Ambientais; what counts for authors is anais with ISSN/ISBN and DOI, peer review stated in the call, and full papers ≥5 pages with a stable public URL. This reinforces Phase 4 (Zenodo DOI + ISSN) and a per-paper public page.
17. UFCG's own CICT&I presentation rubric (domínio do tema, clareza dos objetivos, fluência, tempo; 0–5 / 6–8 / 9–10) is the natural template for the Phase 4 best-paper / presentation evaluation.
