import { sourceText } from '@sieamb/shared';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/shared/PageHeader';
import { PersonCard } from '../components/shared/PersonCard';
import { useEvent } from '../contexts/EventContext';
import { useContent } from '../hooks/useContent';
import { useLocalized } from '../hooks/useLocale';
import { firstAppearance, groupByRole } from '../lib/team';

export function CommitteePage() {
  const { t } = useTranslation();
  const { event } = useEvent();
  const l = useLocalized();
  const members = useContent('getCommittee', event?.id) ?? [];
  const founders = useContent('getFounders') ?? [];

  if (!event) return null;

  // Groups appear in fixture order; the bio shows only the first time a person is presented.
  const groups = groupByRole(members);
  const firstTime = firstAppearance();

  return (
    <>
      <PageHeader title={t('committee.title')} />
      <section className="section">
        <div className="container" style={{ maxWidth: '72ch' }}>
          <p className="committee__intro">{t('committee.intro', { edition: event.name })}</p>

          <h2>{t('people.foundersTitle')}</h2>
          <ul className="people">
            {founders.map((f) => (
              <PersonCard
                key={f.id}
                name={f.name}
                subtitle={l(f.affiliation)}
                bioMd={firstTime(f.name) ? f.bioMd : null}
                photoUrl={f.photoUrl}
                lattesUrl={f.lattesUrl}
                orcidUrl={f.orcidUrl}
              />
            ))}
          </ul>

          {groups.map(([role, group]) => (
            <div key={sourceText(role)}>
              <h2>{l(role)}</h2>
              <ul className="people">
                {group.map((m) => {
                  const first = firstTime(m.name);
                  return (
                    <PersonCard
                      key={m.id}
                      name={m.name}
                      subtitle={m.institution}
                      badge={m.isCoordinator ? t('committee.coordinator') : null}
                      bioMd={first ? m.bioMd : null}
                      photoUrl={m.photoUrl}
                      lattesUrl={first ? m.lattesUrl : null}
                      orcidUrl={first ? m.orcidUrl : null}
                    />
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
