import { describe, expect, it } from 'vitest';
import {
  computeEntryBuffer,
  formatEntryBufferLabel,
  srEntryFromLevel,
} from './tradePlanEntryBuffer';

const PRICE = 2.1;

describe('computeEntryBuffer', () => {
  it('Test 1: high ATR → capped at 0.50%', () => {
    const result = computeEntryBuffer(PRICE, 0.08);
    expect(result.entryBufferUsed).toBeCloseTo(0.0105, 6);
    expect(result.entryBufferSource).toBe('ATR_CAPPED');
    expect(result.entryBufferPct).toBeCloseTo(0.5, 4);
    expect(formatEntryBufferLabel(result.entryBufferPct, result.entryBufferSource)).toBe(
      'Buffer: 0.50% (ATR capped)',
    );
  });

  it('Test 2: mid ATR → ATR-based within range', () => {
    const result = computeEntryBuffer(PRICE, 0.03);
    expect(result.entryBufferUsed).toBeCloseTo(0.0075, 6);
    expect(result.entryBufferSource).toBe('ATR_BASED');
    expect(formatEntryBufferLabel(result.entryBufferPct, result.entryBufferSource)).toBe(
      'Buffer: 0.36% (ATR-based)',
    );
  });

  it('Test 3: low ATR → floor at 0.30%', () => {
    const result = computeEntryBuffer(PRICE, 0.005);
    expect(result.entryBufferUsed).toBeCloseTo(0.0063, 6);
    expect(result.entryBufferSource).toBe('MIN_FLOOR');
    expect(formatEntryBufferLabel(result.entryBufferPct, result.entryBufferSource)).toBe(
      'Buffer: 0.30% (floor)',
    );
  });
});

describe('srEntryFromLevel', () => {
  it('SHORT entry offsets below resistance by entryBuffer', () => {
    const { entry, entryBufferUsed } = srEntryFromLevel('SHORT', PRICE, PRICE, 0.08);
    expect(entryBufferUsed).toBeCloseTo(0.0105, 6);
    expect(entry).toBeCloseTo(PRICE * (1 - 0.0105 / PRICE), 6);
  });

  it('LONG entry offsets above support by entryBuffer', () => {
    const { entry, entryBufferUsed } = srEntryFromLevel('LONG', PRICE, PRICE, 0.03);
    expect(entryBufferUsed).toBeCloseTo(0.0075, 6);
    expect(entry).toBeCloseTo(PRICE * (1 + 0.0075 / PRICE), 6);
  });
});
