import type { EditalAttachment } from '@sieamb/shared';
import { useTranslation } from 'react-i18next';
import { useLocalized } from '../../hooks/useLocale';
import { assetUrl } from '../../lib/assets';
import './EditalFiles.css';

/** Download list for an edital: official PDF, paper templates, slide template, external links. */
export function EditalFiles({ files }: { files: EditalAttachment[] }) {
  const { t } = useTranslation();
  const l = useLocalized();

  if (files.length === 0) return null;

  return (
    <ul className="edital-files">
      {files.map((f) => {
        const external = f.format === 'link';
        // PDFs and links open in a new tab; Word and PowerPoint templates download.
        const opens = external || f.format === 'pdf';
        return (
          <li key={f.url}>
            <a
              href={assetUrl(f.url)}
              {...(opens ? { target: '_blank', rel: 'noreferrer' } : { download: '' })}
            >
              <span className="edital-files__format">
                {external ? t('editais.formatLink') : f.format.toUpperCase()}
              </span>
              {l(f.label)}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
