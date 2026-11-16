/** The e-mails a person gets about a payment (#185) and the two reminders (#187). */
export type NotificationKind =
  | 'processing'
  | 'confirmed'
  | 'failed'
  | 'reminderUnpaid'
  | 'reminderPending'
  | 'received';

export interface EmailData {
  firstName: string;
  eventName: string;
  /** Already formatted for the locale, e.g. "R$ 70,00". Empty when no payment was started. */
  amount: string;
  /** Page that shows the payment status; works as a receipt once approved. */
  statusUrl: string;
  /** Page that starts a new payment for the same registration. */
  payUrl: string;
}

export interface Email {
  subject: string;
  text: string;
  html: string;
}

type Locale = 'pt-BR' | 'en' | 'es' | 'zh-CN';

interface Copy {
  subject: (d: EmailData) => string;
  /** Paragraphs; a `{link}` paragraph is replaced by the link below. */
  body: (d: EmailData) => string[];
  linkLabel: string;
  link: (d: EmailData) => string;
}

interface LocaleCopy {
  greeting: (name: string) => string;
  signature: (eventName: string) => string;
  kinds: Record<NotificationKind, Copy>;
}

const COPY: Record<Locale, LocaleCopy> = {
  'pt-BR': {
    greeting: (name) => `Olá, ${name}.`,
    signature: (event) => `Comissão organizadora do ${event}`,
    kinds: {
      processing: {
        subject: (d) => `Inscrição recebida: estamos processando seu pagamento (${d.eventName})`,
        body: (d) => [
          `Recebemos sua inscrição no ${d.eventName} e o pagamento de ${d.amount} está sendo processado pelo Mercado Pago.`,
          'Boletos podem levar alguns dias para compensar, e alguns pagamentos com cartão passam por uma análise antes de serem aprovados.',
          'Você receberá outro e-mail assim que o pagamento for confirmado. Não é preciso pagar de novo.',
        ],
        linkLabel: 'Acompanhar o pagamento',
        link: (d) => d.statusUrl,
      },
      confirmed: {
        subject: (d) => `Inscrição concluída: pagamento confirmado (${d.eventName})`,
        body: (d) => [
          `Seu pagamento de ${d.amount} foi confirmado e sua inscrição no ${d.eventName} está concluída.`,
          'Guarde este e-mail como comprovante da inscrição.',
        ],
        linkLabel: 'Ver a situação do pagamento',
        link: (d) => d.statusUrl,
      },
      failed: {
        subject: (d) => `Pagamento não aprovado (${d.eventName})`,
        body: (d) => [
          `O pagamento de ${d.amount} da sua inscrição no ${d.eventName} não foi aprovado ou foi cancelado.`,
          'Sua inscrição continua registrada. Para concluí-la, faça o pagamento novamente pelo link abaixo, com o mesmo ou com outro meio de pagamento.',
        ],
        linkLabel: 'Pagar a inscrição',
        link: (d) => d.payUrl,
      },
      reminderUnpaid: {
        subject: (d) => `Sua inscrição no ${d.eventName} aguarda o pagamento`,
        body: (d) => [
          `Recebemos sua inscrição no ${d.eventName}, mas ainda não identificamos o pagamento da taxa.`,
          'Para concluir a inscrição, faça o pagamento pelo Mercado Pago, com cartão ou boleto, pelo link abaixo.',
          'Se você já pagou, desconsidere esta mensagem: a confirmação chega por e-mail assim que o pagamento for registrado.',
        ],
        linkLabel: 'Pagar a inscrição',
        link: (d) => d.payUrl,
      },
      reminderPending: {
        subject: (d) => `Seu pagamento no ${d.eventName} ainda está pendente`,
        body: (d) => [
          `O pagamento de ${d.amount} da sua inscrição no ${d.eventName} ainda não foi confirmado pelo Mercado Pago.`,
          'Se você gerou um boleto e ainda não pagou, ele precisa ser pago para a inscrição ser concluída. Depois de pago, um boleto pode levar alguns dias para compensar.',
          'Assim que o pagamento for confirmado, você recebe outro e-mail.',
        ],
        linkLabel: 'Acompanhar o pagamento',
        link: (d) => d.statusUrl,
      },
      received: {
        subject: (d) => `Inscrição recebida (${d.eventName})`,
        body: (d) => [
          `Recebemos sua inscrição no ${d.eventName}.`,
          'Para concluí-la, falta o pagamento da taxa, que pode ser feito agora ou depois, pelo Mercado Pago, com cartão ou boleto. Guarde este e-mail: o link abaixo é o seu link de pagamento.',
          'Você receberá outro e-mail assim que o pagamento for confirmado. Se já pagou, desconsidere este aviso.',
        ],
        linkLabel: 'Pagar a inscrição',
        link: (d) => d.payUrl,
      },
    },
  },
  en: {
    greeting: (name) => `Hello, ${name}.`,
    signature: (event) => `${event} organising committee`,
    kinds: {
      processing: {
        subject: (d) => `Registration received: we are processing your payment (${d.eventName})`,
        body: (d) => [
          `We received your registration for the ${d.eventName} and Mercado Pago is processing your payment of ${d.amount}.`,
          'A boleto can take a few days to clear, and some card payments go through a review before they are approved.',
          'You will get another e-mail as soon as the payment is confirmed. There is no need to pay again.',
        ],
        linkLabel: 'Follow the payment',
        link: (d) => d.statusUrl,
      },
      confirmed: {
        subject: (d) => `Registration complete: payment confirmed (${d.eventName})`,
        body: (d) => [
          `Your payment of ${d.amount} was confirmed and your registration for the ${d.eventName} is complete.`,
          'Keep this e-mail as proof of your registration.',
        ],
        linkLabel: 'See the payment status',
        link: (d) => d.statusUrl,
      },
      failed: {
        subject: (d) => `Payment not approved (${d.eventName})`,
        body: (d) => [
          `The payment of ${d.amount} for your registration for the ${d.eventName} was not approved or was cancelled.`,
          'Your registration is still on record. To complete it, pay again through the link below, with the same or another payment method.',
        ],
        linkLabel: 'Pay the registration',
        link: (d) => d.payUrl,
      },
      reminderUnpaid: {
        subject: (d) => `Your registration for the ${d.eventName} is waiting for payment`,
        body: (d) => [
          `We received your registration for the ${d.eventName}, but we have not identified the payment of the fee yet.`,
          'To complete your registration, pay through Mercado Pago, by card or boleto, using the link below.',
          'If you have already paid, please disregard this message: the confirmation arrives by e-mail as soon as the payment is recorded.',
        ],
        linkLabel: 'Pay the registration',
        link: (d) => d.payUrl,
      },
      reminderPending: {
        subject: (d) => `Your payment for the ${d.eventName} is still pending`,
        body: (d) => [
          `The payment of ${d.amount} for your registration for the ${d.eventName} has not been confirmed by Mercado Pago yet.`,
          'If you generated a boleto and have not paid it, it needs to be paid for the registration to be completed. Once paid, a boleto can take a few days to clear.',
          'You will get another e-mail as soon as the payment is confirmed.',
        ],
        linkLabel: 'Follow the payment',
        link: (d) => d.statusUrl,
      },
      received: {
        subject: (d) => `Registration received (${d.eventName})`,
        body: (d) => [
          `We received your registration for the ${d.eventName}.`,
          'To complete it, the fee still has to be paid, now or later, through Mercado Pago, by card or boleto. Keep this e-mail: the link below is your payment link.',
          'You will get another e-mail as soon as the payment is confirmed. If you have already paid, please disregard this notice.',
        ],
        linkLabel: 'Pay the registration',
        link: (d) => d.payUrl,
      },
    },
  },
  es: {
    greeting: (name) => `Hola, ${name}.`,
    signature: (event) => `Comisión organizadora del ${event}`,
    kinds: {
      processing: {
        subject: (d) => `Inscripción recibida: estamos procesando su pago (${d.eventName})`,
        body: (d) => [
          `Recibimos su inscripción en el ${d.eventName} y Mercado Pago está procesando el pago de ${d.amount}.`,
          'Un boleto puede tardar algunos días en acreditarse, y algunos pagos con tarjeta pasan por una revisión antes de ser aprobados.',
          'Recibirá otro correo en cuanto el pago sea confirmado. No es necesario pagar de nuevo.',
        ],
        linkLabel: 'Seguir el pago',
        link: (d) => d.statusUrl,
      },
      confirmed: {
        subject: (d) => `Inscripción completada: pago confirmado (${d.eventName})`,
        body: (d) => [
          `Su pago de ${d.amount} fue confirmado y su inscripción en el ${d.eventName} está completa.`,
          'Guarde este correo como comprobante de la inscripción.',
        ],
        linkLabel: 'Ver el estado del pago',
        link: (d) => d.statusUrl,
      },
      failed: {
        subject: (d) => `Pago no aprobado (${d.eventName})`,
        body: (d) => [
          `El pago de ${d.amount} de su inscripción en el ${d.eventName} no fue aprobado o fue cancelado.`,
          'Su inscripción sigue registrada. Para completarla, realice el pago nuevamente por el enlace de abajo, con el mismo u otro medio de pago.',
        ],
        linkLabel: 'Pagar la inscripción',
        link: (d) => d.payUrl,
      },
      reminderUnpaid: {
        subject: (d) => `Su inscripción en el ${d.eventName} espera el pago`,
        body: (d) => [
          `Recibimos su inscripción en el ${d.eventName}, pero todavía no identificamos el pago de la tasa.`,
          'Para completar la inscripción, realice el pago por Mercado Pago, con tarjeta o boleto, por el enlace de abajo.',
          'Si ya pagó, ignore este mensaje: la confirmación llega por correo en cuanto el pago sea registrado.',
        ],
        linkLabel: 'Pagar la inscripción',
        link: (d) => d.payUrl,
      },
      reminderPending: {
        subject: (d) => `Su pago en el ${d.eventName} sigue pendiente`,
        body: (d) => [
          `El pago de ${d.amount} de su inscripción en el ${d.eventName} todavía no fue confirmado por Mercado Pago.`,
          'Si generó un boleto y aún no lo pagó, debe pagarlo para completar la inscripción. Una vez pagado, un boleto puede tardar algunos días en acreditarse.',
          'En cuanto el pago sea confirmado, recibirá otro correo.',
        ],
        linkLabel: 'Seguir el pago',
        link: (d) => d.statusUrl,
      },
      received: {
        subject: (d) => `Inscripción recibida (${d.eventName})`,
        body: (d) => [
          `Recibimos su inscripción en el ${d.eventName}.`,
          'Para completarla, falta el pago de la tasa, que puede hacerse ahora o después, por Mercado Pago, con tarjeta o boleto. Guarde este correo: el enlace de abajo es su enlace de pago.',
          'Recibirá otro correo en cuanto el pago sea confirmado. Si ya pagó, ignore este aviso.',
        ],
        linkLabel: 'Pagar la inscripción',
        link: (d) => d.payUrl,
      },
    },
  },
  'zh-CN': {
    greeting: (name) => `${name}，您好：`,
    signature: (event) => `${event} 组委会`,
    kinds: {
      processing: {
        subject: (d) => `已收到注册：正在处理您的付款（${d.eventName}）`,
        body: (d) => [
          `我们已收到您在 ${d.eventName} 的注册，Mercado Pago 正在处理 ${d.amount} 的付款。`,
          'Boleto 可能需要几天才能到账，部分银行卡付款在批准前需要经过审核。',
          '付款确认后，您会再收到一封邮件。无需再次付款。',
        ],
        linkLabel: '查看付款进度',
        link: (d) => d.statusUrl,
      },
      confirmed: {
        subject: (d) => `注册完成：付款已确认（${d.eventName}）`,
        body: (d) => [
          `您的 ${d.amount} 付款已确认，您在 ${d.eventName} 的注册已完成。`,
          '请保留此邮件作为注册凭证。',
        ],
        linkLabel: '查看付款状态',
        link: (d) => d.statusUrl,
      },
      failed: {
        subject: (d) => `付款未通过（${d.eventName}）`,
        body: (d) => [
          `您在 ${d.eventName} 注册的 ${d.amount} 付款未获批准或已被取消。`,
          '您的注册信息仍然保留。如需完成注册，请通过下面的链接重新付款，可使用相同或其他付款方式。',
        ],
        linkLabel: '支付注册费',
        link: (d) => d.payUrl,
      },
      reminderUnpaid: {
        subject: (d) => `您在 ${d.eventName} 的注册尚待付款`,
        body: (d) => [
          `我们已收到您在 ${d.eventName} 的注册，但尚未查到注册费的付款。`,
          '如需完成注册，请通过下面的链接在 Mercado Pago 使用银行卡或 boleto 付款。',
          '如果您已经付款，请忽略此邮件：付款登记后，您会收到确认邮件。',
        ],
        linkLabel: '支付注册费',
        link: (d) => d.payUrl,
      },
      reminderPending: {
        subject: (d) => `您在 ${d.eventName} 的付款仍未完成`,
        body: (d) => [
          `您在 ${d.eventName} 注册的 ${d.amount} 付款尚未得到 Mercado Pago 的确认。`,
          '如果您生成了 boleto 但尚未支付，需要完成支付才能完成注册。支付后，boleto 可能需要几天才能到账。',
          '付款确认后，您会再收到一封邮件。',
        ],
        linkLabel: '查看付款进度',
        link: (d) => d.statusUrl,
      },
      received: {
        subject: (d) => `已收到注册（${d.eventName}）`,
        body: (d) => [
          `我们已收到您在 ${d.eventName} 的注册。`,
          '如需完成注册，还需支付注册费。您可以现在或稍后通过 Mercado Pago 使用银行卡或 boleto 付款。请保留此邮件：下面的链接就是您的付款链接。',
          '付款确认后，您会再收到一封邮件。如果您已经付款，请忽略此通知。',
        ],
        linkLabel: '支付注册费',
        link: (d) => d.payUrl,
      },
    },
  },
};

