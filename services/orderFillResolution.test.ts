import { describe, expect, it } from 'vitest';
import {
  formatFillAuditNote,
  resolveActualEntryPrice,
} from './orderFillResolution';

describe('resolveActualEntryPrice', () => {
  it('LONG — order > market: ghi nhận giá market (không dùng limit cao hơn thực tế)', () => {
    const result = resolveActualEntryPrice('LONG', 100, 98);
    expect(result).toEqual({
      orderEntryPrice: 100,
      marketPriceAtFill: 98,
      actualEntryPrice: 98,
      entryAdjusted: true,
    });
    expect(formatFillAuditNote(result!)).toContain('adjusted');
  });

  it('LONG — order <= market: giữ giá order (không điều chỉnh)', () => {
    const result = resolveActualEntryPrice('LONG', 100, 102);
    expect(result).toEqual({
      orderEntryPrice: 100,
      marketPriceAtFill: 102,
      actualEntryPrice: 100,
      entryAdjusted: false,
    });
  });

  it('SHORT — order < market: ghi nhận giá market (không dùng limit thấp hơn thực tế)', () => {
    const result = resolveActualEntryPrice('SHORT', 100, 102);
    expect(result).toEqual({
      orderEntryPrice: 100,
      marketPriceAtFill: 102,
      actualEntryPrice: 102,
      entryAdjusted: true,
    });
    expect(formatFillAuditNote(result!)).toContain('adjusted');
  });

  it('SHORT — order >= market: giữ giá order (không điều chỉnh)', () => {
    const result = resolveActualEntryPrice('SHORT', 100, 98);
    expect(result).toEqual({
      orderEntryPrice: 100,
      marketPriceAtFill: 98,
      actualEntryPrice: 100,
      entryAdjusted: false,
    });
  });

  it('returns null for invalid prices', () => {
    expect(resolveActualEntryPrice('LONG', 0, 100)).toBeNull();
    expect(resolveActualEntryPrice('LONG', 100, NaN)).toBeNull();
  });
});
