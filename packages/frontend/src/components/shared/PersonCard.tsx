import Markdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { assetUrl } from '../../lib/assets';
import './PersonCard.css';

export interface PersonCardProps {
  name: string;
  subtitle?: string | null;
  badge?: string | null;
  bioMd?: string | null;
  photoUrl?: string | null;
  lattesUrl?: string | null;
  orcidUrl?: string | null;
}

const HONORIFIC = /^(Dra?\.|Ma?\.|Me\.|Prof\.)\s+/;

export function PersonCard({ name, subtitle, badge, bioMd, photoUrl, lattesUrl, orcidUrl }: PersonCardProps) {
  const { t } = useTranslation();
  return (
    <li className="person">
      <div className="person__photo" aria-hidden={!photoUrl}>
        {photoUrl ? (
          <img src={assetUrl(photoUrl)} alt="" loading="lazy" />
        ) : (
          <span>{name.replace(HONORIFIC, '').charAt(0)}</span>
        )}
      </div>
      <div className="person__body">
        <h3>
          {name}
          {badge && <span className="person__badge">{badge}</span>}
        </h3>
        {subtitle && <p className="person__subtitle">{subtitle}</p>}
        {bioMd && (
          <div className="person__bio">
            <Markdown>{bioMd}</Markdown>
          </div>
        )}
        {(lattesUrl || orcidUrl) && (
          <p className="person__links">
            {lattesUrl && (
              <a href={lattesUrl} target="_blank" rel="noreferrer">
                {t('people.lattes')}
              </a>
            )}
            {orcidUrl && (
              <a href={orcidUrl} target="_blank" rel="noreferrer">
                {t('people.orcid')}
              </a>
            )}
          </p>
        )}
      </div>
    </li>
  );
}
