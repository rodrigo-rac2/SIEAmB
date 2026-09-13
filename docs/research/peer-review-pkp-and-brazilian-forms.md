<!-- Research report, 2026-09-13, produced by a Claude research agent from primary sources (110 fetches). [V] = verified from source, [I] = inferred. -->

# Brazilian conference peer review: PKP tooling + real review forms (research report)

Legend: **[V]** = verified from the fetched source (quoted or read directly). **[I]** = inferred / product knowledge, not confirmed in a fetched document. All Portuguese quotes are verbatim from the source unless marked otherwise.

---

## (A) PKP tools as used by Brazilian events

### A0. Landscape (what Brazilian events actually run on)

- **OCS/SOAC** [V]: IBICT's "Sistema Eletrônico de Administração de Conferências (SOAC)" is a pt-BR customization of PKP's Open Conference Systems. IBICT's own page says the interface commands were translated but "the built-in help was left in English and no manuals were made available in Portuguese" (https://antigo.ibict.br/tecnologias-para-informacao/soac). Still-live installs: Univap (https://congressos.univap.br/soac/), UNESP Marília (https://portalconferenciasppgci.marilia.unesp.br/...), IFRJ (https://wiki.ifrj.edu.br/dokuwiki/doku.php?id=dgti%3Aservicos%3Aconferencia%3Aguia), UTFPR "EVIN" (customized OCS, ~900 SICITE + 500 SEI submissions/yr) (https://repositorio.utfpr.edu.br/jspui/bitstream/1/4246/6/funcionalidadesgestaoeventosOCS.pdf).
- OCS is a 2.x-era codebase that PKP stopped developing (last release 2.3.6) [I]. Newer Brazilian events mostly moved to **OJS 3.x "used as a conference"**, to university SIG systems (**SigEventos**, UFRN family: https://www.ifes.edu.br/images/stories/files/manuais/manual-sigeventos-jun-2021.pdf) or to commercial platforms: **Even3** (Recife), **Doity**, **Realize Eventos/Editora Realize** (Campina Grande: CONEDU, CINTEDI, CONBRACIS, CONAPESC), **IME Events**, **Softaliza**. SIEAmB I (2025) itself ran on Even3 [V] (https://www.even3.com.br/e/1-seminario-internacional-de-estudos-ambientais-568589).

### A1. OJS 3.3 review configuration (Configurações > Fluxo de Trabalho > Avaliação) [V]
Source: https://docs.pkp.sfu.ca/learning-ojs/3.3/pt/settings-workflow

- **Modo de Avaliação padrão**: "selecione se o seu periódico manterá o avaliador/anônimo e autor/anônimo (duplo-cega), o avaliador anônimo e o autor divulgado (cega) ou processo de Avaliação aberta com avaliador/divulgado e autor/divulgado (abrir)."
- **Restringir acesso a arquivos**: "marque esta opção se desejar que o avaliador responda à solicitação de avaliação antes de acessar os arquivos submetidos."
- **Acesso 1-clique**: reviewer opens the review from the e-mail link without logging in.
- **Prazos de Resposta Padrão**: "indicam quanto tempo os avaliadores têm para decidir aceitar ou utilizar [sic: recusar] uma solicitação de Avaliação do editor e quanto tempo eles têm para realizar uma recomendação. Essas datas são calculadas a partir da data do envio do convite para avaliação." → two separate deadlines: **prazo de resposta** (accept/decline) and **prazo de avaliação** (recommendation).
- **Lembretes de e-mail automatizados**: dropdown "número de dias ou 'Nunca lembrar'" for "Enviar um lembrete se um revisor não tiver respondido a uma solicitação de revisão dentro do seguinte tempo (dias) após a data de vencimento da resposta" — one setting for the response deadline, one for the recommendation deadline. Requires the scheduled-tasks cron.
- **Orientações ao avaliador**: "Diretrizes para Avaliação: disponibilize aos seus avaliadores critérios para julgar a adequação de uma submissão…" and "**Conflito de interesses**: adicione sua declaração de política de divulgação de conflitos de interesse neste campo."
- **Formulários de Avaliação** (custom forms built by the editor):
  - "Os formulários de avaliação fornecem aos avaliadores um conjunto de perguntas a serem respondidas."
  - Per item: "Você pode escolher se deseja tornar a pergunta obrigatória para os avaliadores e incluir a mensagem ao autor" (i.e., a per-item **visible-to-author** flag).
  - Item types: "Uma caixa de texto de uma única palavra; Uma caixa de texto de uma única linha; Uma caixa de texto estendida (para respostas mais longas); Caixas de seleção - Checkboxes (permite que o avaliador selecione várias respostas possíveis); Botões rádio (permite que o avaliador selecione apenas uma resposta possível); Menu suspenso (permite que o avaliador selecione apenas uma resposta possível)."
  - "Um bom exemplo … é a Likert scale, em que o avaliador escolhe apenas uma opção: por exemplo, bom, neutro ou ruim."
  - Immutability: "Depois de enviar o formulário a um avaliador, você não poderá mais editá-lo, pois isso mudaria o registro de revisões existentes utilizando esse formulário. … você pode copiar o formulário existente e criar uma nova versão atualizada." → **forms are versioned/frozen once used** (good design cue).
  - Anonymity link: "Marque esta caixa para exibir um link com instruções sobre como garantir que todos os arquivos enviados sejam anônimos."
- **OJS does not compute scores** from review forms; no averaging, no thresholds [I for OJS; V for OCS — see A3].

### A2. OJS 3.3 editor-side review workflow [V]
Source: https://docs.pkp.sfu.ca/learning-ojs/3.3/pt/editorial-workflow

- Submission stage action buttons: "Enviar para Avaliação, Aceitar e enviar para Edição de Texto, e Rejeitar submissão."
- Entering review: "Quando a submissão entra no Estágio de Avaliação, uma notificação indica que os Avaliadores precisam ser atribuídos." Editor picks which author files go to reviewers ("Arquivos para avaliação"); can re-upload an anonymized copy: "Os gerentes e editores de periódicos podem reenviar o documento anônimo nos arquivos para avaliação, clicando em Enviar/Selecionar arquivos, na caixa Arquivos para avaliação."
- **Adicionar avaliador** dialog (UNICAMP guide https://econtents.sbu.unicamp.br/boletins/index.php/ppec/article/download/9393/4827/13994 [V for the flow]; field list [I]): list of journal reviewers with interests/history, "Selecionar avaliador", then a form with files to share, review type (duplo-cega/cega/aberta), response due date, review due date, review form, and the e-mail text. Reviewer status row lets the editor "ver os detalhes da avaliação, enviar e-mail para o avaliador, ou mesmo dispensá-lo antes que ele possa lhe responder".
- Review types: "Avaliador Anônimo/Autor Anônimo: a identidade do autor e do avaliador é mantida oculta. … Todas as informações de identificação nos metadados dos detalhes da submissão são retiradas automaticamente pelo sistema"; "Avaliador Anônimo/Autor Divulgado"; "Revisão Aberta". Downloaded filenames are neutralised: "ojs-review-assignment-1-article-text-8.docx".
- **Decisões**: "Solicitar revisão: isso vai exigir que o autor faça pequenas mudanças, o editor tem a opção de selecionar se outra rodada de revisão será demandada. Aceitar submissão: … pode prosseguir para o estágio de Edição de Texto. Rejeitar submissão: … A submissão seria então transferida para os Arquivos." Also "Fazer recomendação" (Editor de Seção → Editor). 3.3 adds reversal: "clicando em Alterar decisão e, em seguida, em Reverter recusa. Depois que uma decisão declinada for revertida, a submissão é restaurada ao estágio prévio e a rodada de revisão torna-se ativa."
- The **Solicitar Modificações** e-mail can carry reviewer attachments "(desde que seja anônimo)".
- **Rodada Adicional de Avaliação**: "Se desejar submeter o artigo revisado a outra rodada de avaliação, você pode iniciar uma segunda (ou terceira ou subsequente) rodada… É melhor iniciar uma nova rodada de avaliação depois que o autor carrega os arquivos revisados na rodada anterior." Tab "Nova rodada de revisão"; "Você pode atribuir os mesmos avaliadores ou avaliadores diferentes. Os avaliadores das rodadas anteriores não terão acesso aos comentários que fizeram na rodada anterior." (a known pain point → design cue: show a reviewer their own round-1 review in round 2.)
- **Author view**: author sees decision e-mail with reviewer comments labelled generically ("Avaliador A/B" [I]; the pt docs page fetched did not contain the label text) and the "Revisões" upload panel + "Discussões da avaliação".

### A3. OJS 3.3 reviewer workflow [V]
Sources: https://docs.pkp.sfu.ca/learning-ojs/3.3/pt/reviewing ; UNICAMP "OJS 3 para Avaliador" (https://econtents.sbu.unicamp.br/boletins/index.php/ppec/article/download/9174/4613/13223) ; UFT "Tutorial OJS 3 – AVALIADOR" (https://docs.uft.edu.br/share/proxy/alfresco-noauth/api/internal/shared/node/aoSRAmubQdWpA2YelvJdlg/content/Tutorial%20OJS%203%20-%20AVALIADOR.pdf)

- Entry: list "Minhas Submissões Designadas", link "Avaliação". "Observe a falta de qualquer informação sobre o autor neste processo de avaliação por pares do Avaliador Anônimo/Autor Anônimo."
- **Passo 1 – Requisição**: sections "Solicitação de Avaliação", "Título do artigo", "Resumo"; link "Ver todos os detalhes da submissão" (non-author metadata, read-only); "você pode ver o cronograma de avaliação, incluindo todas as datas de vencimento relevantes"; buttons accept/decline ("Se recusar, será excluído do processo"). Conflict-of-interest declaration on this step: not in the 3.3 pt docs fetched; OJS 3.x shows a "Conflito de interesses" radio ("Não tenho conflito de interesses" / "Posso ter conflito de interesses…") only when the journal enables it [I].
- **Passo 2 – Diretrizes**: "poderá ler todas as diretrizes para avaliadores fornecidas pela revista" (UFT: "Diretrizes da Revisão" opens the editor's guidance).
- **Passo 3 – Download e Avaliação**: "A primeira janela é para comentários ao Editor e ao Autor; a segunda janela é apenas para o Editor." Optional marked-up file upload: "lembre-se de retirar qualquer identificação pessoal do arquivo antes de carregá-lo" (UFT: field "Arquivos do Avaliador"). If a form was assigned, "preencher os campos do formulário atribuído". UNICAMP: "no campo de 'discussão da avaliação' é aonde será feita a comunicação entre avaliador/autor/editor".
- **Recomendação** dropdown (docs text): 
  - "Aceitar: o manuscrito está pronto para ir à edição."
  - "Correções obrigatórias: o texto requer pequenas alterações que podem ser revisadas e aceitas pelo editor."
  - "Submeter novamente para Avaliação: requer grandes alterações e outra etapa de avaliação por pares."
  - "Submeter a outra revista: o manuscrito não parece se ajustar ao foco e escopo do periódico."
  - "Rejeitar: o manuscrito tem muitos pontos fracos para ser aceito."
  - "Ver comentários: se nenhuma das recomendações acima fizerem sentido, é possível deixar um comentário para o editor…"
  - UFT's paraphrase (how Brazilian reviewers are told to read them): "Aceito – Será enviado para publicação e não necessita de correções; Correções Obrigatórias – Aceito, mas para ser publicado, o artigo deverá passar por correções; Submeter novamente para Avaliação – O artigo deverá ser revisado por completo para ser submetido novamente para avaliação; Submeter a outra revista – O artigo não contempla as diretrizes da revista…; Rejeitar – O artigo não possui os requisitos mínimos para publicação."
- **Passo 4 – Finalização**: "Enviar Avaliação" → confirm → thank-you screen; discussion thread stays open.
- OJS e-mail templates that define the notification set [V, settings-workflow page]: REVIEW_REQUEST / _SUBSEQUENT (2nd round), REVIEW_CONFIRM, REVIEW_DECLINE, REVIEW_REMIND, REVIEW_REMIND_AUTO ("enviado automaticamente quando a data de vencimento de um avaliador expira"), REVIEW_REQUEST_REMIND_AUTO (response deadline), REVIEW_CANCEL, REVIEW_REINSTATE, REVIEW_ACK ("Agradecimento pela avaliação"), EDITOR_DECISION_REVISIONS / _DECLINE / _INITIAL_DECLINE / _SEND_TO_PRODUCTION, REVISED_VERSION_NOTIFY (author uploaded a revision).

### A4. OJS 3.3 author side [V]
Source: https://docs.pkp.sfu.ca/learning-ojs/3.3/pt/authoring
- "Respondendo a uma avaliação": author uploads via "Carregar um Arquivo" choosing "uma revisão de um arquivo existente", then "Adicionar discussão" to notify the editor; "o autor precisa esperar para receber a notificação do editor se as revisões são aceitáveis."
- "Reenviando para revisão: Se a decisão do editor for reenviar para revisão… O reenvio é feito na fase de revisão, não havendo necessidade de iniciar uma nova submissão. … O processo de revisão por pares será repetido e você provavelmente receberá revisões adicionais para fazer."

### A5. "Assegurando a Avaliação Cega por Pares" — the PKP pt-BR boilerplate [V]
This is the stock locale text every Brazilian OJS/OCS shows via the "ensuring blind review" link (e.g. https://periodicos.ufjf.br/index.php/ronai/duplocega, https://revistas.ufpr.br/rinc/cega, https://revistafae.fae.edu/revistafae/avaliacao):

> "Para assegurar a integridade da avaliação cega por pares, deve-se tomar todos os cuidados possíveis para não revelar a identidade de autores e avaliadores entre os mesmos durante o processo. Isto exige que autores, editores e avaliadores (passíveis de enviar documentos para o sistema, como parte do processo de avaliação) tomem algumas precauções com o texto e as propriedades do documento:
> 1. Os autores do documento excluíram do texto nomes, substituindo com "Autor" e o ano em referências e notas de rodapé, em vez de nomes de autores, título do artigo, etc.
> 2. Em documentos do Microsoft Word (até 2003), a identificação do autor deve ser removida das propriedades do documento… Arquivo > Salvar como... > Ferramentas (ou Opções no Mac) > Opções de segurança... > Remover informações pessoais do arquivo ao salvar > OK > Salvar. Para as versões seguintes… Arquivo > Informações > Inspecionar documentos. Depois da verificação, clicar em "Remover tudo" na opção "Propriedades do documento e informações pessoais".
> 3. Em PDFs, os nomes dos autores também devem ser removidos das Propriedades do Documento, em Editar > Preferências > Identidade."

Brazilian events restate this in their calls, e.g. CONGEA: "Nenhuma referência aos nomes dos autores, suas entidades ou endereços poderá ser feita no cabeçalho do resumo expandido… Os Resumos Expandidos que vierem com estas informações serão devolvidos aos autores." IFES/CONNEPI ask for **two files**: "uma versão sem o nome dos autores para permitir uma avaliação às cegas" plus the identified version for the anais [V].

### A6. OCS / SOAC specifics [V]
Sources: "OCS em uma hora" (http://ocsemumahora.blogspot.com/2014/04/diretor-de-modalidade.html), IFRJ wiki guide, UTFPR paper, IBICT forum (https://forum.ibict.br/t/questionario-de-avaliacao/145, https://forum.ibict.br/t/alterar-nomes-diretor-diretor-de-modalidade-avaliador/90)

- Roles: Gerente Geral, **Diretor**, **Diretor de Modalidade** (track director), Avaliador, Autor. "A responsabilidade do Diretor de Modalidade é guiar uma submissão através do processo de avaliação cega por pares."
- Conference setup "Passo 3: Avaliação": "3.1 Política de Avaliação — Descreva … Inclua o número de avaliadores que geralmente analisam uma submissão, os critérios que eles seguem, o tempo ocupado na avaliação e os critérios de recrutamento de avaliadores. 3.2 Avaliação pelos Pares — … instruções adicionais, lembretes por e-mail, 'acesso 1-clique para avaliadores'. 3.3 Decisão do Diretor — … se o e-mail 'Notificar Autor' incluirá ou não automaticamente os endereços de e-mail de todos os co-autores."
- Reviewer profile carries **interest areas = modalidades**: "ao se cadastrar com o papel de avaliador, é necessário que o usuário defina sua área de interesse para a avaliação, que será utilizada pelo diretor do evento como especialidade do avaliador".
- Assignment/decision loop: "escolha um avaliador clicando em 'Designar'… clique no ícone de e-mail… 'Solicitação'… é possível designar mais de um avaliador para cada submissão." Reviewer "poderá recomendar que a submissão seja aceita, corrigida, submetida para outra conferência, ou recusada." Director: "'Acusar recebimento'… avaliar a contribuição do Avaliador através de uma escala de 1 a 5. Na seção 'Decisão do diretor', opte entre aceitar a submissão, submetê-la para outros avaliadores, ou rejeitá-la… 'Registrar decisão'."
- Sending reviewer feedback to the author (IBICT staff answer): "No caso de aceite com alterações, é enviada uma mensagem ao autor com o feedback dos avaliadores… o diretor pode clicar no botão 'Importar avaliação pelos pares', que incorporará ao texto do email os campos dos pareceres dos avaliadores… assinalar a opção 'Permitir acesso ao autor', ao lado do arquivo enviado pelo avaliador… 'Versão do diretor'. Lembrando que o campo do formulário deve permitir essa incorporação (incluir na mensagem ao autor)."
- Scoring limitation: Q "É possível classificar quantitativamente o resultado da avaliação com nota de 0-10?" — IBICT: "voce consegue criar um campo estruturado (um campo de seleção ou botoes radio, por exemplo), mas o sistema nao consolida as notas dos pareceres."
- UTFPR's patches show what a large Brazilian event needed on top of OCS: auto-assignment ("a modalidade/área de avaliação deve ser a mesma e a afiliação institucional deve ser diferente entre autores e avaliadores… sempre é designado o trabalho para o avaliador pertencente à mesma modalidade e com o menor número de avaliações atribuídas"; director sets "quantos avaliadores devem ser designados para cada trabalho"), numeric scoring from radio-button forms ("até 5 conceitos, considerando a escala Likert… ao final, seja realizada uma média da avaliação… No caso de mais de um avaliador por submissão, além da média de cada avaliador será apresentada a média final"), a "Notas" column in the submissions list, and attendance control for certificates.

---

## (B) Catalogue of real Brazilian review forms / criteria (Portuguese, verbatim)

### B1. XVII Congresso Brasileiro de Gestão Ambiental – CONGEA/IBEAS (2026, Belo Horizonte) — environmental management [V]
URL: https://www.ibeas.org.br/congresso17/conteudo.php?id=5
> "4.1 A seleção dos trabalhos orais e pôsteres, através da avaliação dos resumos expandidos, será realizada pela Comissão Organizadora do Congresso.
> 4.2 A cada trabalho serão atribuídas duas notas proferidas por diferentes avaliadores, que resultarão numa média final. A seleção dos trabalhos que serão apresentados da forma oral ou pôster será classificatória em função das médias obtidas.
> 4.3 O número de trabalhos selecionados para apresentação oral… condiciona-se a limitações de horário e sessões…
> 4.4 O status do trabalho (oral ou pôster) é definitivo, não podendo ser alterado.
> 4.5 A listagem dos trabalhos selecionados será disponibilizada no portal do Congresso… Esta será a única forma de comunicação sobre a seleção dos trabalhos."
> Criteria (3.4): "Título do trabalho; Objetivo do Trabalho; Metodologia Utilizada; Resultados Obtidos ou esperados; Conclusões/Recomendações; Referências Bibliográficas (no máximo 10). A Comissão Organizadora analisará os trabalhos segundo esses critérios, além da relevância dos mesmos na área de Gestão Ambiental."
> "1.1 O envio dos trabalhos técnicos será dividido em duas etapas: primeiramente o envio do Resumo Expandido, com formatação livre, e, posteriormente, com a aprovação deste, o envio do Trabalho Final."

Summary: 2 reviewers, numeric grade each, mean → ranking; oral vs poster decided by rank; no revision round (approved → send final full paper, DOI assigned); result published as a list, no individual e-mail; blind by rule (no author info in header).

### B2. III Simpósio Paraibano de Recursos Hídricos / III Simpósio Paraibano de Segurança de Barragens (AESA-PB, 2025) — water resources, Paraíba [V]
URL: https://www.aesa.pb.gov.br/assets/uploads/2025/10/EDITAL-III-SPRH-e-III-SPSB.pdf
> "4.1. Os trabalhos submetidos serão examinados por uma Comissão do Simpósio e apreciados por 02 (dois) pareceristas indicados por esta comissão. Estes avaliadores terão atuação profissional nas áreas de Recursos Hídricos e Segurança de Barragens e em pesquisa técnico-científica.
> 4.2. Critérios de Avaliação dos Artigos Submetidos — Os pareceristas analisarão e aprovarão o trabalho com base nos seguintes critérios: 1. Relevância do tema para o conhecimento técnico-científico, para a gestão de recursos hídricos e para a segurança de barragens. 2. Problema e objetivos de pesquisa. 3. Fundamentação teórica e/ou técnico-científica. 4. Adequação da metodologia aos objetivos. 5. Estrutura do trabalho (Título, Autores, Afiliações, Resumo, Palavras-chave, Introdução, Metodologia, Resultados e Discussão, Conclusão e Referências). 6. Clareza da escrita e adequação à língua portuguesa. 7. Conclusões alcançadas. 8. Observância às normas de formatação."
> Presentation: "1. Correlação entre a apresentação e o conteúdo do trabalho submetido. 2. Desenvoltura, domínio e objetividade na apresentação. 3. Atualidade e relevância do tema… 4. Respeito ao tempo previsto."

Summary: resumo expandido 2–5 pages; 2 pareceristas; 8 qualitative criteria, no published scale; "Resultado Parcial" then final; banner presentation.

### B3. IFES (SigEventos) "Critérios de Avaliação de Resumos" [V]
URL: https://sigeventos.ifes.edu.br/sigeventos/verArquivo?idArquivo=2381303&key=e8968d4a2ab40dae385388ffef4675e0
> "01 Título: deve ser claro, compatível com o conteúdo do trabalho, coerente. 02 Objetivos: os objetivos devem ser claros e explícitos. 03 Metodologia/Desenvolvimento: deve descrever adequadamente os sujeitos, as etapas, e os processos em questão. 04 Resultados: os resultados devem estar efetivamente apresentados. 05 Conclusões: devem ser coerentes, relacionadas com os objetivos do resumo e mostrando o avanço do conhecimento científico. 06 Linguagem e Redação: escrita clara, aceitável e com objetividade, e fácil leitura. 07 Originalidade do Trabalho: quão inovador e inusitado é o conteúdo do trabalho?
> O resumo será avaliado por dois especialistas… Cada um dos critérios será avaliado de 0-100, obtendo-se a nota pelo cálculo de média simples. Para ser aprovado, o resumo deve obter nota igual ou superior a 70 pontos. A nota final é a média das notas dos dois avaliadores.
> Caso o trabalho seja aprovado por um avaliador, mas reprovado por outro, um terceiro especialista avaliará resumo.
> Caso haja mais de 100 resumos aprovados, os resumos aprovados serão classificados em ordem decrescente pela nota final… Em caso de empate, o critério de desempate será a ordem de submissão do resumo.
> … enviar o resumo na versão completa, para compor os anais do evento e também uma versão sem o nome dos autores para permitir uma avaliação às cegas."

Summary: 7 criteria × 0–100, simple mean, cut-off 70, 2 reviewers, 3rd on split decision, tie-break by submission order, capacity cap → ranking, two-file blind submission.

### B4. IFRS "Critérios de Avaliação dos Trabalhos" (Salão de Iniciação Científica) [V]
URL: https://ifrs.edu.br/wp-content/uploads/2019/09/Crit%C3%A9rio-de-Avalia%C3%A7%C3%A3o-dos-Trabalhos-SI.pdf
> "…atribuição de nota de 0 (zero) a 10 (dez) para cada item avaliado. A nota final será obtida pela média aritmética simples… A Comissão Organizadora realizará a classificação dos trabalhos em ordem decrescente…
> 1. Observação das normas da língua portuguesa. 2. Coerência entre o título e o resumo. 3. Introdução/Justificativa. 4. Objetivos. 5. Metodologia. 6. Resultados obtidos. 7. Conclusões/considerações finais.
> Escala de notas: 0: Não atende o item. 1 a 5: Insatisfatório: Atende insatisfatoriamente o item. Apresenta DESCRIÇÃO INCOMPLETA e NÃO PERMITE A INTERPRETAÇÃO do item avaliado. 6 e 7: Satisfatório: Atende parcialmente o item. Apresenta DESCRIÇÃO INCOMPLETA, mas PERMITE A INTERPRETAÇÃO… 8 e 9: Bom: Atende o item. Apresenta DESCRIÇÃO COMPLETA e PERMITE A INTERPRETAÇÃO… 10: Excelente: Atende plenamente o item… PERFEITAMENTE ARTICULADO com os demais itens avaliados."
> Oral presentations: "uma dupla de avaliadores selecionados de acordo com a grande área do conhecimento do CNPq" with weights: "Clareza da apresentação, postura e adequação de linguagem (peso 2); Domínio do conteúdo apresentado (peso 2); Coerência entre o tema, o(s) objetivo(s) e justificativa(s) (peso 1); Relevância, originalidade e aplicabilidade (peso 1); Descrição da metodologia… (peso 1); Síntese dos resultados… (peso 2); Distribuição adequada do conteúdo ao tempo (peso 1)."

Summary: 7 items × 0–10 with **anchored band descriptors**, simple mean, ranking; presentation rubric weighted; reviewer pairs by CNPq area.

### B5. Unijuí "Salão do Conhecimento 2018 – Manual do Avaliador" (research + extension, trabalho completo & resumo expandido) [V] — the richest example
URL: https://www.unijui.edu.br/arquivos/salao2018/Manual_do_Avaliador.pdf
> "Todos os trabalhos inscritos… serão avaliados sem identificação dos autores, avaliadores ou instituição… Os trabalhos que serão encaminhados aos avaliadores estarão relacionados às áreas do conhecimento escolhidas no ato de sua inscrição como avaliador."
> "Além das questões do formulário que possuem peso e que irão compor a nota final do trabalho, o avaliador deverá responder a uma questão que é ELIMINATÓRIA. Mesmo que o trabalho tenha obtido a nota mínima exigida para aprovação, não será aceito, caso a resposta dessa questão indique que o trabalho não atende aos requisitos para publicação."
> "Favorável à publicação: a nota final do trabalho deve ser igual ou maior que a 5,0. Não favorável à publicação: a nota final… menor do que 5,0."
> "Serão aprovados os trabalhos que obtiverem nota igual ou superior a 5,0… e que, além disso, tenham parecer favorável do avaliador quanto à publicação."
> "Todos os trabalhos não aprovados serão encaminhados para uma segunda avaliação e, em caso de divergência, ou seja, em que o primeiro avaliador tenha reprovado o trabalho e o segundo, aprovado, será encaminhado ao Comitê Científico… para parecer final."
> "ATENÇÃO! O avaliador não deve utilizar este campo para recomendar modificações ou correções no trabalho, pois o autor não terá oportunidade de realizar ajustes. O trabalho, se aprovado, será publicado nos anais exatamente como foi submetido e avaliado."
> "a nota final não será visualizada pelo avaliador, e ainda, que ao finalizar uma avaliação, não terá mais como alterá-la… o sistema só permite o salvamento após ter respondido a todas as questões."
> "A avaliação de trabalhos poderá ser realizada no período de 18 de julho a 15 de agosto de 2018… Seu certificado será disponibilizado em meio digital após o término do evento."
> Anexo 1 (trabalho completo, pesquisa), each criterion PESO 2,0 with 5 anchored options (0,0 / 0,5 / 1,0 / 1,5 / 2,0): "Relevância — O trabalho demonstra contribuição científico-acadêmica para a área do conhecimento?… (0,0 Não é relevante … 2,0 Totalmente relevante)"; "Originalidade ou Inovação — O trabalho apresenta uma abordagem teórica e/ou metodológica original?…"; "Fundamentação teórica e metodológica — O estudo apresenta consistência conceitual e teórica?… Os procedimentos metodológicos… claramente descritos e consistentes com os objetivos?"; "Resultados, discussão e conclusão — Os resultados são apresentados de forma clara e consistente?… As conclusões são coerentes com os resultados… e respondem aos objetivos?"; "Redação e forma — O texto é claro e conciso?… A formatação atende às normas do evento?" (options Insatisfatório / Parcialmente satisfatório / Satisfatório / Muito satisfatório / Totalmente satisfatório). Then: "Atenção! A questão a seguir é eliminatória… O presente trabalho deve ser aceito para publicação nos anais do evento? ( ) Favorável à publicação ( ) NÃO favorável. O trabalho não atende minimamente aos requisitos para publicação. Se a resposta for NÃO favorável à publicação, o avaliador deverá justificar sua opção."
> Anexo 2 (resumo expandido, pesquisa): Relevância 2,0; Fundamentação teórica e metodológica **3,0** (0,00/0,75/1,50/2,25/3,00); Resultados, discussão e conclusão **3,0**; Redação e forma 2,0. Anexo 3 (extensão): Relevância 2,0; "Contribuição e impacto social" 2,0; Fundamentação 2,0; Resultados 2,0; Redação 2,0.

Summary: modality-specific weighted rubrics summing to 10; anchored 5-point options; **eliminatory gate** with mandatory justification; cut-off 5.0; 1 reviewer, 2nd only if rejected, committee on divergence; **no author revision** (accept-as-is or reject); reviewer can't see the total or edit after submit; reviewer certificate after event.

### B6. XXI Congresso Brasileiro de Custos (2014) — full-paper double-blind with weights + conceito [V]
URL: https://anaiscbc.emnuvens.com.br/anais/article/download/3871/3872/3969
> "O processo de avaliação foi double blind review… A Organização do Congresso enviou cada trabalho a dois avaliadores, atentando para as seguintes regras: 'o avaliador não é um dos autores do artigo', 'o avaliador não possui coautoria com nenhum autor, mesmo em outros trabalhos' e 'o avaliador não é do mesmo estado de algum autor'.
> A avaliação foi dividida em dois componentes: nota e conceito… notas… numa escala de 1 a 5, de acordo com 10 critérios, com pesos diferenciados: 1. Originalidade do trabalho e relevância do tema (peso 1), 2. Pertinência do título e qualidade do resumo e introdução (peso 2), 3. Qualidade da revisão de literatura (peso 2), 4. Consistência teórica do trabalho e contribuição (peso 3), 5. Metodologia utilizada (adequação e qualidade) (peso 2), 6. Análise de dados e resultados… (peso 1), 7. Clareza, pertinência e consecução dos objetivos (peso 2), 8. Conclusões: fundamento, coerência e alcance (peso 1), 9. Qualidade da redação e organização do texto… (peso 2) e 10. Atendimento da formatação exigida pelo congresso (peso 1).
> …cada avaliador atribuiu um conceito (A, B, C ou D)… A 'aceitar prioritariamente', B 'aceitar', C 'aceitar se competição for baixa' e D 'rejeitar'. …'A' equivaleu a 10 pontos, 'B' a 7 pontos; 'C' a 5 pontos e 'D', a 1 ponto.
> No início da avaliação, o avaliador julgava se o tema do trabalho era adequado ao tema do congresso. Se… não… o trabalho era rejeitado (nota 1 a todos os quesitos e conceito D).
> Nos casos em que os conceitos divergiram muito… (artigos avaliados com o conceito D por um avaliador e A ou B pelo outro avaliador), o artigo foi reencaminhado a um terceiro avaliador. A avaliação divergente entre as três foi desconsiderada…
> Os artigos que apresentaram 2 conceitos D… ou 1 conceito D e um conceito C… foram eliminados.
> Nota final = (Nota_média_2_a_10 + Conceito_médio) / 2"

Summary: 2 reviewers, 10 weighted criteria (1–5), scope gate, A–D conceito, 3rd reviewer on D-vs-A/B, outlier discarded, formula → cut-off for oral (120) vs poster (118); 174 reviewers for 438 papers; conflict rules include same-state exclusion.

### B7. Congresso USP de Controladoria e Contabilidade (FIPECAFI) [V, summarized quotes]
URL: https://congressousp.fipecafi.org/Trabalhos/SelecaoTrabalhos
> Scale: "1 - Discordo Totalmente; 2 - Discordo Parcialmente; 3 - É Indiferente; 4 - Concordo Parcialmente; 5 - Concordo Totalmente". Weights: quesitos 1 e 7 peso 2, demais peso 1. "dois pesquisadores qualificados avaliarão os trabalhos"; "double blind review"; "No caso de avaliações cujas médias tiverem uma discrepância relevante, o artigo será encaminhado para um terceiro avaliador."; "A seleção dos trabalhos seguirá a ordem de classificação dada pela média das notas dos avaliadores." Reviewers must justify scores below 3 (search snippet, [V-lite]).

### B8. 78ª Reunião Anual da SBPC (2026) — resumo expandido, no revisions [V]
URL: https://ra.sbpcnet.org.br/78RA/wp-content/uploads/2025/12/2_Normas_de_submissao_de_trabalho_78RA.pdf
> "1.3 Os trabalhos serão avaliados pelos assessores da SBPC e poderão ser aceitos ou recusados. Somente em caso de aceite, a taxa de inscrição deverá ser paga…
> 3.1 O parecer será emitido por pares de assessores da área, com base nas normas, podendo incluir informações e observações adicionais.
> 3.2 Atenção: Não serão permitidas correções no trabalho durante o processo de avaliação nem após a emissão do parecer. A SBPC não analisará pedidos de revisão, reconsideração ou alteração… Trabalhos recusados não terão revisão de parecer, sendo a decisão final e irrevogável.
> 3.3 Será recusado o trabalho enquadrado em um ou mais itens: a) Projeto de trabalho sem resultados. b) Trabalho com resultados preliminares ou inconclusivos. c) Resultados fragmentados em vários trabalhos. d) Trabalho já publicado. e) Trabalho de revisão bibliográfica. f) … trabalho sem o número da autorização legal… (Comitê de Ética… CEUA, IBAMA, ICMBio, CGEN, IPHAN etc.) g) Trabalho sem rigorosa revisão gramatical… h) Trabalho que apenas descreva eventos, oficinas, fotos ou vídeos. i) Trabalho com parecer de recusa quanto ao mérito científico pelos assessores."
> "6.4 … A data de resposta será diferente para cada participante e não seguirá a ordem de submissão."

