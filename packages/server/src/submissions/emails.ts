import { emailLocale, layoutEmail, type Email } from '../payments/emailTemplates';

export type SubmissionEmailKind = 'received' | 'updated' | 'withdrawn';

export interface SubmissionEmailData {
  firstName: string;
  eventName: string;
  number: number;
  title: string;
  /** Who sent or changed the paper. */
  mainAuthor: string;
  url: string;
  /** False for an author with no account on the site: the button then creates one (#292). */
  hasAccount?: boolean;
}

interface Copy {
  subject: (d: SubmissionEmailData) => string;
  body: (d: SubmissionEmailData) => string[];
  linkLabel: string;
}

interface LocaleCopy {
  greeting: (name: string) => string;
  /** For an author with no account: what to do, and the button that does it (#292). */
  noAccount: string;
  createAccount: string;
  signature: (eventName: string) => string;
  kinds: Record<SubmissionEmailKind, Copy>;
}

const COPY: Record<'pt-BR' | 'en' | 'es' | 'zh-CN', LocaleCopy> = {
  'pt-BR': {
    greeting: (name) => (name ? `Olá, ${name}.` : 'Olá.'),
    noAccount: 'Para acompanhar o trabalho, crie uma conta com este e-mail e com o seu documento (CPF ou passaporte).',
    createAccount: 'Criar conta com este e-mail',
    signature: (event) => `Comissão organizadora do ${event}`,
    kinds: {
      received: {
        subject: (d) => `Trabalho nº ${d.number} recebido (${d.eventName})`,
        body: (d) => [
          `Recebemos o trabalho "${d.title}", enviado por ${d.mainAuthor} ao ${d.eventName}. Ele recebeu o número ${d.number}.`,
          'Você recebe este aviso porque consta como autor ou autora. O trabalho aparece na área Meus trabalhos de quem tiver conta no site com este e-mail.',
          'Enquanto as submissões estiverem abertas, quem enviou o trabalho pode alterá-lo ou retirá-lo em Meus trabalhos. Os demais autores acompanham por lá.',
        ],
        linkLabel: 'Ver meus trabalhos',
      },
      updated: {
        subject: (d) => `Trabalho nº ${d.number} alterado (${d.eventName})`,
        body: (d) => [
          `O trabalho nº ${d.number}, "${d.title}", foi alterado por ${d.mainAuthor}.`,
          'Você recebe este aviso porque consta como autor ou autora. A versão atual aparece na área Meus trabalhos.',
        ],
        linkLabel: 'Ver meus trabalhos',
      },
      withdrawn: {
        subject: (d) => `Trabalho nº ${d.number} retirado (${d.eventName})`,
        body: (d) => [
          `O trabalho nº ${d.number}, "${d.title}", foi retirado por ${d.mainAuthor} e não será avaliado.`,
          'Você recebe este aviso porque constava como autor ou autora. Se foi um engano, o trabalho pode ser enviado de novo enquanto as submissões estiverem abertas.',
        ],
        linkLabel: 'Ver meus trabalhos',
      },
    },
  },
  en: {
    greeting: (name) => (name ? `Hello, ${name}.` : 'Hello.'),
    noAccount: 'To follow the paper, create an account with this e-mail and with your document (CPF or passport).',
    createAccount: 'Create an account with this e-mail',
    signature: (event) => `${event} organising committee`,
    kinds: {
      received: {
        subject: (d) => `Paper no. ${d.number} received (${d.eventName})`,
        body: (d) => [
          `We received the paper "${d.title}", sent by ${d.mainAuthor} to the ${d.eventName}. Its number is ${d.number}.`,
          'You receive this notice because you are listed as an author. The paper shows under My papers for anyone with an account on the website with this e-mail.',
          'While submissions are open, whoever sent the paper can change or withdraw it in My papers. The other authors follow it there.',
        ],
        linkLabel: 'See my papers',
      },
      updated: {
        subject: (d) => `Paper no. ${d.number} changed (${d.eventName})`,
        body: (d) => [
          `Paper no. ${d.number}, "${d.title}", was changed by ${d.mainAuthor}.`,
          'You receive this notice because you are listed as an author. The current version shows under My papers.',
        ],
        linkLabel: 'See my papers',
      },
      withdrawn: {
        subject: (d) => `Paper no. ${d.number} withdrawn (${d.eventName})`,
        body: (d) => [
          `Paper no. ${d.number}, "${d.title}", was withdrawn by ${d.mainAuthor} and will not be reviewed.`,
          'You receive this notice because you were listed as an author. If it was a mistake, the paper can be sent again while submissions are open.',
        ],
        linkLabel: 'See my papers',
      },
    },
  },
  es: {
    greeting: (name) => (name ? `Hola, ${name}.` : 'Hola.'),
    noAccount: 'Para seguir el trabajo, cree una cuenta con este correo y con su documento (CPF o pasaporte).',
    createAccount: 'Crear una cuenta con este correo',
    signature: (event) => `Comisión organizadora del ${event}`,
    kinds: {
      received: {
        subject: (d) => `Trabajo n.º ${d.number} recibido (${d.eventName})`,
        body: (d) => [
          `Recibimos el trabajo "${d.title}", enviado por ${d.mainAuthor} al ${d.eventName}. Recibió el número ${d.number}.`,
          'Usted recibe este aviso porque figura como autor o autora. El trabajo aparece en Mis trabajos para quien tenga cuenta en el sitio con este correo.',
          'Mientras los envíos estén abiertos, quien envió el trabajo puede modificarlo o retirarlo en Mis trabajos. Los demás autores lo siguen allí.',
        ],
        linkLabel: 'Ver mis trabajos',
      },
      updated: {
        subject: (d) => `Trabajo n.º ${d.number} modificado (${d.eventName})`,
        body: (d) => [
          `El trabajo n.º ${d.number}, "${d.title}", fue modificado por ${d.mainAuthor}.`,
          'Usted recibe este aviso porque figura como autor o autora. La versión actual aparece en Mis trabajos.',
        ],
        linkLabel: 'Ver mis trabajos',
      },
      withdrawn: {
        subject: (d) => `Trabajo n.º ${d.number} retirado (${d.eventName})`,
        body: (d) => [
          `El trabajo n.º ${d.number}, "${d.title}", fue retirado por ${d.mainAuthor} y no será evaluado.`,
          'Usted recibe este aviso porque figuraba como autor o autora. Si fue un error, el trabajo puede enviarse de nuevo mientras los envíos estén abiertos.',
        ],
        linkLabel: 'Ver mis trabajos',
      },
    },
  },
  'zh-CN': {
    greeting: (name) => (name ? `${name}，您好。` : '您好。'),
    noAccount: '如需跟进稿件，请使用此电子邮箱和您的证件（CPF 或护照）创建账户。',
    createAccount: '使用此电子邮箱创建账户',
    signature: (event) => `${event} 组委会`,
    kinds: {
      received: {
        subject: (d) => `已收到第 ${d.number} 号论文（${d.eventName}）`,
        body: (d) => [
          `我们已收到 ${d.mainAuthor} 向 ${d.eventName} 提交的论文“${d.title}”，编号为 ${d.number}。`,
          '您收到此通知是因为您被列为作者。使用此邮箱在网站注册账户后，可在“我的论文”中查看该论文。',
          '在投稿开放期间，论文的提交者可以在“我的论文”中修改或撤回论文，其他作者可在那里查看。',
        ],
        linkLabel: '查看我的论文',
      },
      updated: {
        subject: (d) => `第 ${d.number} 号论文已修改（${d.eventName}）`,
        body: (d) => [
          `第 ${d.number} 号论文“${d.title}”已由 ${d.mainAuthor} 修改。`,
          '您收到此通知是因为您被列为作者。当前版本显示在“我的论文”中。',
        ],
        linkLabel: '查看我的论文',
      },
      withdrawn: {
        subject: (d) => `第 ${d.number} 号论文已撤回（${d.eventName}）`,
        body: (d) => [
          `第 ${d.number} 号论文“${d.title}”已由 ${d.mainAuthor} 撤回，将不再评审。`,
          '您收到此通知是因为您曾被列为作者。如果是误操作，可以在投稿开放期间重新提交该论文。',
        ],
        linkLabel: '查看我的论文',
      },
    },
  },
};

