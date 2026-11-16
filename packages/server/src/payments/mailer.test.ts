import { describe, expect, it } from 'vitest';
import { smtpSettings } from './mailer';

describe('smtpSettings', () => {
  it('is null until both the user and the password are set', () => {
    expect(smtpSettings({})).toBeNull();
    expect(smtpSettings({ SMTP_USER: 'a@gmail.com' })).toBeNull();
    expect(smtpSettings({ SMTP_PASS: 'abcd' })).toBeNull();
    expect(smtpSettings({ SMTP_USER: ' ', SMTP_PASS: '  ' })).toBeNull();
  });

  it('defaults to Gmail and accepts an app password typed with its spaces', () => {
    expect(smtpSettings({ SMTP_USER: ' evento@gmail.com ', SMTP_PASS: 'abcd efgh ijkl mnop' })).toEqual({
      host: 'smtp.gmail.com',
      port: 465,
      user: 'evento@gmail.com',
      pass: 'abcdefghijklmnop',
      from: 'SIEAmB <evento@gmail.com>',
    });
  });

  it('takes another provider and sender from the environment', () => {
    expect(
      smtpSettings({
        SMTP_HOST: 'smtp.resend.com',
        SMTP_PORT: '587',
        SMTP_USER: 'resend',
        SMTP_PASS: 're_123',
        MAIL_FROM: 'II SIEAmB <inscricoes@sieamb.org>',
      }),
    ).toMatchObject({ host: 'smtp.resend.com', port: 587, from: 'II SIEAmB <inscricoes@sieamb.org>' });
  });

  it.each(['abc', '0', '-1', '25.5'])('falls back to 465 for the invalid port "%s"', (port) => {
    expect(smtpSettings({ SMTP_USER: 'a@b.c', SMTP_PASS: 'x', SMTP_PORT: port })?.port).toBe(465);
  });

  it('sends answers to another address only when one is given', () => {
    const base = { SMTP_USER: 'resend', SMTP_PASS: 're_123' };
    expect(smtpSettings(base)).not.toHaveProperty('replyTo');
    expect(smtpSettings({ ...base, MAIL_REPLY_TO: '  ' })).not.toHaveProperty('replyTo');
    expect(smtpSettings({ ...base, MAIL_REPLY_TO: ' comissao@example.org ' })?.replyTo).toBe('comissao@example.org');
  });
});
