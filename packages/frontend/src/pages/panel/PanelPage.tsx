import type { ThematicArea } from '@sieamb/shared';
import { formatCpf, maskCpf } from '@sieamb/shared';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { PageHeader } from '../../components/shared/PageHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useEvent } from '../../contexts/EventContext';
import { useLocale, useLocalized } from '../../hooks/useLocale';
import { getDataProvider } from '../../services';
import {
  AdminError,
  addMember,
  createPanelRegistration,
  decideRequest,
  deleteRegistration,
  fetchPanelMembers,
  fetchPanelPapers,
  fetchPanelRegistrations,
  fetchPanelRequests,
  removeMember,
  restoreRegistration,
  setRegistrationStatus,
  toCsv,
  type ManualStatus,
  type MemberRole,
  type PanelMembers,
  type PanelPapers,
  type PanelRegistration,
  type PanelRegistrations,
  type PanelRequest,
} from '../../services/admin';
import { browser, paperFileUrl } from '../../services/submissions';
import { NotFoundPage } from '../NotFoundPage';
import '../../components/registration/RegistrationForm.css';
import '../account/Account.css';
import './Panel.css';

export type PanelTab = 'registrations' | 'papers' | 'people' | 'requests';

const TABS: { tab: PanelTab; path: string; adminOnly?: boolean }[] = [
  { tab: 'registrations', path: '' },
  { tab: 'papers', path: '/trabalhos' },
  { tab: 'people', path: '/pessoas' },
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
      </span>
    </form>
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
      {passport.trim() && !cpf.trim() && (
        <div className="reg-form__field">
          <label htmlFor="new-country">{t('account.area.country')}</label>
          <input id="new-country" type="text" maxLength={2} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} />
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

  if (!data) return error ? <Problem text={error} /> : <p role="status">{t('common.loading')}</p>;
  const admin = data.role === 'ADMIN';
  const needle = search.trim().toLowerCase();
  const rows = data.registrations.filter(
    (r) =>
      (showDeleted ? Boolean(r.deleted) : !r.deleted) &&
      (!state || r.state === state) &&
      (!needle || `${r.fullName} ${r.email} ${r.institution ?? ''}`.toLowerCase().includes(needle)),
  );

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
      </div>
      <Problem text={error} />
      <div className="panel__table">
        <table>
          <thead>
            <tr>
              <th>{t('registration.fullName')}</th>
              <th>{t('panel.registrations.state')}</th>
              <th>{t('panel.registrations.payment')}</th>
              <th>{t('panel.registrations.date')}</th>
              {admin && <th>{t('common.actions')}</th>}
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
                {admin && (
                  <td>
                    <RegistrationActions {...props} registration={r} onDone={reload} />
                  </td>
                )}
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

function PapersTab({ token, slug, message }: TabProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const l = useLocalized();
  const { event } = useEvent();
  const load = useCallback(() => fetchPanelPapers(token, slug), [token, slug]);
  const { data, error, setError } = useLoad<PanelPapers>(load, message);
  const [areas, setAreas] = useState<ThematicArea[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (event) void getDataProvider().getThematicAreas(event.id).then(setAreas);
  }, [event]);

  if (!data) return error ? <Problem text={error} /> : <p role="status">{t('common.loading')}</p>;
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
  return (
    <>
      <p data-testid="panel-counts">{t('panel.papers.counts', data.counts)}</p>
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
              <th>{t('panel.papers.file')}</th>
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
                      {a.fullName} <span className="panel__meta">({a.email})</span>
                      <br />
                    </span>
                  ))}
                  <span className="panel__meta">
                    {t(s.authorRegistered ? 'panel.papers.authorRegistered' : 'panel.papers.noAuthorRegistered')}
                  </span>
                </td>
                <td>{s.deletedAt ? t('panel.papers.withdrawn') : t(`papers.status.${s.status}`, { defaultValue: s.status })}</td>
                <td>
                  <button className="account__button account__button--quiet" type="button" onClick={() => void open(s.id)}>
                    {s.fileName}
                  </button>
                  {s.filePages !== null && <span className="panel__meta"> · {t('papers.pages', { count: s.filePages })}</span>}
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

