import nodemailer from 'nodemailer';
import type { Mailer, OutgoingMail } from './notifications';

export interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** What people see as the sender, e.g. `II SIEAmB <sieambufcg@gmail.com>`. */
  from: string;
  /** Where answers go, when it is not the sending address (e.g. the committee inbox). */
  replyTo?: string;
}

type Env = Record<string, string | undefined>;

/**
 * SMTP settings from the environment, or null when sending is not configured.
 * `SMTP_USER` and `SMTP_PASS` are required; the rest defaults to Gmail, which is
 * what the event account uses. Resend also speaks SMTP, so it can replace Gmail
 * by changing variables only (#18).
 */
export function smtpSettings(env: Env): SmtpSettings | null {
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS?.replace(/\s+/g, '');
  if (!user || !pass) return null;
  const port = Number(env.SMTP_PORT ?? 465);
  return {
    host: env.SMTP_HOST?.trim() || 'smtp.gmail.com',
    port: Number.isInteger(port) && port > 0 ? port : 465,
    user,
    pass,
    from: env.MAIL_FROM?.trim() || `SIEAmB <${user}>`,
    ...(env.MAIL_REPLY_TO?.trim() ? { replyTo: env.MAIL_REPLY_TO.trim() } : {}),
  };
}

export function createSmtpMailer(settings: SmtpSettings): Mailer {
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465,
    auth: { user: settings.user, pass: settings.pass },
    // A function has a few seconds to answer Mercado Pago: fail fast instead of hanging.
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
  return {
    async send(mail: OutgoingMail): Promise<void> {
      await transport.sendMail({
        from: settings.from,
        ...(settings.replyTo ? { replyTo: settings.replyTo } : {}),
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
    },
  };
}
