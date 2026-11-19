import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { DocumentFields, NO_DOCUMENT, documentInput, type DocumentValue } from '../../components/account/DocumentFields';
import type { PersonSuggestion } from '../../services/submissions';

/** One line of the author list as the form holds it. */
export interface AuthorRow {
  /** Stable while the list is reordered. */
  key: string;
  fullName: string;
  email: string;
  /** The person logged in: their e-mail is the account's and the row cannot be removed. */
  self?: boolean;
  /** Set when the person was picked from the suggestions: sent instead of an e-mail. */
  ref?: string;
  /** The masked address of the picked person, e.g. `r•••@ufcg.edu.br`. */
  emailHint?: string;
  /** Who the person is (ADR-010), as typed: asked for whoever has no account that says it. */
  document: DocumentValue;
  /**
   * What is already on record about who this author is, so nothing is asked twice:
   * `account`, their own account says it; `typed`, typed before for this address (shown as
   * a hint). Dropped when the address changes: it is then another person.
   */
  onRecord?: { state: 'account' } | { state: 'typed'; hint: string };
  /**
   * A line from before documents were asked for, on a paper an administrator is correcting:
   * the fields are there, and may be left empty. Dropped with the address, like `onRecord`.
   */
  legacy?: boolean;
}

let nextKey = 0;
export const newAuthorRow = (over: Partial<AuthorRow> = {}): AuthorRow => {
  nextKey += 1;
  return { key: `author-${nextKey}`, fullName: '', email: '', document: NO_DOCUMENT, ...over };
};

/** Whether the form has to ask who this author is: not for the sender, nor where it is on record. */
export const asksDocument = (row: AuthorRow): boolean => !row.self && !row.onRecord;

/**
 * What the server takes: a typed e-mail, or the reference of a picked person, and the
 * document typed for them when one was asked for.
 */
export const toAuthorInput = (rows: AuthorRow[]) =>
  rows
    .filter((row) => row.fullName.trim() || row.email.trim() || row.ref)
    .map((row) => ({
      ...(row.ref ? { fullName: row.fullName.trim(), ref: row.ref } : { fullName: row.fullName.trim(), email: row.email.trim() }),
      ...(asksDocument(row) ? documentInput(row.document) : {}),
    }));

/** A reference is sealed anew on every search, so a picked person is recognised by name and hint. */
const personKey = (fullName: string, emailHint: string | undefined) => `${fullName}|${emailHint ?? ''}`;

const SEARCH_FROM = 3;
const SEARCH_DELAY_MS = 250;

/**
 * The name of one author, with suggestions of people already in the system.
 * The suggestions never get in the way: nothing is picked unless the person
 * clicks one (or arrows down to it and presses Enter); typing on, Escape or
 * leaving the field dismisses them.
 */