function PeopleTab({ token, slug, message }: TabProps) {
  const { t } = useTranslation();
  const load = useCallback(() => fetchPanelMembers(token, slug), [token, slug]);
  const { data, error, setError, reload } = useLoad<PanelMembers>(load, message);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('REVIEWER');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data) return error ? <Problem text={error} /> : <p role="status">{t('common.loading')}</p>;

  const run = async (work: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      setNote(await work());
      await reload();
    } catch (err) {
      setError(message(err));
    }
    setBusy(false);
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { invited } = await addMember(token, slug, email.trim(), role);
      setEmail('');
      return t(invited ? 'panel.people.invited' : 'panel.people.added');
    });
  };
  const roles: MemberRole[] = ['ADMIN', 'ORGANIZER', 'REVIEWER'];

  return (
    <>
      <form className="panel__filters" onSubmit={add}>
        <label>
          {t('account.email')}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          {t('panel.people.role')}
          <select value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
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
      </form>
      <p className="reg-form__hint">{t('panel.people.hint')}</p>
      <Problem text={error} />
      {note && (
        <p className="account__notice account__notice--ok" role="status">
          {note}
        </p>
      )}
      {roles.map((r) => {
        const people = data.members.filter((m) => m.role === r);
        const waiting = data.invites.filter((i) => i.role === r);
        const mine = data.canManage.includes(r);
        return (
          <section key={r} data-testid={`role-${r}`}>
            <h3>{t(`panel.roles.${r}`)}</h3>
            <p className="panel__meta">{t(`panel.roleDescription.${r}`)}</p>
            {people.length === 0 && waiting.length === 0 && <p>{t('panel.people.nobody')}</p>}
            <ul className="panel__people">
              {people.map((m) => (
                <li key={m.userId}>
                  {m.fullName || m.email} <span className="panel__meta">({m.email})</span>{' '}
                  {mine && (
                    <button className="account__button account__button--quiet" type="button" disabled={busy} onClick={() => void run(async () => (await removeMember(token, slug, m.email, r), null))}>
                      {t('panel.people.remove')}
                    </button>
                  )}
                </li>
              ))}
              {waiting.map((i) => (
                <li key={i.email}>
                  {i.email} <span className="panel__meta">({t('panel.people.waiting')})</span>{' '}
                  {mine && (
                    <button className="account__button account__button--quiet" type="button" disabled={busy} onClick={() => void run(async () => (await removeMember(token, slug, i.email, r), null))}>
                      {t('panel.people.remove')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

// ───────────────────────────── Requests ─────────────────────────────

function RequestsTab({ token, slug, message }: TabProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const load = useCallback(() => fetchPanelRequests(token, slug), [token, slug]);
  const { data, error, setError, reload } = useLoad<{ requests: PanelRequest[] }>(load, message);
  const [busy, setBusy] = useState(false);

  if (!data) return error ? <Problem text={error} /> : <p role="status">{t('common.loading')}</p>;
  const decide = async (id: string, approve: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await decideRequest(token, slug, id, approve);
      await reload();
    } catch (err) {
      setError(message(err));
    }
    setBusy(false);
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
          </span>
        </div>
      ))}
    </>
  );
}

/** `/:event/painel[/trabalhos|/pessoas|/pedidos]`: the organisation area of an edition (#219). */
export function PanelPage({ tab }: { tab: PanelTab }) {
  const { t } = useTranslation();
  const auth = useAuth();
  const { event } = useEvent();
  const location = useLocation();
  const token = auth.enabled ? auth.accessToken : null;
  const [admin, setAdmin] = useState(false);
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
      .then((m) => active && setAdmin(m.role === 'ADMIN'))
      .catch((err: unknown) => active && err instanceof AdminError && err.code === 'not_found' && setDenied(true));
    return () => {
      active = false;
    };
  }, [token, event]);

  if (!auth.enabled || denied) return <NotFoundPage />;
  if (auth.loading || !event) return null;
  if (!token) return <Navigate to={`/${event.slug}/conta/entrar?next=${encodeURIComponent(location.pathname)}`} replace />;

  const base = `/${event.slug}/painel`;
  const props: TabProps = { token, slug: event.slug, message };
  let content: ReactNode;
  if (tab === 'papers') content = <PapersTab {...props} />;
  else if (tab === 'people') content = <PeopleTab {...props} />;
  else if (tab === 'requests') content = <RequestsTab {...props} />;
  else content = <RegistrationsTab {...props} />;

  return (
    <>
      <PageHeader title={t('panel.title')} />
      <section className="section">
        <div className="container">
          <nav className="panel__tabs" aria-label={t('panel.title')}>
            {TABS.filter((x) => !x.adminOnly || admin).map((x) => (
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
