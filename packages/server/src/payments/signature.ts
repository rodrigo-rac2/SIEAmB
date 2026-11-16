import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ParsedSignature {
  ts: string;
  v1: string;
}

export interface SignedParts {
  /** `data.id` from the notification URL. Mercado Pago signs it in lower case. */
  dataId: string | null;
  /** `x-request-id` header. */
  requestId: string | null;
  ts: string;
}

/**
 * Parses the `x-signature` header, e.g. `ts=1704908010,v1=618c85…`.
 * Returns null when either part is missing or `v1` is not a SHA-256 hex digest.
 */
export function parseSignatureHeader(header: string | null | undefined): ParsedSignature | null {
  if (!header) return null;
  const parts = new Map<string, string>();
  for (const piece of header.split(',')) {
    const separator = piece.indexOf('=');
    if (separator === -1) continue;
    parts.set(piece.slice(0, separator).trim(), piece.slice(separator + 1).trim());
  }
  const ts = parts.get('ts');
  const v1 = parts.get('v1');
  if (!ts || !v1) return null;
  if (!/^\d+$/.test(ts) || !/^[0-9a-f]{64}$/i.test(v1)) return null;
  return { ts, v1: v1.toLowerCase() };
}

/**
 * The string Mercado Pago signs: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
 * A part the notification did not carry is left out of the template.
 */
export function buildManifest({ dataId, requestId, ts }: SignedParts): string {
  let manifest = '';
  if (dataId) manifest += `id:${dataId.toLowerCase()};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  return manifest;
}

export function computeSignature(manifest: string, secret: string): string {
  return createHmac('sha256', secret).update(manifest).digest('hex');
}

/** Constant-time check of the `v1` digest against our own HMAC of the manifest. */
export function verifySignature(
  signature: ParsedSignature,
  parts: Omit<SignedParts, 'ts'>,
  secret: string,
): boolean {
  const expected = Buffer.from(
    computeSignature(buildManifest({ ...parts, ts: signature.ts }), secret),
    'hex',
  );
  const received = Buffer.from(signature.v1, 'hex');
  return expected.length === received.length && timingSafeEqual(expected, received);
}
