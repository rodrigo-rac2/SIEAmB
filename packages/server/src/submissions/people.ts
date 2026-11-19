import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Suggestions of people for the author list never carry an e-mail address: the
 * page gets a masked hint to tell two people apart and a sealed reference that
 * only the server can open. Otherwise anyone with an account could list the
 * addresses of everybody in the system three letters at a time.
 */
const key = (pepper: string): Buffer => createHash('sha256').update(`${pepper}:people-ref`).digest();

/** Who a reference was made for: it opens for nobody else, in no other edition, and not for ever. */
export interface RefBinding {
  userId: string;
  eventId: string;
  now: Date;
}

/** Long enough to write a paper in one sitting and come back to it the next morning. */
export const REF_TTL_MS = 24 * 60 * 60 * 1000;

export function sealEmail(email: string, pepper: string, binding: RefBinding): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(pepper), iv);
  // The address, with who asked for it, where, and until when (ADR-010): a reference that
  // leaks, or is kept, names a person to nobody but the account that searched.
  const payload = JSON.stringify({ e: email.toLowerCase(), u: binding.userId, v: binding.eventId, x: binding.now.getTime() + REF_TTL_MS });
  const sealed = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString('base64url');
}

/**
 * The address behind a reference, or null when it was not sealed by us, was sealed for
 * another account or another edition, or is past its time.
 */
export function openEmail(ref: string, pepper: string, binding: RefBinding): string | null {
  try {
    const raw = Buffer.from(ref, 'base64url');
    if (raw.length < 12 + 16 + 3) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(pepper), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const payload = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')) as Record<string, unknown>;
    if (typeof payload.e !== 'string' || payload.u !== binding.userId || payload.v !== binding.eventId) return null;
    if (typeof payload.x !== 'number' || payload.x < binding.now.getTime()) return null;
    return payload.e;
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
