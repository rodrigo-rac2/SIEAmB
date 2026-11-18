import { useEvent } from '../../contexts/EventContext';

/** The account pages live under the edition, so they keep its menu and colours. */
export function useAccountPaths() {
  const { event } = useEvent();
  const base = `/${event?.slug ?? ''}`;
  return {
    /** False until the edition is known: the paths below are not usable before that. */
    ready: Boolean(event),
    slug: event?.slug ?? '',
    login: `${base}/conta/entrar`,
    signup: `${base}/conta/criar`,
    recover: `${base}/conta/recuperar`,
    area: `${base}/minha-area`,
    register: `${base}/inscricoes/nova`,
    pay: (token: string) => `${base}/inscricoes/pagar?t=${token}`,
    payment: (id: string) => `${base}/inscricoes/pagamento?p=${id}`,
  };
}
