import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildManifest, parseSignatureHeader, verifySignature } from './signature';

const SECRET = 'a'.repeat(64);
const sign = (manifest: string, secret = SECRET) =>
  createHmac('sha256', secret).update(manifest).digest('hex');

describe('parseSignatureHeader', () => {
  it('reads ts and v1', () => {
    const v1 = 'ab'.repeat(32);
    expect(parseSignatureHeader(`ts=1704908010,v1=${v1}`)).toEqual({ ts: '1704908010', v1 });
  });

  it('accepts any order, spaces and an upper-case digest', () => {
    const v1 = 'AB'.repeat(32);
    expect(parseSignatureHeader(` v1=${v1} , ts=1704908010 `)).toEqual({
      ts: '1704908010',
      v1: v1.toLowerCase(),
    });
  });

  it.each([
    ['null', null],
    ['empty', ''],
    ['no v1', 'ts=1704908010'],
    ['no ts', `v1=${'ab'.repeat(32)}`],
    ['short digest', 'ts=1704908010,v1=abcd'],
    ['non-hex digest', `ts=1704908010,v1=${'zz'.repeat(32)}`],
    ['non-numeric ts', `ts=soon,v1=${'ab'.repeat(32)}`],
    ['no separators', 'garbage'],
  ])('rejects a header with %s', (_name, header) => {
    expect(parseSignatureHeader(header)).toBeNull();
  });
});

describe('buildManifest', () => {
  it('lower-cases the order id, which Mercado Pago sends in upper case', () => {
    expect(buildManifest({ dataId: 'ORDTST01ABC', requestId: 'req-1', ts: '17' })).toBe(
      'id:ordtst01abc;request-id:req-1;ts:17;',
    );
  });

  it('leaves out the parts the notification did not carry', () => {
    expect(buildManifest({ dataId: null, requestId: 'req-1', ts: '17' })).toBe(
      'request-id:req-1;ts:17;',
    );
    expect(buildManifest({ dataId: 'ORD1', requestId: null, ts: '17' })).toBe('id:ord1;ts:17;');
  });
});

describe('verifySignature', () => {
  const parts = { dataId: 'ORDTST01ABC', requestId: 'req-1' };
  const ts = '1704908010';
  const valid = { ts, v1: sign('id:ordtst01abc;request-id:req-1;ts:1704908010;') };

  it('accepts a digest made with our secret', () => {
    expect(verifySignature(valid, parts, SECRET)).toBe(true);
  });

  it('rejects another secret', () => {
    expect(verifySignature(valid, parts, 'b'.repeat(64))).toBe(false);
  });

  it('rejects a replay of the digest on another order', () => {
    expect(verifySignature(valid, { ...parts, dataId: 'ORDTST01XYZ' }, SECRET)).toBe(false);
  });

  it('rejects a changed timestamp or request id', () => {
    expect(verifySignature({ ...valid, ts: '1704908011' }, parts, SECRET)).toBe(false);
    expect(verifySignature(valid, { ...parts, requestId: 'req-2' }, SECRET)).toBe(false);
  });

  it('does not throw on a digest of the wrong length', () => {
    expect(verifySignature({ ts, v1: 'abcd' }, parts, SECRET)).toBe(false);
  });
});
