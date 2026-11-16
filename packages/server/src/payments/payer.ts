/** What we tell Mercado Pago about the buyer, beyond the e-mail (#191). */
export interface PayerData {
  firstName?: string;
  lastName?: string;
  cpf?: string;
}

/** CPF check digits (mod 11). The row is written by the browser, so the form's own check cannot be trusted here. */
export function isValidCpf(input: string): boolean {
  const cpf = input.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(cpf[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

/**
 * The name as a card would carry it: accents and cedillas folded to plain letters
 * (José → Jose, Conceição → Conceicao), anything else that is not a Latin letter,
 * an apostrophe or a hyphen dropped (#198). Only for what goes to Mercado Pago.
 */
const clean = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[\u00df]/g, 'ss')
    .replace(/\u00f8/g, 'o')
    .replace(/\u00d8/g, 'O')
    .replace(/\u0142/g, 'l')
    .replace(/\u0141/g, 'L')
    .replace(/[^A-Za-z' -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Splits the full name into first name and the rest, and keeps the CPF only when
 * its check digits are right. Anything doubtful is left out: an order with less
 * buyer data still works, one with data Mercado Pago rejects does not.
 */
export function payerData(fullName: string | null | undefined, cpf: string | null | undefined): PayerData {
  const data: PayerData = {};
  const words = clean(fullName ?? '').split(' ').filter(Boolean);
  if (words.length > 0) {
    data.firstName = words[0]!.slice(0, 60);
    const rest = words.slice(1).join(' ').slice(0, 100);
    if (rest) data.lastName = rest;
  }
  const digits = (cpf ?? '').replace(/\D/g, '');
  if (isValidCpf(digits)) data.cpf = digits;
  return data;
}