export const EMAIL_LOCALES = Object.keys(COPY) as Locale[];

/** The form stores the UI language; anything we have no copy for reads in Portuguese. */
export function emailLocale(locale: string): Locale {
  return (EMAIL_LOCALES as string[]).includes(locale) ? (locale as Locale) : 'pt-BR';
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** The name comes from a public form: it must never be read as markup. */
export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (c) => ESCAPES[c]!);

export function renderEmail(kind: NotificationKind, locale: string, data: EmailData): Email {
  const copy = COPY[emailLocale(locale)];
  const part = copy.kinds[kind];
  const greeting = copy.greeting(data.firstName);
  const paragraphs = part.body(data);
  const link = part.link(data);
  const signature = copy.signature(data.eventName);

  const text = [greeting, ...paragraphs, `${part.linkLabel}: ${link}`, signature].join('\n\n');
  const html = [
    '<div style="font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.5; color: #1c2420; max-width: 560px;">',
    `<p>${escapeHtml(greeting)}</p>`,
    ...paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    `<p><a href="${escapeHtml(link)}" style="display: inline-block; background: #3f4f1c; color: #ffffff; text-decoration: none; font-weight: bold; padding: 12px 20px; border-radius: 6px;">${escapeHtml(part.linkLabel)}</a></p>`,
    `<p style="font-size: 13px; color: #4a564f;">${escapeHtml(link)}</p>`,
    `<p>${escapeHtml(signature)}</p>`,
    '</div>',
  ].join('\n');

  return { subject: part.subject(data), text, html };
}
