import { formatCpf, maskCpf } from '@sieamb/shared';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/shared/PageHeader';
import { PasswordInput } from '../../components/shared/PasswordInput';
import { Processing } from '../../components/shared/Processing';
import { useAuth } from '../../contexts/AuthContext';
import { useEvent } from '../../contexts/EventContext';
import { useLocale, useLocalized } from '../../hooks/useLocale';
import { useContent } from '../../hooks/useContent';
import {
  AUDIENCES,
  AdminError,
  addMember,
  assignReviewer,
  closeSubmissions,
  createPanelRegistration,
  decideRequest,
  deleteRegistration,
  fetchAnnouncements,
  fetchAudiences,
  fetchPanelMembers,
  sendPasswordLink,
  setAccountPassword,
  updateAccount,
  fetchPanelPapers,
  fetchPanelRegistrations,
  fetchPanelRequests,
  remindRegistration,
  remindRegistrations,
  removeMember,
  reopenSubmissions,
  restoreRegistration,
  sendAnnouncement,
  setRegistrationStatus,
  toCsv,
  unassignReviewer,
  type Audience,
  type ManualStatus,
  type MemberRole,
  type PanelMembers,
  type PanelPaper,
  type PanelPapers,
  type PanelRegistration,
  type PanelRegistrations,
  type PanelRequest,
  type SentAnnouncement,
} from '../../services/admin';
import { PASSWORD_MIN } from '../../services/account';
import { browser, paperFileUrl, withdrawPaper } from '../../services/submissions';
import { NotFoundPage } from '../NotFoundPage';
import '../../components/registration/RegistrationForm.css';
import '../account/Account.css';
import './Panel.css';
import { CountrySelect } from '../../components/shared/CountrySelect';
import { Loading, PageLoading } from '../../components/shared/Loading';

export type PanelTab = 'registrations' | 'papers' | 'people' | 'announcements' | 'requests';

const TABS: { tab: PanelTab; path: string; adminOnly?: boolean }[] = [
  { tab: 'registrations', path: '' },
  { tab: 'papers', path: '/trabalhos' },
  { tab: 'people', path: '/pessoas' },
  { tab: 'announcements', path: '/comunicados' },
  { tab: 'requests', path: '/pedidos', adminOnly: true },
];

const day = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeZone: 'America/Fortaleza' }).format(new Date(iso));
const money = (cents: number, locale: string) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(cents / 100);

interface TabProps {
  token: string;
  slug: string;
  /** Turns a failure into the text to show. */
  message: (err: unknown) => string;
}

function useLoad<T>(load: () => Promise<T>, message: (err: unknown) => string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await load());
      setError(null);
    } catch (err) {
      setError(message(err));
    }
  }, [load, message]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, setError, reload };
}

function Problem({ text }: { text: string | null }) {
  return text ? (
    <p className="reg-form__error reg-form__error--global" role="alert">
      {text}
    </p>
  ) : null;
}

// ───────────────────────────── Registrations ─────────────────────────────

function RegistrationActions({
  registration,
  onDone,
  token,
  slug,
  message,
}: TabProps & { registration: PanelRegistration; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'status' | 'delete' | null>(null);
  const [status, setStatus] = useState<ManualStatus | ''>(registration.manual?.status ?? 'CONFIRMED');
  const [reason, setReason] = useState('');
  const [confirmPaid, setConfirmPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      setMode(null);
      setReason('');
      await onDone();
    } catch (err) {
      setError(message(err));
    }
    setBusy(false);
  };

  if (registration.deleted) {
    return (
      <>
        <button className="account__button account__button--quiet" type="button" disabled={busy} onClick={() => void run(() => restoreRegistration(token, slug, registration.id))}>
          {t('panel.registrations.restore')}
        </button>
        <Processing when={busy} />
        <Problem text={error} />
      </>
    );
  }
  if (!mode) {
    return (
      <span className="panel__row-actions">
        <button className="account__button account__button--quiet" type="button" onClick={() => setMode('status')}>
          {t('panel.registrations.changeStatus')}
        </button>
        <button className="account__button account__button--quiet" type="button" onClick={() => setMode('delete')}>
          {t('panel.registrations.delete')}
        </button>
      </span>
    );
  }
  const id = `reason-${registration.id}`;
  return (
    <form
      className="panel__inline"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void run(() =>
          mode === 'status'
            ? setRegistrationStatus(token, slug, registration.id, status || null, reason)
            : deleteRegistration(token, slug, registration.id, reason, confirmPaid),
        );
      }}
    >
      {mode === 'status' && (
        <label>
          {t('panel.registrations.newStatus')}
          <select value={status} onChange={(e) => setStatus(e.target.value as ManualStatus | '')}>
            <option value="CONFIRMED">{t('panel.states.CONFIRMED')}</option>
            <option value="EXEMPT">{t('panel.states.EXEMPT')}</option>
            <option value="CANCELLED">{t('panel.states.CANCELLED')}</option>
            <option value="">{t('panel.registrations.followPayment')}</option>
          </select>
        </label>
      )}
      <label htmlFor={id}>{t('panel.registrations.reason')}</label>
      <input id={id} type="text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      {mode === 'delete' && registration.payment === 'PAID' && (
        <label className="reg-form__check">
          <input type="checkbox" checked={confirmPaid} onChange={(e) => setConfirmPaid(e.target.checked)} />
          <span>{t('panel.registrations.confirmPaid')}</span>
        </label>
      )}
      <Problem text={error} />
      <span className="panel__row-actions">
        <button className="account__button" type="submit" disabled={busy}>
          {t(mode === 'status' ? 'common.save' : 'panel.registrations.deleteYes')}
        </button>
        <button className="account__button account__button--quiet" type="button" onClick={() => setMode(null)}>
          {t('common.cancel')}
        </button>
        <Processing when={busy} />
      </span>
    </form>
  );
}

/** Owes the fee and nothing was decided by hand: the only ones a reminder makes sense for. */
const owes = (r: PanelRegistration): boolean => !r.deleted && !r.manual && (r.state === 'UNPAID' || r.state === 'PENDING');