function NameField({
  row,
  n,
  taken,
  search,
  onType,
  onPick,
}: {
  row: AuthorRow;
  n: number;
  /** People already picked in other rows (see `personKey`), so nobody is offered twice. */
  taken: string[];
  search: ((query: string) => Promise<PersonSuggestion[]>) | null;
  onType: (value: string) => void;
  onPick: (person: PersonSuggestion) => void;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const [people, setPeople] = useState<PersonSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Suggestions are for what is being typed now: not for a prefilled, picked or own name.
  const [typed, setTyped] = useState(false);
  const latest = useRef(0);
  // An answer may arrive after the field was left: it must not open the list then (#359).
  const focused = useRef(false);

  const query = row.fullName.trim();
  const wanted = Boolean(search) && typed && !row.self && !row.ref && query.replace(/\s+/g, '').length >= SEARCH_FROM;

  useEffect(() => {
    if (!wanted || !search) {
      setPeople([]);
      setOpen(false);
      return;
    }
    latest.current += 1;
    const ticket = latest.current;
    const timer = setTimeout(() => {
      void search(query).then((found) => {
        // An answer to an older keystroke must not replace a newer one.
        if (ticket !== latest.current) return;
        setPeople(found);
        setActive(-1);
        setOpen(found.length > 0 && focused.current);
      });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [wanted, query, search]);

  const shown = people.filter((p) => !taken.includes(personKey(p.fullName, p.emailHint)));
  const expanded = open && shown.length > 0;

  const pick = (person: PersonSuggestion) => {
    setOpen(false);
    setTyped(false);
    onPick(person);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!expanded) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % shown.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? shown.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0 && shown[active]) {
      // Only when a suggestion was reached on purpose; otherwise Enter stays the form's.
      e.preventDefault();
      pick(shown[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="reg-form__field papers__name">
      <label htmlFor={`author-name-${row.key}`}>
        {t('papers.form.authorName', { n })}
        {row.self && ` (${t('papers.form.authorYou')})`}
      </label>
      <input
        id={`author-name-${row.key}`}
        type="text"
        value={row.fullName}
        autoComplete="off"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          setTyped(true);
          onType(e.target.value);
        }}
        onKeyDown={onKeyDown}
        // Leaving the field closes the list; a click on a suggestion lands first (mousedown below).
        onBlur={() => {
          focused.current = false;
          setOpen(false);
        }}
        onFocus={() => {
          focused.current = true;
          setOpen(shown.length > 0 && wanted);
        }}
      />
      <ul
        id={listId}
        className="papers__suggestions"
        role="listbox"
        aria-label={t('papers.form.suggestions')}
        hidden={!expanded}
      >
        {expanded &&
          shown.map((person, index) => (
            <li
              key={person.ref}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? 'is-active' : undefined}
              // mousedown, not click: it comes before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(person);
              }}
            >
              <span>{person.fullName}</span>
              <span className="papers__meta">
                {[person.institution, person.emailHint].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
      </ul>
      {expanded && <p className="reg-form__hint">{t('papers.form.suggestionsHint')}</p>}
    </div>
  );
}

/**
 * Every author of the paper, in the order of the paper (#230). There is no main
 * author for the site: whoever sends it is one of the list, in any place.
 */
export function AuthorList({
  rows,
  max,
  onChange,
  search,
  onEmailLeft,
}: {
  rows: AuthorRow[];
  max: number;
  onChange: (rows: AuthorRow[]) => void;
  /** Looks people up by name; null turns the suggestions off. */
  search: ((query: string) => Promise<PersonSuggestion[]>) | null;
  /** Told the address typed for a co-author once the field is left, to see whether a document is still needed (#363). */
  onEmailLeft?: (email: string) => void;
}) {
  const { t } = useTranslation();
  const patch = (index: number, change: Partial<AuthorRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));
  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    [next[index], next[to]] = [next[to]!, next[index]!];
    onChange(next);
  };
  const taken = rows.flatMap((row) => (row.ref ? [personKey(row.fullName, row.emailHint)] : []));

  return (
    <>
      <h2>{t('papers.form.authorsTitle')}</h2>
      <p className="reg-form__hint">{t('papers.form.authorsHint', { max })}</p>
      <p className="reg-form__hint">{t('papers.form.authorsDocumentHint')}</p>
      <ol className="papers__author-list">
        {rows.map((row, index) => {
          const n = index + 1;
          return (
            <li className="papers__author" key={row.key} data-testid="author-row">
              <NameField
                row={row}
                n={n}
                taken={taken}
                search={search}
                // Typing over a picked person lets go of them: the name is no longer theirs.
                onType={(fullName) =>
                  patch(index, row.ref ? { fullName, ref: undefined, emailHint: undefined, email: '', onRecord: undefined } : { fullName })
                }
                onPick={(person) =>
                  patch(index, {
                    fullName: person.fullName,
                    ref: person.ref,
                    emailHint: person.emailHint,
                    email: '',
                    // Someone whose account says who they are needs nothing typed for them.
                    onRecord: person.hasDocument ? { state: 'account' } : undefined,
                    document: NO_DOCUMENT,
                  })
                }
              />
              <div className="reg-form__field">
                <label htmlFor={`author-email-${row.key}`}>{t('papers.form.authorEmail', { n })}</label>
                {row.ref ? (
                  <>
                    <div className="papers__picked">
                      <input id={`author-email-${row.key}`} type="text" value={row.emailHint ?? ''} readOnly />
                      <button
                        className="account__button account__button--quiet"
                        type="button"
                        aria-label={t('papers.form.suggestionClear', { n })}
                        onClick={() => patch(index, { ref: undefined, emailHint: undefined, email: '', onRecord: undefined })}
                      >
                        {t('papers.form.suggestionUndo')}
                      </button>
                    </div>
                    <p className="reg-form__hint">{t('papers.form.suggestionPicked')}</p>
                  </>
                ) : (
                  <input
                    id={`author-email-${row.key}`}
                    type="email"
                    value={row.email}
                    readOnly={row.self}
                    // Another address is another person: what was on record is not theirs.
                    onChange={(e) => patch(index, { email: e.target.value, onRecord: undefined, legacy: undefined })}
                    onBlur={() => {
                      const email = row.email.trim().toLowerCase();
                      if (onEmailLeft && !row.self && !row.onRecord && /^\S+@\S+\.\S+$/.test(email)) onEmailLeft(email);
                    }}
                  />
                )}
              </div>
              <div className="papers__author-document" data-testid="author-document">
                {row.self ? (
                  <p className="reg-form__hint">{t('papers.form.authorDocumentOwn')}</p>
                ) : row.onRecord ? (
                  <p className="reg-form__hint">
                    {row.onRecord.state === 'account'
                      ? t('papers.form.authorDocumentOnFile')
                      : t('papers.form.authorDocumentTyped', { hint: row.onRecord.hint })}{' '}
                    {row.onRecord.state === 'typed' && (
                      <button
                        className="account__button account__button--quiet"
                        type="button"
                        aria-label={t('papers.form.authorDocumentChangeLabel', { n })}
                        onClick={() => patch(index, { onRecord: undefined, document: NO_DOCUMENT })}
                      >
                        {t('papers.form.authorDocumentChange')}
                      </button>
                    )}
                  </p>
                ) : (
                  <DocumentFields
                    idPrefix={`author-document-${row.key}`}
                    value={row.document}
                    onChange={(document) => patch(index, { document })}
                    labels={{
                      cpf: t('papers.form.authorCpf', { n }),
                      passport: t('papers.form.authorPassport', { n }),
                      country: t('papers.form.authorCountry', { n }),
                    }}
                  />
                )}
              </div>
              <div className="papers__author-actions">
                <button
                  className="papers__icon"
                  type="button"
                  aria-label={t('papers.form.authorUp', { n })}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  className="papers__icon"
                  type="button"
                  aria-label={t('papers.form.authorDown', { n })}
                  disabled={index === rows.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                {!row.self && (
                  <button
                    className="papers__icon"
                    type="button"
                    aria-label={t('papers.form.authorRemove', { n })}
                    onClick={() => onChange(rows.filter((_, i) => i !== index))}
                  >
                    ×
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {rows.length < max && (
        <p>
          <button
            className="account__button account__button--quiet"
            type="button"
            onClick={() => onChange([...rows, newAuthorRow()])}
          >
            {t('papers.form.authorAdd')}
          </button>
        </p>
      )}
    </>
  );
}
