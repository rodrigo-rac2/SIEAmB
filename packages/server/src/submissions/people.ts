import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Suggestions of people for the author list never carry an e-mail address: the
 * page gets a masked hint to tell two people apart and a sealed reference that
 * only the server can open. Otherwise anyone with an account could list the
 * addresses of everybody in the system three letters at a time.
 */
const key = (pepper: string): Buffer => createHash('sha256').update(`${pepper}:people-ref`).digest();

export function sealEmail(email: string, pepper: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(pepper), iv);
  const sealed = Buffer.concat([cipher.update(email.toLowerCase(), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString('base64url');
}

/** The address behind a reference, or null when it was not sealed by us. */
export function openEmail(ref: string, pepper: string): string | null {
  try {
    const raw = Buffer.from(ref, 'base64url');
    if (raw.length < 12 + 16 + 3) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(pepper), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** `r•••@ufcg.edu.br`: enough to recognise a colleague, not enough to write to them. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  return `${email[0]}•••${email.slice(at)}`;
}
