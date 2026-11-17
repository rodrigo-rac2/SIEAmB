/** A CPF with valid check digits, different on every run. */
export function randomCpf(): string {
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (new Set(digits).size === 1) digits[0] = (digits[0]! + 1) % 10;
  const check = (base: number[]) => {
    const sum = base.reduce((acc, d, i) => acc + d * (base.length + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = check(digits);
  const d2 = check([...digits, d1]);
  return [...digits, d1, d2].join('');
}
