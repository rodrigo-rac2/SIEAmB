import type { CommitteeMember } from '@sieamb/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/shared/PageHeader';
import { useEvent } from '../contexts/EventContext';
import { getDataProvider } from '../services';

export function CommitteePage() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const [members, setMembers] = useState<CommitteeMember[]>([]);

  useEffect(() => {
    if (!event) return;
    void getDataProvider().getCommittee(event.id).then(setMembers);
  }, [event]);

  const byRole = members.reduce<Record<string, CommitteeMember[]>>((acc, m) => {
    (acc[m.role] ??= []).push(m);
    return acc;
  }, {});

  return (
    <>
      <PageHeader title={t('committee.title')} />
      <section className="section">
        <div className="container">
          {Object.entries(byRole).map(([role, group]) => (
            <div key={role} style={{ marginBottom: 'var(--space-6)' }}>
              <h2>{role}</h2>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {group.map((m) => (
                  <li key={m.id}>
                    <strong>{m.name}</strong>
                    {m.institution && (
                      <span style={{ color: 'var(--color-ink-muted)' }}> — {m.institution}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
