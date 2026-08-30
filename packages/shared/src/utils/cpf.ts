/** Strip everything that is not a digit. */
export function normalizeCpf(input: string): string {
  return input.replace(/\D/g, '');
}

/** Format 11 digits as 000.000.000-00; returns input unchanged if not 11 digits. */
export function formatCpf(input: string): string {
  const digits = normalizeCpf(input);
  if (digits.length !== 11) return input;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** Validate CPF check digits (mod-11). Rejects known invalid repeated-digit CPFs. */
export function isValidCpf(input: string): boolean {
  const cpf = normalizeCpf(input);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigit = (sliceLen: number): number => {
    let sum = 0;
    for (let i = 0; i < sliceLen; i++) {
      sum += Number(cpf[i]) * (sliceLen + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return calcDigit(9) === Number(cpf[9]) && calcDigit(10) === Number(cpf[10]);
}