Summary: binary accept/reject; pairs of assessors; **explicit rejection checklist** (a good "reason code" list); no appeal; rolling results.

### B9. XII CONEDU (Realize Eventos platform, Campina Grande, 2026) [V]
URLs: https://www.conedu.com.br/normas-de-submissao---comunicacao-oral ; https://www.conedu.com.br/normas-de-submissao---poster
> "1º fase - Envio do Resumo Simples… resumo simples com 200 a 300 palavras… apresentar clareza, correção ortográfica e rigor científico, pois será o principal instrumento de avaliação.
> Avaliação: Cada resumo será classificado como Aceito, Necessita Correção ou Não Aceito. Os trabalhos que necessitarem correção deverão ser reenviados dentro do prazo estipulado, com as alterações solicitadas pelo(a) avaliador(a) na Área do Participante. Os resumos devem estar vinculados a um dos grupos de trabalho (GTs) do evento.
> IMPORTANTE: Em caso de avaliação NÃO ACEITO, não será possível excluir a submissão realizada nem solicitar a abertura de uma nova submissão… o sistema possui limite de submissões por participante…
> Caso a Comissão Avaliadora solicite a alteração do título… enviar um e-mail… Já a alteração de Grupo de Trabalho (GT)… exclusivamente por e-mail.
> 2ª Fase – Envio do Trabalho Completo… (após o evento)… A4, entre 8 e 12 páginas."
> GT coordinators (https://www.conedu.com.br/edital-para-coordenacao-de-gt): "indicação dos(as) avaliadores(as) para avaliação de trabalhos referentes ao seu GT e administração dos(as) avaliadores(as) no que diz respeito às avaliações dos trabalhos dentro do prazo estipulado."

Summary: Realize's model = **abstract-first gate** (Aceito / Necessita Correção / Não Aceito), 1 revision loop via participant area, full paper only after the event (anais), reviewers recruited per GT by GT coordinators; per-participant submission quota counts rejections; **no public rubric** (not found on editorarealize.com.br or conedu.com.br). Modalities on Realize events: Comunicação Oral, Pôster, Ebook chapter; resumo simples → trabalho completo (relato de experiência is a *type of study*, not a separate form) [V for CONEDU; other Realize events [I]].

### B10. IFRS Erechim – JEPEX 2019 "Ficha de Avaliação de Artigo Científico" [V]
URL: https://ifrs.edu.br/erechim/wp-content/uploads/sites/3/2019/08/Ficha-de-avalia%C3%A7%C3%A3o-Artigos.pdf
> Per section (TÍTULO, RESUMO, INTRODUÇÃO, FUNDAMENTAÇÃO TEÓRICA, METODOLOGIA*, RESULTADOS*, CONSIDERAÇÕES FINAIS, REFERÊNCIAS, ASPECTOS GERAIS, formatação ABNT/modelo JEPEX): "( ) Atende ( ) Não atende ( ) Parcialmente* — *Correções:" e.g. "INTRODUÇÃO: Apresenta e contextualiza o tema, a delimitação do problema, a justificativa, os objetivos e a metodologia da pesquisa, assim como a estrutura do artigo?"; "* Considerar apenas em pesquisa prática/aplicada."
> "Parecer: ( ) Aprovado ( ) Aprovado com restrições ( ) Reprovado"; "Avaliador nº ___"; plus a signed reviewer declaration listing papers reviewed (for certification).

### B11. IFCE – SEMIC 2016 "Ficha de Avaliação de Trabalhos" (oral/banner) [V]
URL: https://portal.ifce.edu.br/documents/3916/Ficha_de_Avalia%C3%A7%C3%A3o_Semic_2016.pdf
> "Apresentação: ( ) oral ( ) banner … Nota 1 a 5: Na Introdução consta claramente a relevância do tema e os seus objetivos; Fundamentação teórico-científica; Adequação da metodologia ao tipo de trabalho; Domínio do conteúdo na apresentação; Qualidade da Organização e Apresentação do Pôster e do Artigo…; Apresentação dos resultados (parciais ou finais) e conclusões; Adequação da Apresentação ao tempo disponível; TOTAL; OBSERVAÇÕES; Assinatura do Avaliador."

### B12. UFSM – 38ª Jornada Acadêmica Integrada (2023) reviewer tutorial [V]
URL: https://www.ufsm.br/app/uploads/sites/681/2023/09/Tutorial-avaliadores-JAI-2023-1.pdf
> "A escolha dos avaliadores foi feita de forma automática… limite máximo de 7 (sete) trabalhos por avaliador. A segunda etapa… é apenas para os alunos que ficarem com seu trabalho em revisão… Uma última etapa é a seleção final, quando os avaliadores recebem de volta apenas os trabalhos postos em revisão…
> 'Situação após a avaliação': APROVADO: o trabalho é aprovado tal qual foi submetido… NÃO APROVADO: … sugerimos usar esta opção apenas em casos extremos que o trabalho não permita ajustes – se usar esta opção você deverá justificar… NECESSITA REVISÃO: o trabalho é recomendado para apresentação na JAI, mas precisa de alguns ajustes… digite seu parecer orientando os autores no que precisa ser feito no campo 'Resposta'."

Summary: 3-state parecer, single "Resposta" text field, one revision round returned to the **same reviewer**, dated 3-stage calendar (11–22/09 review, 26–28/09 author fix, 02–04/10 re-check), cap of 7 papers per reviewer.

### B13. IFRN Secitex/Congic reviewer operations [V]
URL: https://portal.ifrn.edu.br/campus/reitoria/noticias/confira-as-orientacoes-para-realizar-uma-boa-avaliacao-de-trabalhos/
> "o próprio sistema de submissão dos trabalhos sorteia os avaliadores a partir da área de conhecimento cadastrada. Após enviar mensagens de alerta para o email inscrito, o sistema aguarda o aceite do avaliador por até quarenta e oito horas. Após o aceite, o trabalho fica sob a responsabilidade dele por até setenta e duas horas. Caso o pesquisador não realize a avaliação dentro do prazo, automaticamente o sistema envia o trabalho para outro avaliador."
> "Rejeição: Fora do escopo geral do evento, linguagem inadequada, erros metodológicos e resultados incipientes. Aceite: Alta qualidade desde a parte escrita, até os procedimentos metodológicos, possuir resultados consistentes e boas referências."

### B14. UFCG – Congresso de Iniciação Científica (CICT&I) presentation rubric [V]
URL: https://prpg.ufcg.edu.br/congresso/instrucoes-aos-autores.html
> Criteria: "Domínio do Tema; Clareza do aluno sobre os objetivos do seu trabalho; Fluência na discussão/apresentação; Atendimento aos objetivos da Iniciação Científica; Tempo de apresentação". Scale: "0 – 5 Não atendeu ao requisito | 6 – 8 Atendeu suficientemente ao requisito | 9 – 10 Atendeu plenamente ao requisito". "banca composta por pesquisadores doutores da UFCG e de IES convidados".

### B15. FECITEC/UFV (science fair) [V] — scale "0 ou entre 5 e 10 (0=ausente; 5=regular; 6=bom; 7=muito bom; 8=ótimo; 9=excelente; 10=excepcional)", "Comissão Julgadora, composta de 3 a 5 profissionais". https://fecitec.caf.ufv.br/avaliacao-dos-trabalhos/

### B16. RBGDR journal "Ficha de Avaliação de Artigo" (journal, but a template widely copied by events) [V]
URL: https://www.rbgdr.net/revista/public/journals/1/modelo_formulario_avaliacao_artigos.pdf
> 13 items "[ ]sim [ ]não [ ]parcialmente" (Adequado à linha editorial? Título adequado? Resumo/Abstract adequado? Objetivos claros? Metodologia? Introdução? Referencial teórico? Ilustrações/Tabelas? Resultados e Discussão? Referências pertinentes? Normas ABNT? Princípios éticos respeitados?). "Parecer do avaliador: [ ] favorável à publicação [ ] favorável, com pequenas alterações, não necessitando reavaliação [ ] o trabalho deverá ser reavaliado após alterações [ ] desfavorável à publicação. Comentários/Alterações (Este parecer será enviado para o autor)".

### B17. I SIEAmB (2025, Even3) — your own baseline [V]
URL: https://www.even3.com.br/e/1-seminario-internacional-de-estudos-ambientais-568589
> "Resumo Expandido… entre 4 e 6 páginas"; "Artigo Científico… entre 12 e 15 páginas. Os trabalhos podem ser teóricos ou empíricos"; "trabalhos em português, inglês e espanhol"; "Os estudos submetidos ao evento serão avaliados em duas etapas, sendo a primeira revisão de conteúdo e a segunda revisão textual e de forma."; "um processo de avaliação realizado pelos pareceristas e pelo Conselho Científico do I SIEAmb"; "1 (um) autor e, no máximo, 5 (cinco) coautores"; "Os melhores artigos serão indicados para publicação como capítulo de livro."

### B18. Platform conventions (what Brazilian committees are used to) [V]
- **Even3** (https://blog.even3.com.br/avaliacao-dos-trabalhos/): "Avaliação Padrão… um trabalho pode ser reprovado, aprovado ou aprovado com ressalvas" — with ressalvas the work "retorna ao autor para correções, então reenviado para verificação do avaliador"; "Avaliação por Critérios" with example criteria "Coesão e Coerência; Relevância do problema abordado; Contribuição científica; Apresentação clara dos resultados; Atualidade do tema; Ineditismo; Ortografia", weights and minimum score; "Utilizamos o método de avaliação duplo-cego, que omite tanto o nome do autor como dos avaliadores"; organizer sets "o número de revisores que irão avaliar cada trabalho"; reviewer certificates with tag "{avaliador.nome}" (https://ajuda.even3.com.br/hc/pt-br/articles/26909725821979-Emitir-certificado-de-avaliador). Even3 help "Emitir o parecer de um trabalho" returned 403 (Cloudflare) — not read.
- **Doity** (https://ajuda.doity.com.br/pt-br/article/configurando-a-etapa-de-avaliacao-dos-trabalhos-1uvnvyo/): "três opções de resultado" — "aceito", "não aceito", "aceito com restrições" (removing the last disables the revision flow); methods: estrelas / nota numérica / conceito; "Quantidade de avaliadores por trabalho"; reviewer workload cap per área temática; option to send comments to authors. Doity's list of the 23 most common criteria: https://doity.com.br/blog/criterios-de-avaliacao-de-trabalhos-conheca-os-23-mais-comuns/ (Relevância do tema, Originalidade, Objetivos, Inovação, Atualidade, Delimitação do objeto e problematização, Articulação entre objetivos/problematização/resultados, Contextualização teórica…, Título, Introdução, Metodologia, Fundamentação teórica, Resultados, Considerações finais, Conclusão, Referências, Coesão, Coerência, Ortografia e gramática, Clareza/pertinência/consecução dos objetivos, Adequação às normas da ABNT, Clareza e propriedade no uso da linguagem) and the advice "entre 6 e 8" criteria.
- **IME Events** (VI CONBRASP, https://ime.events/vi-conbrasp/resumo): author-visible statuses "Aguardando análise / Resumo corrigido, aguardando análise / Aguardando correção / Aprovado / Reprovado"; "O prazo para correções é de até 10 dias".
- **Softaliza** (https://www.softaliza.com.br/avaliacoes): "Aceite, aceite com ressalvas, rejeição"; "Por padrão 3 revisores por trabalho. Configurável por trilha temática", 4th reviewer on disagreement, consolidated parecer with "média e dispersão"; auto-anonymization of "Nome, instituição, agradecimentos e referências auto-citantes".

### B19. Third-reviewer / discrepancy patterns found [V]
- Split accept/reject → 3rd reviewer (IFES; FIPECAFI "discrepância relevante" between means; CBC "D vs A/B", discard the outlier).
- Rejected-only second review, then committee arbitrates (Unijuí).
- Consolidated "média e dispersão" flag (Softaliza); "the third correction prevails" is a Cebraspe exam practice, not an event practice.

### B20. Reviewer certificates [V]
Standard expectation: "certificado de avaliador ad hoc" issued after the event (Unijuí: "Seu certificado será disponibilizado em meio digital após o término do evento"; JEPEX signed declaration listing papers; Even3 automated certificates). Journals issue per-parecer certificates (e.g. https://periodicos.ufpe.br/revistas/estudosuniversitarios/announcement/view/527). Hours vary; one FEMIC example gives 60h volunteer certificates [V-lite].

### B21. Qualis and events [V/I]
- CAPES **discontinued Qualis Periódicos** for the 2025–2028 cycle ("Qualis Referência", article-level bibliometrics) [V: blog.even3, UFMS, INPA news].
- **Qualis Eventos** existed formally only for Computação (2017–2020 report: https://www.gov.br/capes/pt-br/centrais-de-conteudo/documentos/avaliacao/09012022_RELATORIOQUALISEVENTOS20172020COMPUTACAO.PDF); UFBA PGCOMP states "Em 2026, a Capes divulgou o Qualis Periódicos (2021-2024) e o Qualis Eventos (2025)" and "o conceito de 'Lista Qualis'… não existe mais" (https://pgcomp.ufba.br/qual-o-qualis-de-uma-conferencia-ou-um-periodico). Legacy list: https://sucupira-legado.capes.gov.br/sucupira/public/consultas/coleta/qualisEventos/listaQualisEventos.xhtml.
- Other areas (Ensino, 2016) classify events themselves into E1–E4 by "Consolidação" (editions/periodicity) and "Abrangência" (internacional/nacional/regional/estadual/local — criteria include "comitê científico com a maioria de membros de instituições estrangeiras", "chamada internacional para submissão"), and count only "trabalho completo em anais… cinco páginas ou mais" with a public URL (https://www.gov.br/capes/pt-br/centrais-de-conteudo/DOCUMENTO_CRITRIOS_EVENTOS__AREA_DE_ENSINO__46.pdf/@@display-file/file). For Engenharias/Ciências Ambientais there is no separate Qualis Eventos [I]; what matters for authors is anais with ISSN/ISBN, DOI (CONGEA assigns DOI), peer review stated in the call, and full-paper length.

---

## Not found / gaps
- No public scoring rubric for Realize Eventos (CONEDU etc.) beyond Aceito / Necessita Correção / Não Aceito.
- ABRHidro SBRH "Normas de submissão" PDF not located; page says only "A avaliação será realizada a partir da submissão do TRABALHO COMPLETO… decisão final referente ao formato de apresentação… pela Comissão Científica" [V]. ENES has no published criteria.
- ABES (Fitabel 2025) pages returned 503; search snippet: "A cada trabalho serão atribuídas notas proferidas por diferentes avaliadores, que resultarão numa média final" (same model as CONGEA) [V-lite].
- CONNEPI 2026: two-file blind submission, reviewer bank via Lattes + área temática, master's degree required for reviewers; rubric not public.
- IBICT SOAC "cartilha" PDF and the EAD course page are dead links.

## Design takeaways for SIEAmB (from the evidence)
1. Two dominant Brazilian patterns: (a) **score-and-rank** (2 reviewers, 0–10 or 0–100 per criterion, mean, cut-off, 3rd reviewer on split, capacity cap → oral/poster) and (b) **gate-and-revise** (Aceito / Necessita Correção|Aprovado com ressalvas / Não Aceito, one revision loop, often re-checked by the same reviewer). SIEAmB I already promised "duas etapas: revisão de conteúdo… revisão textual e de forma", i.e. pattern (b) with a form/language pass.
2. Reviewer form = OJS-style: versioned form, item types (radio Likert with anchored labels, checkbox, short/long text), per-item **visible-to-author** flag, two comment boxes (author+editor / editor-only), optional annotated file, recommendation enum. Add what OJS lacks and every Brazilian rubric uses: **weights, automatic mean, cut-off, eliminatory gate with mandatory justification, hidden total from the reviewer**.
3. Deadlines: separate **prazo de resposta** (accept/decline, IFRN uses 48h) and **prazo de avaliação** (72h at IFRN, 10 days at IME, ~4 weeks at Unijuí), auto-reminders, auto-reassign on expiry, per-reviewer cap (JAI: 7).
4. Conflict rules seen in practice: not an author, no co-authorship elsewhere, different institution (UTFPR auto-assign), even different state (CBC); plus interest areas = GTs/áreas temáticas.
5. Recommendation vocabulary to reuse (pt-BR): Aceitar; Correções obrigatórias / Aprovado com ressalvas / Necessita correção; Submeter novamente para avaliação (nova rodada); Rejeitar; plus decision labels Aceitar submissão / Solicitar modificações / Nova rodada / Rejeitar; author statuses "Aguardando análise → Aguardando correção → Resumo corrigido, aguardando análise → Aprovado/Reprovado".
6. Include a SBPC-style **rejection reason checklist** and a CONGEA/IFES-style rule for tie-breaks and capacity ranking; reviewer certificate (ad hoc, with paper count) is expected.
