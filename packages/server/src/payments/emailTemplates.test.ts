import { describe, expect, it } from 'vitest';
import {
  EMAIL_LOCALES,
  emailLocale,
  escapeHtml,
  renderEmail,
  type EmailData,
  type NotificationKind,
} from './emailTemplates';

const DATA: EmailData = {
  firstName: 'Maria',
  eventName: 'II SIEAmB',
  amount: 'R$ 70,00',
  statusUrl: 'https://sieamb.org/2027/inscricoes/pagamento?p=abc',
  payUrl: 'https://sieamb.org/2027/inscricoes/pagar?t=def',
};
const KINDS: NotificationKind[] = ['processing', 'confirmed', 'failed'];

describe('renderEmail', () => {
  it('says what Rodrigo asked for in Portuguese', () => {
    expect(renderEmail('processing', 'pt-BR', DATA).subject).toBe(
      'Inscrição recebida: estamos processando seu pagamento (II SIEAmB)',
    );
    expect(renderEmail('confirmed', 'pt-BR', DATA).subject).toBe(
      'Inscrição concluída: pagamento confirmado (II SIEAmB)',
    );
    expect(renderEmail('failed', 'pt-BR', DATA).subject).toBe('Pagamento não aprovado (II SIEAmB)');
  });

  it.each(EMAIL_LOCALES.flatMap((locale) => KINDS.map((kind) => [locale, kind] as const)))(
    '%s %s carries the name, the event, the amount and the right link, in text and in HTML',
    (locale, kind) => {
      const mail = renderEmail(kind, locale, DATA);
      const link = kind === 'failed' ? DATA.payUrl : DATA.statusUrl;
      const other = kind === 'failed' ? DATA.statusUrl : DATA.payUrl;
      for (const part of [mail.text, mail.html]) {
        expect(part).toContain('Maria');
        expect(part).toContain('II SIEAmB');
        expect(part).toContain('R$ 70,00');
        expect(part).toContain(link);
        expect(part).not.toContain(other);
        expect(part).not.toMatch(/undefined|\{0\}|\$\{/);
      }
      expect(mail.subject).toContain('II SIEAmB');
      expect(mail.subject).not.toMatch(/[\r\n]/);
    },
  );

  it('tells a person whose payment is being processed not to pay again, in every language', () => {
    const phrases: Record<string, RegExp> = {
      'pt-BR': /Não é preciso pagar de novo/,
      en: /no need to pay again/,
      es: /No es necesario pagar de nuevo/,
      'zh-CN': /无需再次付款/,
    };
    for (const locale of EMAIL_LOCALES) {
      expect(renderEmail('processing', locale, DATA).text).toMatch(phrases[locale]!);
    }
  });

  it('only the Portuguese copy reads in Portuguese', () => {
    for (const locale of EMAIL_LOCALES.filter((l) => l !== 'pt-BR')) {
      for (const kind of KINDS) {
        // The links are Portuguese paths on purpose, so they are left out of the check.
        const prose = renderEmail(kind, locale, DATA).text.replace(/https?:\/\/\S+/g, '');
        expect(prose).not.toMatch(/inscrição|pagamento|Olá/i);
      }
    }
  });

  it('falls back to Portuguese for a language we have no copy for', () => {
    expect(emailLocale('fr')).toBe('pt-BR');
    expect(emailLocale('')).toBe('pt-BR');
    expect(renderEmail('confirmed', 'fr', DATA).text).toContain('Olá, Maria.');
  });

  it('never lets a name from the public form become markup', () => {
    const mail = renderEmail('confirmed', 'pt-BR', {
      ...DATA,
      firstName: '<img src=x onerror=alert(1)>',
    });
    expect(mail.html).not.toContain('<img');
    expect(mail.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    // Plain text is not interpreted, so it stays as typed.
    expect(mail.text).toContain('<img src=x onerror=alert(1)>');
  });

  it('escapes the characters that matter in an attribute too', () => {
    expect(escapeHtml(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&#39;f');
    const mail = renderEmail('failed', 'pt-BR', { ...DATA, payUrl: 'https://x.test/?a=1&b="2"' });
    expect(mail.html).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;"');
  });
});
