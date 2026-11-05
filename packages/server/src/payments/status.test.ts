import { describe, expect, it } from 'vitest';
import { mapOrderStatus } from './status';

describe('mapOrderStatus', () => {
  it.each([
    ['created', 'created', 'CREATED'],
    ['processed', 'accredited', 'APPROVED'],
    ['processed', 'partially_refunded', 'APPROVED'],
    ['action_required', 'waiting_capture', 'PENDING'],
    ['processing', 'in_process', 'PENDING'],
    ['processing', 'pending_review_manual', 'PENDING'],
    ['failed', 'rejected_by_issuer', 'REJECTED'],
    ['failed', 'high_risk', 'REJECTED'],
    ['refunded', 'refunded', 'REFUNDED'],
    ['canceled', 'canceled', 'CANCELLED'],
    ['expired', 'expired', 'CANCELLED'],
  ])('%s / %s → %s', (status, detail, expected) => {
    expect(mapOrderStatus(status, detail)).toBe(expected);
  });

  it.each([
    ['processed', undefined],
    ['processed', null],
    ['processed', 'something_new'],
    ['PROCESSED', 'accredited'],
    ['approved', 'accredited'],
    ['', ''],
  ])('never confirms a payment on %s / %s', (status, detail) => {
    expect(mapOrderStatus(status, detail)).toBeNull();
  });
});