export function renderSubmissionEmail(kind: SubmissionEmailKind, locale: string, data: SubmissionEmailData): Email {
  const copy = COPY[emailLocale(locale)];
  const part = copy.kinds[kind];
  return {
    subject: part.subject(data),
    ...layoutEmail({
      greeting: copy.greeting(data.firstName),
      // A withdrawn paper is gone: no reason to send someone to create an account for it.
      paragraphs: data.hasAccount !== false || kind === 'withdrawn' ? part.body(data) : [...part.body(data), copy.noAccount],
      linkLabel: data.hasAccount !== false || kind === 'withdrawn' ? part.linkLabel : copy.createAccount,
      link: data.url,
      signature: copy.signature(data.eventName),
    }),
  };
}

export interface AuthorIssueEmailData {
  firstName: string;
  eventName: string;
  number: number;
  title: string;
  /** The author whose account says they are someone else than the line in the paper says. */
  authorName: string;
  url: string;
}

const AUTHOR_ISSUE: Record<'pt-BR' | 'en' | 'es' | 'zh-CN', { subject: (d: AuthorIssueEmailData) => string; body: (d: AuthorIssueEmailData) => string[]; linkLabel: string }> = {
  'pt-BR': {
    subject: (d) => `Trabalho nº ${d.number}: confira o documento de ${d.authorName} (${d.eventName})`,
    body: (d) => [
      `${d.authorName} criou uma conta no site com um documento diferente do que foi informado no trabalho nº ${d.number}, "${d.title}".`,
      'Para corrigir, abra o trabalho e salve de novo. Até lá, essa pessoa não vê o trabalho na conta dela.',
    ],
    linkLabel: 'Ver meus trabalhos',
  },
  en: {
    subject: (d) => `Paper no. ${d.number}: check the document of ${d.authorName} (${d.eventName})`,
    body: (d) => [
      `${d.authorName} created an account on the website with a document different from the one entered in paper no. ${d.number}, "${d.title}".`,
      'To correct it, open the paper and save it again. Until then, this person does not see the paper in their account.',
    ],
    linkLabel: 'See my papers',
  },
  es: {
    subject: (d) => `Trabajo n.º ${d.number}: revise el documento de ${d.authorName} (${d.eventName})`,
    body: (d) => [
      `${d.authorName} creó una cuenta en el sitio con un documento distinto del indicado en el trabajo n.º ${d.number}, "${d.title}".`,
      'Para corregirlo, abra el trabajo y guárdelo de nuevo. Hasta entonces, esa persona no ve el trabajo en su cuenta.',
    ],
    linkLabel: 'Ver mis trabajos',
  },
  'zh-CN': {
    subject: (d) => `第 ${d.number} 号稿件：请核对 ${d.authorName} 的证件（${d.eventName}）`,
    body: (d) => [
      `${d.authorName} 在网站创建账户时使用的证件，与第 ${d.number} 号稿件“${d.title}”中填写的不同。`,
      '如需更正，请打开稿件并重新保存。在此之前，此人在其账户中看不到该稿件。',
    ],
    linkLabel: '查看我的稿件',
  },
};