function RemindButton({ registration, token, slug, message }: TabProps & { registration: PanelRegistration }) {
  const { t } = useTranslation();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!owes(registration)) return null;
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const { outcome } = await remindRegistration(token, slug, registration.id);
      setNote(t(`panel.reminders.outcome.${outcome}`));
    } catch (err) {
      setError(message(err));
    }
    setBusy(false);
  };
  return (
    <>
      {!note && (
        <button className="account__button account__button--quiet" type="button" disabled={busy} onClick={() => void send()}>
          {t('panel.reminders.send')}
        </button>
      )}
      <Processing when={busy} />
      {note && (
        <span className="panel__meta" role="status">
          {note}
        </span>
      )}
      <Problem text={error} />
    </>
  );
}

function NewRegistration({ token, slug, message, onDone }: TabProps & { onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [passport, setPassport] = useState('');
  const [country, setCountry] = useState('');
  const [institution, setInstitution] = useState('');
  const [category, setCategory] = useState('ESTUDANTE_POS');
  const [manualStatus, setManualStatus] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <p>
        <button className="account__button" type="button" onClick={() => setOpen(true)}>
          {t('panel.registrations.new')}
        </button>
      </p>
    );
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createPanelRegistration(token, slug, { fullName, email, cpf, passport, country, institution, category, manualStatus: manualStatus || undefined, reason });
      setOpen(false);
      setFullName('');
      setEmail('');
      setCpf('');
      setPassport('');
      setReason('');
      await onDone();
    } catch (err) {
      setError(message(err));
    }
    setBusy(false);
  };
  return (
    <form className="reg-form account__card" onSubmit={(e) => void submit(e)} noValidate data-testid="new-registration">
      <h3>{t('panel.registrations.new')}</h3>
      <div className="reg-form__field">
        <label htmlFor="new-name">{t('registration.fullName')}</label>
        <input id="new-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div className="reg-form__field">
        <label htmlFor="new-email">{t('account.email')}</label>
        <input id="new-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="reg-form__row">
        <div className="reg-form__field">
          <label htmlFor="new-cpf">{t('registration.cpf')}</label>
          <input id="new-cpf" type="text" inputMode="numeric" value={cpf} onChange={(e) => setCpf(maskCpf(e.target.value))} />
        </div>
        <div className="reg-form__field">
          <label htmlFor="new-passport">{t('registration.passport')}</label>
          <input id="new-passport" type="text" value={passport} onChange={(e) => setPassport(e.target.value)} />
        </div>
      </div>
      {/* A passport goes with the country that issued it, chosen from a list (ADR-010); a CPF may be given as well. */}
      {passport.trim() && (
        <div className="reg-form__field">
          <label htmlFor="new-country">{t('account.area.country')}</label>
          <CountrySelect id="new-country" value={country} onChange={setCountry} />
        </div>
      )}
      <div className="reg-form__field">
        <label htmlFor="new-institution">{t('registration.institution')}</label>
        <input id="new-institution" type="text" value={institution} onChange={(e) => setInstitution(e.target.value)} />
      </div>
      <div className="reg-form__row">
        <div className="reg-form__field">
          <label htmlFor="new-category">{t('registration.category')}</label>
          <select id="new-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {['ESTUDANTE_GRADUACAO', 'ESTUDANTE_POS', 'PROFISSIONAL'].map((c) => (
              <option key={c} value={c}>
                {t(`registration.categories.${c}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="reg-form__field">
          <label htmlFor="new-status">{t('panel.registrations.newStatus')}</label>
          <select id="new-status" value={manualStatus} onChange={(e) => setManualStatus(e.target.value)}>
            <option value="">{t('panel.registrations.followPayment')}</option>
            <option value="CONFIRMED">{t('panel.states.CONFIRMED')}</option>
            <option value="EXEMPT">{t('panel.states.EXEMPT')}</option>
          </select>
        </div>
      </div>
      {manualStatus && (
        <div className="reg-form__field">
          <label htmlFor="new-reason">{t('panel.registrations.reason')}</label>
          <input id="new-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      )}
      <p className="reg-form__hint">{t('panel.registrations.newHint')}</p>
      <Problem text={error} />
      <span className="panel__row-actions">
        <button className="reg-form__submit" type="submit" disabled={busy}>
          {t('panel.registrations.create')}
        </button>
        <button className="account__button account__button--quiet" type="button" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </button>
        <Processing when={busy} />
      </span>
    </form>
  );
}

function RegistrationsTab(props: TabProps) {
  const { token, slug, message } = props;
  const { t } = useTranslation();
  const locale = useLocale();
  const load = useCallback(() => fetchPanelRegistrations(token, slug), [token, slug]);
  const { data, error, reload } = useLoad<PanelRegistrations>(load, message);
  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [bulk, setBulk] = useState<'idle' | 'confirm' | 'busy'>('idle');
  const [bulkNote, setBulkNote] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  if (!data) return error ? <Problem text={error} /> : <Loading />;
  const admin = data.role === 'ADMIN';
  const needle = search.trim().toLowerCase();
  const rows = data.registrations.filter(
    (r) =>
      (showDeleted ? Boolean(r.deleted) : !r.deleted) &&
      (!state || r.state === state) &&
      (!needle || `${r.fullName} ${r.email} ${r.institution ?? ''}`.toLowerCase().includes(needle)),
  );

  // The reminder goes to who still owes the fee among the rows on screen.
  const owing = rows.filter(owes);
  const remindAll = async () => {
    setBulk('busy');
    setBulkError(null);
    try {
      const result = await remindRegistrations(token, slug, owing.map((r) => r.id));
      setBulkNote(t('panel.reminders.bulkDone', result));
    } catch (err) {
      setBulkError(message(err));
    }
    setBulk('idle');
  };

  const download = () => {
    const header = [
      t('registration.fullName'),
      t('account.email'),
      ...(admin ? [t('registration.cpf'), t('registration.passport')] : []),
      t('registration.institution'),
      t('registration.category'),
      t('panel.registrations.state'),
      t('panel.registrations.payment'),
      t('panel.registrations.paid'),
      t('panel.registrations.date'),
      t('panel.registrations.reason'),
    ];
    const lines = rows.map((r) => [
      r.fullName,
      r.email,
      ...(admin ? [r.cpf ? formatCpf(r.cpf) : '', r.passport ? `${r.passport} (${r.country ?? ''})` : ''] : []),
      r.institution,
      t(`registration.categories.${r.category}`, { defaultValue: r.category }),
      t(`panel.states.${r.state}`),
      t(`panel.states.${r.payment}`),
      r.paidCents !== null ? (r.paidCents / 100).toFixed(2).replace('.', ',') : '',
      day(r.createdAt, locale),
      r.manual?.reason ?? r.deleted?.reason ?? '',
    ]);
    const blob = new Blob([toCsv([header, ...lines])], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inscricoes-${slug}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <p data-testid="panel-counts">{t('panel.registrations.counts', data.counts)}</p>
      {admin && <NewRegistration {...props} onDone={reload} />}
      <div className="panel__filters">
        <label>
          {t('panel.search')}
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          {t('panel.registrations.state')}
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">{t('panel.all')}</option>
            {['PAID', 'CONFIRMED', 'EXEMPT', 'PENDING', 'UNPAID', 'CANCELLED'].map((s) => (
              <option key={s} value={s}>
                {t(`panel.states.${s}`)}
              </option>
            ))}
          </select>
        </label>
        {admin && (
          <label className="reg-form__check">
            <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
            <span>{t('panel.registrations.showDeleted', { count: data.counts.deleted })}</span>
          </label>
        )}
        <button className="account__button account__button--quiet" type="button" onClick={download}>
          {t('panel.download')}
        </button>
        {owing.length > 0 && bulk === 'idle' && (
          <button className="account__button account__button--quiet" type="button" onClick={() => { setBulkNote(null); setBulk('confirm'); }}>
            {t('panel.reminders.sendAll', { count: owing.length })}
          </button>
        )}
      </div>
      {bulk !== 'idle' && (
        <div className="account__notice" role="alert">
          <p>{t('panel.reminders.confirm', { count: owing.length })}</p>
          <span className="panel__row-actions">
            <button className="account__button" type="button" disabled={bulk === 'busy'} onClick={() => void remindAll()}>
              {t('panel.reminders.sendAllYes', { count: owing.length })}
            </button>
            <button className="account__button account__button--quiet" type="button" onClick={() => setBulk('idle')}>
              {t('common.cancel')}
            </button>
            <Processing when={bulk === 'busy'} />
          </span>
        </div>
      )}
      {bulkNote && (
        <p className="account__notice account__notice--ok" role="status">
          {bulkNote}
        </p>
      )}
      <Problem text={bulkError} />
      <Problem text={error} />
      <div className="panel__table">
        <table>
          <thead>
            <tr>
              <th>{t('registration.fullName')}</th>
              <th>{t('panel.registrations.state')}</th>
              <th>{t('panel.registrations.payment')}</th>
              <th>{t('panel.registrations.date')}</th>
              <th>{t('panel.tabs.papers')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid="registration-row">
                <td>
                  <strong>{r.fullName}</strong>
                  <br />
                  {r.email}
                  <br />
                  <span className="panel__meta">
                    {t(`registration.categories.${r.category}`, { defaultValue: r.category })}
                    {r.institution && ` · ${r.institution}`}
                    {admin && r.cpf && ` · CPF ${formatCpf(r.cpf)}`}
                    {admin && r.passport && ` · ${r.passport} (${r.country ?? ''})`}
                    {r.byOrganiser && ` · ${t('panel.registrations.byOrganiser')}`}
                    {r.hasAccount && ` · ${t('panel.registrations.hasAccount')}`}
                  </span>
                </td>
                <td>
                  <span className={`account__state account__state--${['PAID', 'CONFIRMED', 'EXEMPT'].includes(r.state) ? 'PAID' : 'PENDING'}`}>
                    {t(`panel.states.${r.state}`)}
                  </span>
                  {r.manual && (
                    <span className="panel__meta">
                      <br />
                      {t('panel.registrations.manualNote', { reason: r.manual.reason ?? '', date: r.manual.at ? day(r.manual.at, locale) : '' })}
                    </span>
                  )}
                  {r.deleted && (
                    <span className="panel__meta">
                      <br />
                      {t('panel.registrations.deletedNote', { reason: r.deleted.reason ?? '', date: day(r.deleted.at, locale) })}
                    </span>
                  )}
                </td>
                <td>
                  {t(`panel.states.${r.payment}`)}
                  {r.paidCents !== null && ` · ${money(r.paidCents, locale)}`}
                </td>
                <td>{day(r.createdAt, locale)}</td>
                <td>
                  {r.papers ? (
                    <Link to={`/${slug}/painel/trabalhos?autor=${encodeURIComponent(r.email)}`}>
                      {t('papers.count', { count: r.papers })}
                    </Link>
                  ) : (
                    <span className="panel__meta">{t('panel.registrations.noPapers')}</span>
                  )}
                </td>
                <td>
                  <RemindButton {...props} registration={r} />
                  {admin && <RegistrationActions {...props} registration={r} onDone={reload} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p>{t('panel.empty')}</p>}
    </>
  );
}

// ───────────────────────────── Papers ─────────────────────────────

/** The organisers change or withdraw any paper (#250). Withdrawing asks once more. */
function PaperActions({ paper, slug, onWithdraw }: { paper: PanelPaper; slug: string; onWithdraw: () => Promise<void> }) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!confirming) {
    return (
      <>
        <Link to={`/${slug}/meus-trabalhos/${paper.id}`} aria-label={t('panel.papers.editFor', { number: paper.number })}>
          {t('papers.edit')}
        </Link>{' '}
        <button
          className="account__button account__button--quiet"
          type="button"
          aria-label={t('panel.papers.withdrawFor', { number: paper.number })}
          onClick={() => setConfirming(true)}
        >
          {t('panel.papers.withdraw')}
        </button>
      </>
    );
  }
  return (
    <>
      <span>{t('panel.papers.withdrawConfirm', { number: paper.number })}</span>{' '}
      <button
        className="account__button"
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void onWithdraw().finally(() => {
            setBusy(false);
            setConfirming(false);
          });
        }}
      >
        {t('papers.withdrawYes')}
      </button>{' '}
      <button className="account__button account__button--quiet" type="button" onClick={() => setConfirming(false)}>
        {t('common.cancel')}
      </button>
      <Processing when={busy} />
    </>
  );
}

/** Who reviews one paper, and the way to choose more or take one off (#232). */
function PaperReviewers({
  paper,
  candidates,
  onAssign,
  onUnassign,
}: {
  paper: PanelPaper;
  candidates: PanelMembers['members'];
  onAssign: (userId: string) => Promise<void>;
  onUnassign: (userId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    await action();
    setBusy(false);
  };
  // Not someone already on the paper, and never one of its authors.
  const free = candidates.filter(
    (c) =>
      !paper.reviewers.some((r) => r.userId === c.userId) &&
      !paper.authors.some((a) => a.email === c.email.toLowerCase()),
  );
  return (
    <>
      {paper.reviewers.length === 0 && <span className="panel__meta">{t('panel.papers.noReviewer')}</span>}
      {paper.reviewers.map((r) => (
        <span key={r.userId}>
          {r.fullName || r.email}
          {!paper.deletedAt && (
            <>
              {' '}
              <button
                className="account__button account__button--quiet"
                type="button"
                disabled={busy}
                aria-label={t('panel.papers.removeReviewer', { name: r.fullName || r.email, number: paper.number })}
                onClick={() => void run(() => onUnassign(r.userId))}
              >
                ×
              </button>
            </>
          )}
          <br />
        </span>
      ))}
      {!paper.deletedAt && free.length > 0 && (
        <span className="panel__assign">
          <select
            aria-label={t('panel.papers.chooseReviewer', { number: paper.number })}
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
          >
            <option value="">{t('panel.papers.choose')}</option>
            {free.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.fullName || c.email}
              </option>
            ))}
          </select>{' '}
          <button
            className="account__button account__button--quiet"
            type="button"
            disabled={busy || !chosen}
            aria-label={t('panel.papers.assignFor', { number: paper.number })}
            onClick={() =>
              void run(async () => {
                await onAssign(chosen);
                setChosen('');
              })
            }
          >
            {t('panel.papers.assign')}
          </button>
        </span>
      )}
      <Processing when={busy} />
      {/* The picker is hidden when nobody can be chosen: say why, so it does not read as a fault (#266). */}
      {!paper.deletedAt && free.length === 0 && candidates.length > 0 && (
        <span className="panel__meta" data-testid="no-reviewer-to-choose">
          {paper.reviewers.length > 0 && <br />}
          {t(paper.reviewers.length > 0 ? 'panel.papers.noOtherReviewer' : 'panel.papers.reviewersAreAuthors')}
        </span>
      )}
    </>
  );
}

/** The organisers' switch: close submissions, or reopen them (#236). Closing asks once more. */
function SubmissionsSwitch({
  closed,
  onClose,
  onReopen,
}: {
  closed: PanelPapers['closed'];
  onClose: () => Promise<void>;
  onReopen: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    await action();
    setBusy(false);
    setConfirming(false);
  };
  return (
    <div className="account__notice" data-testid="submissions-switch">
      <p>
        {closed
          ? t('panel.papers.window.closed', { date: day(closed.closedAt, locale), name: closed.closedBy })
          : t('panel.papers.window.open')}
      </p>
      <div className="account__actions">
        {closed && (
          <button className="account__button" type="button" disabled={busy} onClick={() => void run(onReopen)}>
            {t('panel.papers.window.reopen')}
          </button>
        )}
        {!closed && !confirming && (
          <button className="account__button account__button--quiet" type="button" onClick={() => setConfirming(true)}>
            {t('panel.papers.window.close')}
          </button>
        )}
        {!closed && confirming && (
          <>
            <span>{t('panel.papers.window.closeConfirm')}</span>
            <button className="account__button" type="button" disabled={busy} onClick={() => void run(onClose)}>
              {t('panel.papers.window.closeYes')}
            </button>
            <button className="account__button account__button--quiet" type="button" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </button>
          </>
        )}
        <Processing when={busy} />
      </div>
    </div>
  );
}

function PapersTab({ token, slug, message }: TabProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const l = useLocalized();
  const { event } = useEvent();
  const load = useCallback(() => fetchPanelPapers(token, slug), [token, slug]);
  const { data, error, setError, reload } = useLoad<PanelPapers>(load, message);
  // Who can be chosen to review: the people with the Avaliador role in the edition (#232).
  const loadMembers = useCallback(() => fetchPanelMembers(token, slug), [token, slug]);
  const { data: people } = useLoad<PanelMembers>(loadMembers, message);
  const areas = useContent('getThematicAreas', event?.id) ?? [];
  // `?autor=<e-mail>` comes from the registrations list: the papers of that one person (#225).
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get('autor') ?? '');

  if (!data) return error ? <Problem text={error} /> : <Loading />;
  const needle = search.trim().toLowerCase();
  const rows = data.submissions.filter(
    (s) => !needle || `${s.number} ${s.title} ${s.authors.map((a) => `${a.fullName} ${a.email}`).join(' ')}`.toLowerCase().includes(needle),
  );
  const open = async (id: string) => {
    try {
      browser.open(await paperFileUrl(token, id));
    } catch (err) {
      setError(message(err));
    }
  };
  const reviewers = [...new Map((people?.members ?? []).filter((m) => m.role === 'REVIEWER').map((m) => [m.userId, m])).values()];
  const change = async (action: () => Promise<unknown>) => {
    try {
      await action();
      await reload();
    } catch (err) {
      setError(message(err));
    }
  };
  return (
    <>
      <p data-testid="panel-counts">{t('panel.papers.counts', data.counts)}</p>
      <SubmissionsSwitch
        closed={data.closed ?? null}
        onClose={() => change(() => closeSubmissions(token, slug))}
        onReopen={() => change(() => reopenSubmissions(token, slug))}
      />
      {/* One document under more than one address (ADR-010): sent to administrators only. */}
      {(data.sameDocument ?? []).length > 0 && (
        <div className="account__notice" role="status" data-testid="same-document">
          <h3>{t('panel.papers.sameDocumentTitle')}</h3>
          <p>{t('panel.papers.sameDocumentBody')}</p>
          <ul>
            {data.sameDocument!.map((group) => (
              <li key={`${group.cpf ?? ''}|${group.country ?? ''}|${group.passport ?? ''}`}>
                <strong>{group.cpf ? `CPF ${formatCpf(group.cpf)}` : `${group.passport ?? ''} (${group.country ?? ''})`}</strong>
                {': '}
                {group.lines
                  .map((line) => `${line.fullName} (${line.email}, ${line.papers.length ? t('panel.papers.sameDocumentPapers', { numbers: line.papers.join(', ') }) : t('panel.papers.sameDocumentAccount')})`)
                  .join('; ')}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="panel__meta">{t('panel.papers.reviewersHint')}</p>
      {people && reviewers.length === 0 && (
        <p className="account__notice" data-testid="no-reviewers">
          {t('panel.papers.noReviewers')} <Link to={`/${slug}/painel/pessoas`}>{t('panel.tabs.people')}</Link>
        </p>
      )}
      <div className="panel__filters">
        <label>
          {t('panel.search')}
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>
      <Problem text={error} />
      <div className="panel__table">
        <table>
          <thead>
            <tr>
              <th>{t('panel.papers.number')}</th>
              <th>{t('panel.papers.paper')}</th>
              <th>{t('panel.papers.authors')}</th>
              <th>{t('panel.registrations.state')}</th>
              <th>{t('panel.papers.reviewers')}</th>
              <th>{t('panel.papers.file')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} data-testid="paper-row">
                <td>{s.number}</td>
                <td>
                  <strong>{s.title}</strong>
                  <br />
                  <span className="panel__meta">
                    {t(`papers.modalities.${s.modality}`, { defaultValue: s.modality })} ·{' '}
                    {(() => {
                      const area = areas.find((a) => a.id === s.areaRef);
                      return area ? l(area.name) : s.areaRef;
                    })()}{' '}
                    · {day(s.createdAt, locale)}
                  </span>
                </td>
                <td>
                  {s.authors.map((a) => (
                    <span key={a.position}>
                      {a.fullName} <span className="panel__meta">({a.email})</span>{' '}
                      {/* Who the author is (ADR-010): the server sends it to administrators only. */}
                      {(a.cpf || a.passport) && (
                        <span className="panel__meta" data-testid="author-document">
                          {[a.cpf ? `CPF ${formatCpf(a.cpf)}` : null, a.passport ? `${a.passport} (${a.country ?? ''})` : null].filter(Boolean).join(' · ')}{' '}
                        </span>
                      )}
                      <span className="panel__meta" data-testid="author-registration">
                        {a.registration ? t(`panel.states.${a.registration}`) : t('panel.papers.notRegistered')}
                      </span>
                      <br />
                    </span>
                  ))}
                  <span className="panel__meta">
                    {t(s.authorRegistered ? 'panel.papers.authorRegistered' : 'panel.papers.noAuthorRegistered')}
                  </span>
                </td>
                <td>{s.deletedAt ? t('panel.papers.withdrawn') : t(`papers.status.${s.status}`, { defaultValue: s.status })}</td>
                <td data-testid="paper-reviewers">
                  <PaperReviewers
                    paper={s}
                    candidates={reviewers}
                    onAssign={(userId) => change(() => assignReviewer(token, slug, s.id, userId))}
                    onUnassign={(userId) => change(() => unassignReviewer(token, slug, s.id, userId))}
                  />
                </td>
                <td>
                  <button className="account__button account__button--quiet" type="button" onClick={() => void open(s.id)}>
                    {s.fileName}
                  </button>
                  {s.filePages !== null && <span className="panel__meta"> · {t('papers.pages', { count: s.filePages })}</span>}
                </td>
                <td>
                  {/* Changing or withdrawing someone's paper is for administrators (#265). */}
                  {!s.deletedAt && data.role === 'ADMIN' && (
                    <PaperActions
                      paper={s}
                      slug={slug}
                      onWithdraw={() => change(() => withdrawPaper(token, slug, s.id))}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p>{t('panel.empty')}</p>}
    </>
  );
}

// ───────────────────────────── People and roles ─────────────────────────────

type PanelAccount = PanelMembers['accounts'][number];

/** One account of the list: its roles, and what the person looking may do about it (#268, #269, #270). */
function AccountRow({
  account,
  canManage,
  owner,
  busy,
  processing,
  onGive,
  onTake,
  onSave,
  onPasswordLink,
  onPasswordSet,
}: {
  account: PanelAccount;
  canManage: MemberRole[];
  /** The person looking is the owner: e-mail, CPF and a typed password are theirs alone (#272). */
  owner: boolean;
  /** Something is being processed somewhere in the list: nothing else can be started. */
  busy: boolean;
  /** It is this line that is being processed. */
  processing: boolean;
  onGive: (role: MemberRole) => void;
  onTake: (role: MemberRole) => void;
  onSave: (data: { fullName: string; institution: string; email?: string; cpf?: string; passport?: string; country?: string }) => Promise<boolean>;
  onPasswordLink: () => void;
  onPasswordSet: (password: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'view' | 'edit' | 'password' | 'set-password'>('view');
  const [email, setEmail] = useState(account.email);
  const [cpf, setCpf] = useState(account.cpf ? formatCpf(account.cpf) : '');
  const [passport, setPassport] = useState(account.passport ?? '');
  const [country, setCountry] = useState(account.country ?? '');
  const [password, setPassword] = useState('');
  const [chosen, setChosen] = useState<MemberRole | ''>('');
  const [fullName, setFullName] = useState(account.fullName);
  const [institution, setInstitution] = useState(account.institution ?? '');
  const name = account.fullName || account.email;
  const free = canManage.filter((r) => !account.roles.includes(r));
  const startEdit = () => {
    setFullName(account.fullName);
    setInstitution(account.institution ?? '');
    setEmail(account.email);
    setCpf(account.cpf ? formatCpf(account.cpf) : '');
    setPassport(account.passport ?? '');
    setCountry(account.country ?? '');
    setMode('edit');
  };
  return (
    <tr data-testid="account-row" aria-busy={processing}>
      <td>
        {mode === 'edit' ? (
          <form
            className="panel__edit"
            onSubmit={(e) => {
              e.preventDefault();
              void onSave({
                fullName: fullName.trim(),
                institution: institution.trim(),
                // An empty CPF or passport takes it off the account; a passport goes with its country.
                ...(owner ? { email: email.trim(), cpf: cpf.trim(), passport: passport.trim(), ...(passport.trim() ? { country } : {}) } : {}),
              }).then((ok) => ok && setMode('view'));
            }}
          >
            <label>
              {t('registration.fullName')}
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={150} />
            </label>
            <label>
              {t('registration.institution')}
              <input value={institution} onChange={(e) => setInstitution(e.target.value)} maxLength={200} />
            </label>
            {owner ? (
              <>
                <label>
                  {t('account.email')}
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
                </label>
                <label>
                  {t('registration.cpf')}
                  <input value={cpf} onChange={(e) => setCpf(maskCpf(e.target.value))} inputMode="numeric" maxLength={14} placeholder="000.000.000-00" />
                </label>
                <label>
                  {t('registration.passport')}
                  <input
                    value={passport}
                    onChange={(e) => {
                      setPassport(e.target.value);
                      if (!e.target.value.trim()) setCountry('');
                    }}
                    maxLength={30}
                    autoCapitalize="characters"
                  />
                </label>
                {passport.trim() && (
                  <label>
                    {t('account.area.country')}
                    <CountrySelect value={country} onChange={setCountry} />
                  </label>
                )}
                <span className="panel__meta">{t('panel.people.ownerFieldsHint')}</span>
              </>
            ) : (
              <span className="panel__meta">{account.email}</span>
            )}
            <span>
              <button className="account__button" type="submit" disabled={busy || fullName.trim().length < 3 || (owner && (!email.trim() || ![0, 11].includes(cpf.replace(/\D/g, '').length) || (passport.trim() !== '' && !country)))}>
                {t('common.save')}
              </button>{' '}
              <button className="account__button account__button--quiet" type="button" onClick={() => setMode('view')}>
                {t('common.cancel')}
              </button>
            </span>
          </form>
        ) : (
          <>
            <strong>{name}</strong>
            <br />
            <span className="panel__meta">
              {account.email}
              {account.institution ? ` · ${account.institution}` : ''}
            </span>
          </>
        )}
      </td>
      <td data-testid="account-roles">
        {account.owner && (
          <span className="panel__role">
            {t('panel.people.owner')}
            <br />
          </span>
        )}
        {account.roles.length === 0 && !account.owner && <span className="panel__meta">{t('panel.people.noRole')}</span>}
        {account.roles.map((r) => (
          <span key={r} className="panel__role">
            {t(`panel.roles.${r}`)}
            {canManage.includes(r) && (
              <>
                {' '}
                <button
                  className="account__button account__button--quiet"
                  type="button"
                  disabled={busy}
                  aria-label={t('panel.people.takeFor', { role: t(`panel.roles.${r}`), name })}
                  onClick={() => onTake(r)}
                >
                  ×
                </button>
              </>
            )}
            <br />
          </span>
        ))}
      </td>
      <td>
        {free.length > 0 && (
          <span className="panel__assign">
            <select aria-label={t('panel.people.chooseFor', { name })} value={chosen} onChange={(e) => setChosen(e.target.value as MemberRole | '')}>
              <option value="">{t('panel.papers.choose')}</option>
              {free.map((r) => (
                <option key={r} value={r}>
                  {t(`panel.roles.${r}`)}
                </option>
              ))}
            </select>{' '}
            <button
              className="account__button account__button--quiet"
              type="button"
              disabled={busy || !chosen}
              aria-label={t('panel.people.giveFor', { name })}
              onClick={() => {
                if (chosen) onGive(chosen);
                setChosen('');
              }}
            >
              {t('panel.people.give')}
            </button>
          </span>
        )}
      </td>
      <td>
        <Processing when={processing} />
        {account.canEdit && mode === 'view' && (
          <>
            <button
              className="account__button account__button--quiet"
              type="button"
              aria-label={t('panel.people.editFor', { name })}
              onClick={startEdit}
            >
              {t('panel.people.edit')}
            </button>{' '}
            <button
              className="account__button account__button--quiet"
              type="button"
              aria-label={t('panel.people.passwordLinkFor', { name })}
              onClick={() => setMode('password')}
            >
              {t('panel.people.passwordLink')}
            </button>
            {owner && (
              <>
                {' '}
                <button
                  className="account__button account__button--quiet"
                  type="button"
                  aria-label={t('panel.people.passwordSetFor', { name })}
                  onClick={() => {
                    setPassword('');
                    setMode('set-password');
                  }}
                >
                  {t('panel.people.passwordSet')}
                </button>
              </>
            )}
          </>
        )}
        {mode === 'set-password' && (
          <form
            className="panel__edit"
            onSubmit={(e) => {
              e.preventDefault();
              void onPasswordSet(password).then((ok) => {
                if (ok) {
                  setPassword('');
                  setMode('view');
                }
              });
            }}
          >
            <label htmlFor={`set-password-${account.userId}`}>{t('panel.people.passwordNew', { name })}</label>
            <PasswordInput
              id={`set-password-${account.userId}`}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="panel__meta">{t('panel.people.passwordSetHint', { min: PASSWORD_MIN })}</span>
            <span>
              <button className="account__button" type="submit" disabled={busy || password.length < PASSWORD_MIN}>
                {t('panel.people.passwordSetSave')}
              </button>{' '}
              <button className="account__button account__button--quiet" type="button" onClick={() => setMode('view')}>
                {t('common.cancel')}
              </button>
            </span>
          </form>
        )}
        {mode === 'password' && (
          <>
            <span>{t('panel.people.passwordLinkConfirm', { email: account.email })}</span>{' '}
            <button
              className="account__button"
              type="button"
              disabled={busy}
              onClick={() => {
                onPasswordLink();
                setMode('view');
              }}
            >
              {t('panel.people.passwordLinkYes')}
            </button>{' '}
            <button className="account__button account__button--quiet" type="button" onClick={() => setMode('view')}>
              {t('common.cancel')}
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

function PeopleTab({ token, slug, message }: TabProps) {
  const { t } = useTranslation();
  const load = useCallback(() => fetchPanelMembers(token, slug), [token, slug]);
  const { data, error, setError, reload } = useLoad<PanelMembers>(load, message);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('REVIEWER');
  const [note, setNote] = useState<string | null>(null);
  // Which line is being processed: an account id, `invite:<e-mail>:<role>`, or `form` (#278).
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busy = busyKey !== null;
  const [search, setSearch] = useState('');

  if (!data) return error ? <Problem text={error} /> : <Loading />;

  const run = async (key: string, work: () => Promise<string | null>): Promise<boolean> => {
    setBusyKey(key);
    setError(null);
    setNote(null);
    let ok = true;
    try {
      setNote(await work());
      await reload();
    } catch (err) {
      setError(message(err));
      ok = false;
    }
    setBusyKey(null);
    return ok;
  };
  const give = (key: string, to: string, what: MemberRole) =>
    run(key, async () => {
      const { invited } = await addMember(token, slug, to, what);
      return t(invited ? 'panel.people.invited' : 'panel.people.added');
    });
  const add = (e: FormEvent) => {
    e.preventDefault();
    void give('form', email.trim(), role).then((ok) => ok && setEmail(''));
  };
  // An organiser is not shown the administrators (#264); the server does not send them either.
  const roles = (['ADMIN', 'ORGANIZER', 'REVIEWER'] as MemberRole[]).filter((r) => r !== 'ADMIN' || data.role === 'ADMIN');
  const needle = search.trim().toLowerCase();
  const accounts = data.accounts.filter((a) => !needle || `${a.fullName} ${a.email} ${a.institution ?? ''}`.toLowerCase().includes(needle));

  return (
    <>
      <form className="panel__filters" onSubmit={add}>
        <label>
          {t('account.email')}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          {t('panel.people.role')}
          <select
            data-testid="invite-role"
            value={data.canManage.includes(role) ? role : data.canManage[0]}
            onChange={(e) => setRole(e.target.value as MemberRole)}
          >
            {data.canManage.map((r) => (
              <option key={r} value={r}>
                {t(`panel.roles.${r}`)}
              </option>
            ))}
          </select>
        </label>
        <button className="account__button" type="submit" disabled={busy || !email.trim()}>
          {t('panel.people.add')}
        </button>
        <Processing when={busyKey === 'form'} />
      </form>
      <p className="reg-form__hint">{t('panel.people.hint')}</p>
      <ul className="panel__meta" data-testid="role-legend">
        {roles.map((r) => (
          <li key={r}>
            <strong>{t(`panel.roles.${r}`)}</strong>: {t(`panel.roleDescription.${r}`)}
          </li>
        ))}
      </ul>
      <Problem text={error} />
      {note && (
        <p className="account__notice account__notice--ok" role="status">
          {note}
        </p>
      )}
      {data.invites.length > 0 && (
        <section data-testid="pending-invites">
          <h3>{t('panel.people.pending')}</h3>
          <ul className="panel__people">
            {data.invites.map((i) => (
              <li key={`${i.email}:${i.role}`}>
                {i.email} <span className="panel__meta">({t(`panel.roles.${i.role}`)})</span>{' '}
                {data.canManage.includes(i.role) && (
                  <button
                    className="account__button account__button--quiet"
                    type="button"
                    disabled={busy}
                    aria-label={t('panel.people.takeFor', { role: t(`panel.roles.${i.role}`), name: i.email })}
                    onClick={() => void run(`invite:${i.email}:${i.role}`, async () => (await removeMember(token, slug, i.email, i.role), null))}
                  >
                    {t('panel.people.remove')}
                  </button>
                )}
                <Processing when={busyKey === `invite:${i.email}:${i.role}`} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <h3>{t('panel.people.accounts')}</h3>
      <div className="panel__filters">
        <label>
          {t('panel.search')}
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <span className="panel__meta" data-testid="account-count">
          {t('panel.people.count', { count: accounts.length })}
        </span>
      </div>
      <div className="panel__table">
        <table>
          <thead>
            <tr>
              <th>{t('panel.people.person')}</th>
              <th>{t('panel.people.roles')}</th>
              <th>{t('panel.people.giveRole')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <AccountRow
                key={a.userId}
                account={a}
                canManage={data.canManage}
                owner={data.owner}
                busy={busy}
                processing={busyKey === a.userId}
                onGive={(r) => void give(a.userId, a.email, r)}
                onTake={(r) => void run(a.userId, async () => (await removeMember(token, slug, a.email, r), null))}
                onSave={(changes) =>
                  run(a.userId, async () => {
                    await updateAccount(token, slug, a.userId, changes);
                    return t('panel.people.updated');
                  })
                }
                onPasswordSet={(password) =>
                  run(a.userId, async () => {
                    await setAccountPassword(token, slug, a.userId, password);
                    return t('panel.people.passwordSetDone', { name: a.fullName || a.email });
                  })
                }
                onPasswordLink={() =>
                  void run(a.userId, async () => {
                    await sendPasswordLink(token, slug, a.userId);
                    return t('panel.people.passwordLinkSent', { email: a.email });
                  })
                }
              />
            ))}
          </tbody>
        </table>
      </div>
      {accounts.length === 0 && <p>{t('panel.empty')}</p>}
    </>
  );
}

// ───────────────────────────── Requests ─────────────────────────────

function RequestsTab({ token, slug, message }: TabProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const load = useCallback(() => fetchPanelRequests(token, slug), [token, slug]);
  const { data, error, setError, reload } = useLoad<{ requests: PanelRequest[] }>(load, message);
  const [busyId, setBusyId] = useState<string | null>(null);
  const busy = busyId !== null;

  if (!data) return error ? <Problem text={error} /> : <Loading />;
  const decide = async (id: string, approve: boolean) => {
    setBusyId(id);
    setError(null);
    try {
      await decideRequest(token, slug, id, approve);
      await reload();
    } catch (err) {
      setError(message(err));
    }
    setBusyId(null);
  };
  return (
    <>
      <p>{t('panel.requests.intro')}</p>
      <Problem text={error} />
      {data.requests.length === 0 && <p data-testid="no-requests">{t('panel.requests.none')}</p>}
      {data.requests.map((r) => (
        <div className="account__card" key={r.id} data-testid="request-card">
          <p>
            {t('panel.requests.body', {
              accountName: r.accountName || r.accountEmail,
              accountEmail: r.accountEmail,
              registrationName: r.registrationName,
              registrationEmail: r.registrationEmail,
              date: day(r.createdAt, locale),
            })}
          </p>
          <span className="panel__row-actions">
            <button className="account__button" type="button" disabled={busy} onClick={() => void decide(r.id, true)}>
              {t('panel.requests.approve')}
            </button>
            <button className="account__button account__button--quiet" type="button" disabled={busy} onClick={() => void decide(r.id, false)}>
              {t('panel.requests.refuse')}
            </button>
            <Processing when={busyId === r.id} />
          </span>
        </div>
      ))}
    </>
  );
}

// ───────────────────────────── Announcements (#221) ─────────────────────────────

function AnnouncementsTab({ token, slug, message }: TabProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const load = useCallback(
    async () => ({
      counts: (await fetchAudiences(token, slug)).counts,
      sent: (await fetchAnnouncements(token, slug)).announcements,
    }),
    [token, slug],
  );
  const { data, error, setError, reload } = useLoad<{ counts: Record<Audience, number>; sent: SentAnnouncement[] }>(load, message);
  const [audience, setAudience] = useState<Audience>('all');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data) return error ? <Problem text={error} /> : <Loading />;
  const count = data.counts[audience];

  const send = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const { recipients, sentNow, waiting } = await sendAnnouncement(token, slug, audience, subject, body);
      // What went out while the person waited, and what is still queued (#281).
      setNote(
        t('panel.announcements.sent', { count: recipients }) +
          t('panel.announcements.sentNow', { sent: sentNow }) +
          (waiting > 0 ? t('panel.announcements.sentWaiting', { waiting }) : ''),
      );
      setSubject('');
      setBody('');
      setConfirming(false);
      await reload();
    } catch (err) {
      setError(message(err));
      setConfirming(false);
    }
    setBusy(false);
  };

  return (
    <>
      <form
        className="reg-form"
        style={{ maxWidth: 760 }}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setConfirming(true);
        }}
        noValidate
      >
        <div className="reg-form__field">
          <label htmlFor="announce-audience">{t('panel.announcements.audience')}</label>
          <select id="announce-audience" value={audience} onChange={(e) => { setAudience(e.target.value as Audience); setConfirming(false); }}>
            {AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {t(`panel.announcements.audiences.${a}`)} ({data.counts[a]})
              </option>
            ))}
          </select>
          <p className="reg-form__hint">{t('panel.announcements.audienceHint')}</p>
        </div>
        <div className="reg-form__field">
          <label htmlFor="announce-subject">{t('panel.announcements.subject')}</label>
          <input id="announce-subject" type="text" value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="reg-form__field">
          <label htmlFor="announce-body">{t('panel.announcements.body')}</label>
          <textarea id="announce-body" className="panel__textarea" value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} />
        </div>
        <Problem text={error} />
        {note && (
          <p className="account__notice account__notice--ok" role="status">
            {note}
          </p>
        )}
        {confirming ? (
          <div className="account__notice" role="alert">
            <p>{t('panel.announcements.confirm', { count, audience: t(`panel.announcements.audiences.${audience}`) })}</p>
            <span className="panel__row-actions">
              <button className="account__button" type="button" disabled={busy} onClick={() => void send()}>
                {t('panel.announcements.sendYes', { count })}
              </button>
              <button className="account__button account__button--quiet" type="button" onClick={() => setConfirming(false)}>
                {t('common.cancel')}
              </button>
              <Processing when={busy} />
            </span>
          </div>
        ) : (
          <button className="reg-form__submit" type="submit" disabled={count === 0 || !subject.trim() || !body.trim()}>
            {t('panel.announcements.review')}
          </button>
        )}
      </form>

      <h2 className="account__section">{t('panel.announcements.history')}</h2>
      {data.sent.length === 0 && <p data-testid="no-announcements">{t('panel.announcements.none')}</p>}
      {data.sent.map((a) => (
        <div className="account__card" key={a.id} data-testid="announcement-card">
          <p className="panel__meta">
            {t('panel.announcements.sentLine', {
              sender: a.senderName,
              audience: t(`panel.announcements.audiences.${a.audience}`),
              count: a.recipients,
              date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Fortaleza' }).format(new Date(a.createdAt)),
            })}
          </p>
          <h3>{a.subject}</h3>
          {a.body.split(/\n{2,}/).map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      ))}
    </>
  );
}

/** `/:event/painel[/trabalhos|/pessoas|/comunicados|/pedidos]`: the organisation area of an edition (#219). */
export function PanelPage({ tab }: { tab: PanelTab }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const { event } = useEvent();
  const location = useLocation();
  const token = auth.enabled ? auth.accessToken : null;
  const [admin, setAdmin] = useState(false);
  // Whether the answer about this person's role is in. Until then no tab is offered: someone with
  // no role would see the panel's menu before "page not found", and "Pedidos" would arrive late (#324).
  const [roleKnown, setRoleKnown] = useState(false);
  const [denied, setDenied] = useState(false);

  const message = useCallback(
    (err: unknown) => {
      // No role in this edition: the server answers as if the page did not exist, and so do we.
      if (err instanceof AdminError && err.code === 'not_found') setDenied(true);
      return t(`panel.errors.${err instanceof AdminError ? err.code : 'generic'}`);
    },
    [t],
  );

  useEffect(() => {
    if (!token || !event) return;
    let active = true;
    // Decides which tabs to offer; the server decides again on every call.
    fetchPanelMembers(token, event.slug)
      .then((m) => {
        if (!active) return;
        setAdmin(m.role === 'ADMIN');
        setRoleKnown(true);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof AdminError && err.code === 'not_found') setDenied(true);
        // Any other failure: the tabs everyone with a role has, and each tab reports its own error.
        else setRoleKnown(true);
      });
    return () => {
      active = false;
    };
  }, [token, event]);

  if (!auth.enabled || denied) return <NotFoundPage />;
  if (!event) return null;
  // The session is still being read: say so, under the page's title (#324).
  if (auth.loading) return <PageLoading title={t('panel.title')} />;
  if (!token) return <Navigate to={`/${event.slug}/conta/entrar?next=${encodeURIComponent(location.pathname)}`} replace />;

  const base = `/${event.slug}/painel`;
  const props: TabProps = { token, slug: event.slug, message };
  let content: ReactNode;
  if (tab === 'papers') content = <PapersTab {...props} />;
  else if (tab === 'people') content = <PeopleTab {...props} />;
  else if (tab === 'announcements') content = <AnnouncementsTab {...props} />;
  else if (tab === 'requests') content = <RequestsTab {...props} />;
  else content = <RegistrationsTab {...props} />;

  return (
    <>
      <PageHeader title={t('panel.title')} />
      <section className="section">
        <div className="container">
          <nav className="panel__tabs" aria-label={t('panel.title')} aria-busy={!roleKnown}>
            {roleKnown &&
              TABS.filter((x) => !x.adminOnly || admin).map((x) => (
                <Link key={x.tab} to={`${base}${x.path}`} aria-current={x.tab === tab ? 'page' : undefined}>
                  {t(`panel.tabs.${x.tab}`)}
                </Link>
              ))}
          </nav>
          {content}
        </div>
      </section>
    </>
  );
}
