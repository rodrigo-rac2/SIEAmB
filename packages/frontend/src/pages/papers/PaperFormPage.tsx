import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/shared/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useEvent } from '../../contexts/EventContext';
import { useLocalized } from '../../hooks/useLocale';
import { useContent } from '../../hooks/useContent';
import { fetchAccount } from '../../services/account';
import {
  SubmissionError,
  fetchPaper,
  rulesForEvent,
  savePaper,
  searchPeople,
  uploadPaperFile,
  type Modality,
  type Paper,
} from '../../services/submissions';
import { NotFoundPage } from '../NotFoundPage';
import { AuthorList, asksDocument, newAuthorRow, toAuthorInput, type AuthorRow } from './AuthorList';
import { documentProblem } from '../../components/account/DocumentFields';
import '../../components/registration/RegistrationForm.css';
import '../account/Account.css';
import './Papers.css';
import { PageLoading } from '../../components/shared/Loading';

/**
 * `/:event/meus-trabalhos/novo` and `/:event/meus-trabalhos/:paperId`: send a paper,
 * or change one while submissions are open. The server applies every rule of the
 * edital again; what is checked here only saves the person a round trip.
 */
export function PaperFormPage() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const { event } = useEvent();
  const { paperId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const l = useLocalized();
  const accessToken = auth.enabled ? auth.accessToken : null;
  const editing = Boolean(paperId);

  const areas = useContent('getThematicAreas', event?.id) ?? [];
  const [existing, setExisting] = useState<Paper | null>(null);
  const [ready, setReady] = useState(!editing);
  const [title, setTitle] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [modality, setModality] = useState<Modality>('RESUMO_EXPANDIDO');
  const [areaRef, setAreaRef] = useState('');
  const [abstract, setAbstract] = useState('');
  const [keywords, setKeywords] = useState('');
  const [keywordsEn, setKeywordsEn] = useState('');
  const [authors, setAuthors] = useState<AuthorRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // The name of the account, on its way: someone quick to press Send must not lose their own name.
  const ownName = useRef<Promise<string>>(Promise.resolve(''));
  // An account that has not said who the person is sends nothing (ADR-010): said before the form is filled.
  const [documentMissing, setDocumentMissing] = useState(false);

  useEffect(() => {
    if (!accessToken || !event || !paperId) return;
    let active = true;
    fetchPaper(accessToken, event.slug, paperId)
      .then((answer) => {
        if (!active) return;
        // Only whoever sent it, or an organiser, gets the form (#250).
        const paper = answer.submission.canEdit ? answer.submission : null;
        setExisting(paper);
        if (paper) {
          setTitle(paper.title);
          setTitleEn(paper.titleEn);
          setModality(paper.modality);
          setAreaRef(paper.areaRef);
          setAbstract(paper.abstract);
          setKeywords(paper.keywords.join('; '));
          setKeywordsEn(paper.keywordsEn.join('; '));
          setAuthors(
            paper.authors.map(({ fullName, email, position }) => {
              // What is on record about who each author is: asked again only where it is missing.
              const known = paper.authorDocuments?.find((d) => d.position === position);
              const onRecord =
                known?.state === 'account'
                  ? ({ state: 'account' } as const)
                  : known?.state === 'typed'
                    ? ({ state: 'typed', hint: known.hint ?? '' } as const)
                    : undefined;
              // An administrator correcting a paper may leave a line from before documents as it is.
              const legacy = Boolean(paper.asOrganiser) && known?.state !== 'account' && known?.state !== 'typed';
              return newAuthorRow({ fullName, email, self: email === auth.email?.toLowerCase(), onRecord, legacy });
            }),
          );
        }
        setReady(true);
      })
      .catch(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, [accessToken, event, paperId, auth.email]);

  // A new paper starts with whoever is sending it, by the name in their account.
  // They can move themselves down: the first author need not be the sender (#230).
  useEffect(() => {
    if (!accessToken || editing || !auth.email) return;
    let active = true;
    const email = auth.email.toLowerCase();
    setAuthors((current) => (current.length ? current : [newAuthorRow({ email, self: true })]));
    ownName.current = fetchAccount(accessToken)
      .then((account) => {
        if (active) setDocumentMissing(Boolean(account.user.documentMissing));
        return account.user.fullName;
      })
      .catch(() => '');
    void ownName.current.then((fullName) => {
      if (!active || !fullName) return;
      setAuthors((current) => current.map((row) => (row.self && !row.fullName ? { ...row, fullName } : row)));
    });
    return () => {
      active = false;
    };
  }, [accessToken, editing, auth.email]);

  const slug = event?.slug;
  const search = useCallback(
    (query: string) => (accessToken && slug ? searchPeople(accessToken, slug, query) : Promise.resolve([])),
    [accessToken, slug],
  );

  if (!auth.enabled) return <NotFoundPage />;
  if (!event) return null;
  // The session is still being read: say so, under the page's title (#324).
  if (auth.loading) return <PageLoading title={t(editing ? 'papers.editTitle' : 'papers.send')} />;
  if (!accessToken) {
    return <Navigate to={`/${event.slug}/conta/entrar?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  const rules = rulesForEvent(event.id);
  if (!rules) return <NotFoundPage />;
  const list = `/${event.slug}/meus-trabalhos`;
  if (!ready) return null;
  if (editing && !existing) {
    return (
      <>
        <PageHeader title={t('papers.editTitle')} />
        <section className="section">
          <div className="container papers">
            <p role="alert">{t('papers.errors.submission_not_found')}</p>
            <Link to={list}>{t('papers.title')}</Link>
          </div>
        </section>
      </>
    );
  }

  const limits = rules.modalities[modality];

  const submit = async (confirmDuplicate: boolean) => {
    setError(null);
    setDuplicate(null);
    if (!editing && !file) return setError(t('papers.errors.file_missing'));
    if (file && file.size > rules.maxFileMb * 1024 * 1024) {
      return setError(t('papers.errors.file_too_large', { maxMb: rules.maxFileMb }));
    }
    setBusy(true);
    const accountName = await ownName.current;
    const authorList = toAuthorInput(
      authors.map((row) => (row.self && !row.fullName.trim() ? { ...row, fullName: accountName } : row)),
    );
    // A name is missing: say so before the file goes anywhere.
    if (authorList.some((author) => author.fullName.length < 3)) {
      setBusy(false);
      return setError(t('papers.errors.invalid_author'));
    }
    // So is who an author is: the same check the server makes, with the person's name.
    for (const row of authors.filter((r) => asksDocument(r) && (r.fullName.trim() || r.email.trim() || r.ref))) {
      const problem = documentProblem(row.document);
      if (row.legacy && problem === 'document_required') continue;
      if (problem) {
        setBusy(false);
        return setError(t(`papers.errors.author_${problem}`, { name: row.fullName.trim() }));
      }
    }
    try {
      const uploaded = file
        ? { path: await uploadPaperFile(accessToken, event.slug, file), name: file.name }
        : null;
      await savePaper(
        accessToken,
        event.slug,
        i18n.language,
        {
          ...(existing ? { id: existing.id } : {}),
          title,
          titleEn,
          modality,
          areaRef,
          abstract,
          keywords,
          keywordsEn,
          authors: authorList,
          confirmDuplicate,
        },
        uploaded,
      );
      // An organiser who fixed someone's paper goes back to the panel, not to their own papers.
      navigate(existing?.asOrganiser ? `/${event.slug}/painel/trabalhos` : list, { replace: true });
    } catch (err) {
      if (err instanceof SubmissionError && err.code === 'duplicate_title') {
        setDuplicate(Number(err.details.number));
      } else {
        setError(
          t(`papers.errors.${err instanceof SubmissionError ? err.code : 'generic'}`, err instanceof SubmissionError ? err.details : {}),
        );
      }
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(false);
  };

  return (
    <>
      <PageHeader title={t(editing ? 'papers.editTitle' : 'papers.send')} />
      <section className="section">
        <div className="container papers">
          {documentMissing && (
            <div className="account__notice" role="status" data-testid="document-missing">
              <p>{t('papers.errors.document_required')}</p>
              <Link className="account__button" to={`/${event.slug}/minha-area#meus-dados`}>
                {t('papers.documentMissingCta')}
              </Link>
            </div>
          )}
          <form className="reg-form" style={{ maxWidth: 'none' }} onSubmit={onSubmit} noValidate>
            <div className="reg-form__field">
              <label htmlFor="paper-title">{t('papers.form.title')}</label>
              <input id="paper-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
            </div>
            <div className="reg-form__field">
              <label htmlFor="paper-title-en">{t('papers.form.titleEn')}</label>
              <input id="paper-title-en" type="text" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} maxLength={300} />
            </div>
            <div className="reg-form__row">
              <div className="reg-form__field">
                <label htmlFor="paper-modality">{t('papers.form.modality')}</label>
                <select id="paper-modality" value={modality} onChange={(e) => setModality(e.target.value as Modality)}>
                  <option value="RESUMO_EXPANDIDO">{t('papers.modalities.RESUMO_EXPANDIDO')}</option>
                  <option value="ARTIGO">{t('papers.modalities.ARTIGO')}</option>
                </select>
                <p className="reg-form__hint">{t('papers.form.pagesHint', { min: limits.minPages, max: limits.maxPages })}</p>
              </div>
              <div className="reg-form__field">
                <label htmlFor="paper-area">{t('papers.form.area')}</label>
                <select id="paper-area" value={areaRef} onChange={(e) => setAreaRef(e.target.value)}>
                  <option value="">{t('papers.form.areaChoose')}</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {l(a.name)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="reg-form__field">
              <label htmlFor="paper-abstract">{t('papers.form.abstract')}</label>
              <textarea id="paper-abstract" value={abstract} onChange={(e) => setAbstract(e.target.value)} maxLength={5000} />
            </div>
            <div className="reg-form__row">
              <div className="reg-form__field">
                <label htmlFor="paper-keywords">{t('papers.form.keywords')}</label>
                <input id="paper-keywords" type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
              </div>
              <div className="reg-form__field">
                <label htmlFor="paper-keywords-en">{t('papers.form.keywordsEn')}</label>
                <input id="paper-keywords-en" type="text" value={keywordsEn} onChange={(e) => setKeywordsEn(e.target.value)} />
              </div>
            </div>
            <p className="reg-form__hint">{t('papers.form.keywordsHint', { max: rules.maxKeywords })}</p>

            <AuthorList rows={authors} max={rules.maxAuthors} onChange={setAuthors} search={search} />

            {/* What the paper has now, in plain sight above the field that replaces it (#257). */}
            {existing && (
              <p className="papers__current-file" data-testid="current-file">
                {t('papers.form.fileCurrent', { name: existing.fileName })}
                {existing.filePages !== null && ` ${t('papers.pages', { count: existing.filePages })}.`}
              </p>
            )}
            <div className="reg-form__field">
              <label htmlFor="paper-file">{t(editing ? 'papers.form.fileReplace' : 'papers.form.file')}</label>
              <input
                id="paper-file"
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="reg-form__hint">{t('papers.form.fileHint', { maxMb: rules.maxFileMb })}</p>
            </div>

            {error && (
              <p className="reg-form__error reg-form__error--global" role="alert">
                {error}
              </p>
            )}
            {duplicate !== null && (
              <div className="account__notice" role="alert">
                <p>{t('papers.errors.duplicate_title', { number: duplicate })}</p>
                <div className="account__actions">
                  <button className="account__button" type="button" disabled={busy} onClick={() => void submit(true)}>
                    {t('papers.form.sendAnyway')}
                  </button>
                </div>
              </div>
            )}
            <button className="reg-form__submit" type="submit" disabled={busy || documentMissing}>
              {busy ? t('papers.form.sending') : t(editing ? 'papers.form.save' : 'papers.form.submit')}
            </button>
          </form>
          <p className="account__links">
            <Link to={list}>{t('papers.title')}</Link>
          </p>
        </div>
      </section>
    </>
  );
}