/** To whoever sent a paper: an author signed up saying they are someone else than the line says (ADR-010). Never carries a document. */
export function renderAuthorIssueEmail(locale: string, data: AuthorIssueEmailData): Email {
  const key = emailLocale(locale);
  const part = AUTHOR_ISSUE[key];
  return {
    subject: part.subject(data),
    ...layoutEmail({
      greeting: COPY[key].greeting(data.firstName),
      paragraphs: part.body(data),
      linkLabel: part.linkLabel,
      link: data.url,
      signature: COPY[key].signature(data.eventName),
    }),
  };
}

const ORGANISER_COPY: Record<SubmissionEmailKind, (d: OrganiserEmailData) => { subject: string; body: string[] }> = {
  received: (d) => ({
    subject: `Novo trabalho nº ${d.number}: ${d.title}`,
    body: [
      `${d.mainAuthor} enviou um trabalho ao ${d.eventName}.`,
      `Nº ${d.number} · ${d.modality} · ${d.area}`,
      `Título: ${d.title}`,
      `Autores: ${d.authors}`,
    ],
  }),
  updated: (d) => ({
    subject: `Trabalho nº ${d.number} alterado: ${d.title}`,
    body: [
      `${d.mainAuthor} alterou o trabalho nº ${d.number} do ${d.eventName}.`,
      `${d.modality} · ${d.area}`,
      `Título: ${d.title}`,
      `Autores: ${d.authors}`,
    ],
  }),
  withdrawn: (d) => ({
    subject: `Trabalho nº ${d.number} retirado: ${d.title}`,
    body: [`${d.mainAuthor} retirou o trabalho nº ${d.number}, "${d.title}", do ${d.eventName}.`],
  }),
};

export interface OrganiserEmailData extends SubmissionEmailData {
  modality: string;
  area: string;
  /** "Maria Souza; João Lima" */
  authors: string;
}

/** The notice to the organisers, in Portuguese: the committee's working language. */
export function renderOrganiserEmail(kind: SubmissionEmailKind, data: OrganiserEmailData): Email {
  const part = ORGANISER_COPY[kind](data);
  return {
    subject: part.subject,
    ...layoutEmail({
      greeting: data.firstName ? `Olá, ${data.firstName}.` : 'Olá.',
      paragraphs: part.body,
      linkLabel: 'Abrir a área da organização',
      link: data.url,
      signature: `Sistema de submissões do ${data.eventName}`,
    }),
  };
}

export const MODALITY_NAMES: Record<string, string> = {
  ARTIGO: 'Artigo científico',
  RESUMO_EXPANDIDO: 'Resumo expandido',
};
