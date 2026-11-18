import { emailLocale, layoutEmail, type Email } from '../payments/emailTemplates';

export type AccountEmailKind =
  /** Confirm the address and choose a password. */
  | 'confirm'
  /** Someone asked to create an account on an address that already has one. */
  | 'exists'
  /** Choose a new password. */
  | 'recovery'
  /** "Is this registration yours?", sent to the registration's address (#209). */
  | 'link';

export interface AccountEmailData {
  /** First name, or empty when we do not know it. */
  firstName: string;
  eventName: string;
  /** Where the button goes. */
  url: string;
  /** For `link`: the masked address of the account asking for the registration. */
  accountEmail?: string;
}

interface Copy {
  subject: (d: AccountEmailData) => string;
  body: (d: AccountEmailData) => string[];
  linkLabel: string;
}

interface LocaleCopy {
  greeting: (name: string) => string;
  signature: (eventName: string) => string;
  kinds: Record<AccountEmailKind, Copy>;
}

const COPY: Record<'pt-BR' | 'en' | 'es' | 'zh-CN', LocaleCopy> = {
  'pt-BR': {
    greeting: (name) => (name ? `Olá, ${name}.` : 'Olá.'),
    signature: (event) => `Comissão organizadora do ${event}`,
    kinds: {
      confirm: {
        subject: (d) => `Confirme seu e-mail para criar sua conta (${d.eventName})`,
        body: (d) => [
          `Recebemos um pedido para criar uma conta no site do ${d.eventName} com este e-mail.`,
          'Para confirmar o e-mail e escolher sua senha, use o link abaixo. Se ele já tiver expirado, peça outro na página de entrada do site.',
          'Se não foi você, ignore esta mensagem: nenhuma conta será ativada.',
        ],
        linkLabel: 'Confirmar e-mail e criar senha',
      },
      exists: {
        subject: (d) => `Você já tem uma conta (${d.eventName})`,
        body: (d) => [
          `Recebemos um pedido para criar uma conta no site do ${d.eventName} com este e-mail, mas ele já tem uma conta.`,
          'Para entrar, use o link abaixo. Se esqueceu a senha, a página de entrada tem a opção "Esqueci minha senha".',
          'Se não foi você, ignore esta mensagem: nada foi alterado.',
        ],
        linkLabel: 'Entrar na minha conta',
      },
      recovery: {
        subject: (d) => `Crie uma nova senha (${d.eventName})`,
        body: (d) => [
          `Recebemos um pedido para criar uma nova senha da sua conta no site do ${d.eventName}.`,
          'Use o link abaixo para escolher a nova senha. Se ele já tiver expirado, peça outro na página de entrada do site.',
          'Se não foi você, ignore esta mensagem: sua senha continua a mesma.',
        ],
        linkLabel: 'Criar nova senha',
      },
      link: {
        subject: (d) => `Esta inscrição é sua? (${d.eventName})`,
        body: (d) => [
          `Uma conta com o e-mail ${d.accountEmail} informou o mesmo CPF ou passaporte da inscrição feita com este e-mail no ${d.eventName}, e pediu para reunir as duas.`,
          'Se a conta é sua, confirme pelo link abaixo, que vale por 48 horas. A inscrição e o pagamento passam a aparecer nessa conta.',
          'Se você não reconhece o pedido, ignore esta mensagem: a inscrição continua como está.',
        ],
        linkLabel: 'Sim, a inscrição é minha',
      },
    },
  },
  en: {
    greeting: (name) => (name ? `Hello, ${name}.` : 'Hello.'),
    signature: (event) => `${event} organising committee`,
    kinds: {
      confirm: {
        subject: (d) => `Confirm your e-mail to create your account (${d.eventName})`,
        body: (d) => [
          `We received a request to create an account on the ${d.eventName} website with this e-mail.`,
          'To confirm the e-mail and choose your password, use the link below. If it has already expired, ask for another one on the login page of the website.',
          'If it was not you, ignore this message: no account will be activated.',
        ],
        linkLabel: 'Confirm e-mail and create password',
      },
      exists: {
        subject: (d) => `You already have an account (${d.eventName})`,
        body: (d) => [
          `We received a request to create an account on the ${d.eventName} website with this e-mail, but it already has one.`,
          'To log in, use the link below. If you forgot your password, the login page has a "Forgot my password" option.',
          'If it was not you, ignore this message: nothing was changed.',
        ],
        linkLabel: 'Log in to my account',
      },
      recovery: {
        subject: (d) => `Create a new password (${d.eventName})`,
        body: (d) => [
          `We received a request to create a new password for your account on the ${d.eventName} website.`,
          'Use the link below to choose the new password. If it has already expired, ask for another one on the login page of the website.',
          'If it was not you, ignore this message: your password stays the same.',
        ],
        linkLabel: 'Create new password',
      },
      link: {
        subject: (d) => `Is this registration yours? (${d.eventName})`,
        body: (d) => [
          `An account with the e-mail ${d.accountEmail} gave the same CPF or passport as the registration made with this e-mail for the ${d.eventName}, and asked to bring the two together.`,
          'If the account is yours, confirm through the link below, valid for 48 hours. The registration and its payment will then show in that account.',
          'If you do not recognise the request, ignore this message: the registration stays as it is.',
        ],
        linkLabel: 'Yes, the registration is mine',
      },
    },
  },
  es: {
    greeting: (name) => (name ? `Hola, ${name}.` : 'Hola.'),
    signature: (event) => `Comisión organizadora del ${event}`,
    kinds: {
      confirm: {
        subject: (d) => `Confirme su correo para crear su cuenta (${d.eventName})`,
        body: (d) => [
          `Recibimos una solicitud para crear una cuenta en el sitio del ${d.eventName} con este correo.`,
          'Para confirmar el correo y elegir su contraseña, use el enlace de abajo. Si ya expiró, pida otro en la página de entrada del sitio.',
          'Si no fue usted, ignore este mensaje: ninguna cuenta será activada.',
        ],
        linkLabel: 'Confirmar correo y crear contraseña',
      },
      exists: {
        subject: (d) => `Usted ya tiene una cuenta (${d.eventName})`,
        body: (d) => [
          `Recibimos una solicitud para crear una cuenta en el sitio del ${d.eventName} con este correo, pero ya tiene una.`,
          'Para entrar, use el enlace de abajo. Si olvidó la contraseña, la página de entrada tiene la opción "Olvidé mi contraseña".',
          'Si no fue usted, ignore este mensaje: nada fue modificado.',
        ],
        linkLabel: 'Entrar en mi cuenta',
      },
      recovery: {
        subject: (d) => `Cree una nueva contraseña (${d.eventName})`,
        body: (d) => [
          `Recibimos una solicitud para crear una nueva contraseña de su cuenta en el sitio del ${d.eventName}.`,
          'Use el enlace de abajo para elegir la nueva contraseña. Si ya expiró, pida otro en la página de entrada del sitio.',
          'Si no fue usted, ignore este mensaje: su contraseña sigue siendo la misma.',
        ],
        linkLabel: 'Crear nueva contraseña',
      },
      link: {
        subject: (d) => `¿Esta inscripción es suya? (${d.eventName})`,
        body: (d) => [
          `Una cuenta con el correo ${d.accountEmail} informó el mismo CPF o pasaporte de la inscripción hecha con este correo en el ${d.eventName}, y pidió reunir las dos.`,
          'Si la cuenta es suya, confirme por el enlace de abajo, válido por 48 horas. La inscripción y el pago pasarán a aparecer en esa cuenta.',
          'Si no reconoce la solicitud, ignore este mensaje: la inscripción sigue como está.',
        ],
        linkLabel: 'Sí, la inscripción es mía',
      },
    },
  },
  'zh-CN': {
    greeting: (name) => (name ? `${name}，您好。` : '您好。'),
    signature: (event) => `${event} 组委会`,
    kinds: {
      confirm: {
        subject: (d) => `请确认您的邮箱以创建账户（${d.eventName}）`,
        body: (d) => [
          `我们收到了使用此邮箱在 ${d.eventName} 网站创建账户的请求。`,
          '请通过下面的链接确认邮箱并设置密码。如果链接已过期，请在网站登录页面重新申请。',
          '如果不是您本人操作，请忽略此邮件：不会激活任何账户。',
        ],
        linkLabel: '确认邮箱并设置密码',
      },
      exists: {
        subject: (d) => `您已经有账户了（${d.eventName}）`,
        body: (d) => [
          `我们收到了使用此邮箱在 ${d.eventName} 网站创建账户的请求，但该邮箱已有账户。`,
          '请通过下面的链接登录。如果忘记了密码，登录页面有“忘记密码”选项。',
          '如果不是您本人操作，请忽略此邮件：没有任何更改。',
        ],
        linkLabel: '登录我的账户',
      },
      recovery: {
        subject: (d) => `设置新密码（${d.eventName}）`,
        body: (d) => [
          `我们收到了为您在 ${d.eventName} 网站的账户设置新密码的请求。`,
          '请通过下面的链接设置新密码。如果链接已过期，请在网站登录页面重新申请。',
          '如果不是您本人操作，请忽略此邮件：您的密码保持不变。',
        ],
        linkLabel: '设置新密码',
      },
      link: {
        subject: (d) => `这是您的注册吗？（${d.eventName}）`,
        body: (d) => [
          `邮箱为 ${d.accountEmail} 的账户填写了与此邮箱在 ${d.eventName} 的注册相同的 CPF 或护照，并请求将两者关联。`,
          '如果该账户是您的，请通过下面的链接确认，链接 48 小时内有效。注册和付款将显示在该账户中。',
          '如果您不认识此请求，请忽略此邮件：注册保持不变。',
        ],
        linkLabel: '是的，这是我的注册',
      },
    },
  },
};

export function renderAccountEmail(
  kind: AccountEmailKind,
  locale: string,
  input: AccountEmailData,
): Email {
  const data: AccountEmailData = { accountEmail: '', ...input };
  const copy = COPY[emailLocale(locale)];
  const part = copy.kinds[kind];
  return {
    subject: part.subject(data),
    ...layoutEmail({
      greeting: copy.greeting(data.firstName),
      paragraphs: part.body(data),
      linkLabel: part.linkLabel,
      link: data.url,
      signature: copy.signature(data.eventName),
    }),
  };
}

/** `paula.nunes@outlook.com` → `p•••@outlook.com`: enough to recognise, not enough to learn. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  return `${email[0]}•••${email.slice(at)}`;
}
