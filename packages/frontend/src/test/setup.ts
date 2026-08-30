import '@testing-library/jest-dom/vitest';
import { beforeAll } from 'vitest';
import i18n from '../i18n';

// jsdom's navigator language is en-US; unit tests assert against the pt-BR default.
beforeAll(async () => {
  await i18n.changeLanguage('pt-BR');
});
