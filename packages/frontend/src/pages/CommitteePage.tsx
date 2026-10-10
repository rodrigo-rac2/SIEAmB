import type { CommitteeMember, Founder } from '@sieamb/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/shared/PageHeader';
import { PersonCard } from '../components/shared/PersonCard';
import { useEvent } from '../contexts/EventContext';
import { getDataProvider } from '../services';

export function CommitteePage() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const [members, setMembers] = useState<CommitteeMember[]>([]);
  const [founders, setFounders] = useState<Founder[]>([]);

  useEffect(() => {
    if (!event) return;
    const provider = getDataProvider();
    void provider.getCommittee(event.id).then(setMembers);
    void provider.getFounders().then(setFounders);
  }, [event]);

  if (!event) return null;

  // Groups appear in fixture order (sortOrder) so each edition controls its own layout.
  const groups: [string, CommitteeMember[]][] = [];
  for (const m of members) {
    const g = groups.find(([role]) => role === m.role);
    if (g) g[1].push(m);
    else groups.push([m.role, [m]]);
  }

  return (
    <>
      <PageHeader title={t('committee.title')} />
      <section className="section">
        <div className="container" style={{ maxWidth: '72ch' }}>
          <p className="committee__intro">{t('committee.intro', { edition: event.name })}</p>

          <h2>{t('people.foundersTitle')}</h2>
          <p className="committee__note">{t('committee.foundersNote')}</p>
          <ul className="people">
            {founders.map((f) => (
              <PersonCard key={f.id} name={f.name} subtitle={f.affiliation} photoUrl={f.photoUrl} />
            ))}
          </ul>
          <p>
            <Link to={`/${event.slug}/o-evento#idealizadores`}>{t('committee.foundersMore')} →</Link>
          </p>

          {groups.map(([role, group]) => (
            <div key={role}>
              <h2>{role}</h2>
              <ul className="people">
                {group.map((m) => (
                  <PersonCard
                    key={m.id}
                    name={m.name}
                    subtitle={m.institution}
                    badge={m.isCoordinator ? t('committee.coordinator') : null}
                    bioMd={m.bioMd}
                    photoUrl={m.photoUrl}
                    lattesUrl={m.lattesUrl}
                    orcidUrl={m.orcidUrl}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
