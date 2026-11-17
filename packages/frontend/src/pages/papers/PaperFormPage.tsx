import type { ThematicArea } from '@sieamb/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/shared/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useEvent } from '../../contexts/EventContext';
import { useLocalized } from '../../hooks/useLocale';
import { getDataProvider } from '../../services';
import {
  SubmissionError,
  fetchMyPapers,
  rulesForEvent,
  savePaper,
  uploadPaperFile,
  type Modality,
  type Paper,
} from '../../services/submissions';
import { NotFoundPage } from '../NotFoundPage';
import '../../components/registration/RegistrationForm.css';
import '../account/Account.css';
import './Papers.css';

interface Coauthor {
  fullName: string;
  email: string;
}

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

  const [areas, setAreas] = useState<ThematicArea[]>([]);
  const [existing, setExisting] = useState<Paper | null>(null);
  const [ready, setReady] = useState(!editing);
  const [title, setTitle] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [modality, setModality] = useState<Modality>('RESUMO_EXPANDIDO');
  const [areaRef, setAreaRef] = useState('');
  const [abstract, setAbstract] = useState('');
  const [keywords, setKeywords] = useState('');
  const [keywordsEn, setKeywordsEn] = useState('');
  const [coauthors, setCoauthors] = useState<Coauthor[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!event) return;
    void getDataProvider().getThematicAreas(event.id).then(setAreas);
  }, [event]);

  useEffect(() => {
    if (!accessToken || !event || !paperId) return;
    let active = true;
    fetchMyPapers(accessToken, event.slug)
      .then((mine) => {
        if (!active) return;
        const paper = mine.submissions.find((p) => p.id === paperId && p.canEdit) ?? null;
        setExisting(paper);
        if (paper) {
          setTitle(paper.title);
          setTitleEn(paper.titleEn);
          setModality(paper.modality);
          setAreaRef(paper.areaRef);
          setAbstract(paper.abstract);
          setKeywords(paper.keywords.join('; '));
          setKeywordsEn(paper.keywordsEn.join('; '));
          setCoauthors(paper.authors.filter((a) => a.position > 1).map(({ fullName, email }) => ({ fullName, email })));
        }
        setReady(true);
      })
      .catch(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, [accessToken, event, paperId]);

  if (!auth.enabled) return <NotFoundPage />;
  if (auth.loading || !event) return null;
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
  const maxCoauthors = rules.maxAuthors - 1;

  const setCoauthor = (index: number, patch: Partial<Coauthor>) =>
    setCoauthors((current) => current.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  const submit = async (confirmDuplicate: boolean) => {
    setError(null);
    setDuplicate(null);
    if (!editing && !file) return setError(t('papers.errors.file_missing'));
    if (file && file.size > rules.maxFileMb * 1024 * 1024) {
      return setError(t('papers.errors.file_too_large', { maxMb: rules.maxFileMb }));
    }
    setBusy(true);
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
          coauthors: coauthors.filter((c) => c.fullName.trim() || c.email.trim()),
          confirmDuplicate,
        },
        uploaded,
      );
      navigate(list, { replace: true });
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

            <h2>{t('papers.form.coauthorsTitle')}</h2>
            <p className="reg-form__hint">{t('papers.form.coauthorsHint', { max: maxCoauthors })}</p>
            {coauthors.map((coauthor, index) => (
              <div className="papers__coauthor" key={index} data-testid="coauthor-row">
                <div className="reg-form__field">
                  <label htmlFor={`coauthor-name-${index}`}>{t('papers.form.coauthorName', { n: index + 1 })}</label>
                  <input
                    id={`coauthor-name-${index}`}
                    type="text"
                    value={coauthor.fullName}
                    onChange={(e) => setCoauthor(index, { fullName: e.target.value })}
                  />
                </div>
                <div className="reg-form__field">
                  <label htmlFor={`coauthor-email-${index}`}>{t('papers.form.coauthorEmail', { n: index + 1 })}</label>
                  <input
                    id={`coauthor-email-${index}`}
                    type="email"
                    value={coauthor.email}
                    onChange={(e) => setCoauthor(index, { email: e.target.value })}
                  />
                </div>
                <button
                  className="account__button account__button--quiet"
                  type="button"
                  onClick={() => setCoauthors((current) => current.filter((_, i) => i !== index))}
                >
                  {t('papers.form.coauthorRemove')}
                </button>
              </div>
            ))}
            {coauthors.length < maxCoauthors && (
              <p>
                <button
                  className="account__button account__button--quiet"
                  type="button"
                  onClick={() => setCoauthors((current) => [...current, { fullName: '', email: '' }])}
                >
                  {t('papers.form.coauthorAdd')}
                </button>
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
              <p className="reg-form__hint">
                {t('papers.form.fileHint', { maxMb: rules.maxFileMb })}
                {existing && ` ${t('papers.form.fileCurrent', { name: existing.fileName })}`}
              </p>
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
            <button className="reg-form__submit" type="submit" disabled={busy}>
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
