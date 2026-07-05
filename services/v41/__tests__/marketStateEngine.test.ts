import { describe, expect, it } from 'vitest';
import {
  calculateMarketState,
  type MarketStateInput,
} from '../marketStateEngine';
import type { MarketState } from '../types';

type Row = {
  desc: string;
  params: MarketStateInput;
  expected: MarketState;
};

const vol0 = 0 as const;
const vol20 = 20 as const;

describe('calculateMarketState — validation matrix (27 rows)', () => {
  const matrix: Row[] = [
    // NEUTRAL
    {
      desc: 'NEUTRAL → Transition',
      params: { trendStrength: 60, trendExhaustion: 30, trendDirection: 'NEUTRAL', volumeDivergencePts: vol0 },
      expected: 'Transition',
    },
    // BULL low TS
    {
      desc: 'BULL TS 0-24 → Transition',
      params: { trendStrength: 15, trendExhaustion: 50, trendDirection: 'BULL', volumeDivergencePts: vol0 },
      expected: 'Transition',
    },
    {
      desc: 'BULL TS 25-49, EX<70 → HealthyUptrend',
      params: { trendStrength: 35, trendExhaustion: 50, trendDirection: 'BULL', volumeDivergencePts: vol0 },
      expected: 'HealthyUptrend',
    },
    {
      desc: 'BULL TS 25-49, EX≥70 → LateUptrend',
      params: { trendStrength: 40, trendExhaustion: 75, trendDirection: 'BULL', volumeDivergencePts: vol0 },
      expected: 'LateUptrend',
    },
    {
      desc: 'BULL TS 50-79, EX<70 → HealthyUptrend',
      params: { trendStrength: 65, trendExhaustion: 55, trendDirection: 'BULL', volumeDivergencePts: vol0 },
      expected: 'HealthyUptrend',
    },
    {
      desc: 'BULL TS 50-79, EX≥70 → LateUptrend',
      params: { trendStrength: 70, trendExhaustion: 80, trendDirection: 'BULL', volumeDivergencePts: vol0 },
      expected: 'LateUptrend',
    },
    {
      desc: 'BULL TS 80+, EX<40 → StrongUptrend',
      params: { trendStrength: 85, trendExhaustion: 20, trendDirection: 'BULL', volumeDivergencePts: vol0 },
      expected: 'StrongUptrend',
    },
    {
      desc: 'BULL TS 80+, EX 40-69 → HealthyUptrend',
      params: { trendStrength: 90, trendExhaustion: 55, trendDirection: 'BULL', volumeDivergencePts: vol0 },
      expected: 'HealthyUptrend',
    },
    {
      desc: 'BULL TS 80+, EX≥70, vol=20 → Distribution',
      params: { trendStrength: 88, trendExhaustion: 82, trendDirection: 'BULL', volumeDivergencePts: vol20 },
      expected: 'Distribution',
    },
    {
      desc: 'BULL TS 80+, EX≥70, vol=0 → LateUptrend',
      params: { trendStrength: 85, trendExhaustion: 75, trendDirection: 'BULL', volumeDivergencePts: vol0 },
      expected: 'LateUptrend',
    },
    // BEAR low TS
    {
      desc: 'BEAR TS 0-24 → Transition',
      params: { trendStrength: 10, trendExhaustion: 60, trendDirection: 'BEAR', volumeDivergencePts: vol0 },
      expected: 'Transition',
    },
    {
      desc: 'BEAR TS 25-49, EX<70 → WeakDowntrend',
      params: { trendStrength: 35, trendExhaustion: 40, trendDirection: 'BEAR', volumeDivergencePts: vol0 },
      expected: 'WeakDowntrend',
    },
    {
      desc: 'BEAR TS 25-49, EX≥70 → Accumulation',
      params: { trendStrength: 40, trendExhaustion: 75, trendDirection: 'BEAR', volumeDivergencePts: vol0 },
      expected: 'Accumulation',
    },
    {
      desc: 'BEAR TS 50-79, EX<70 → WeakDowntrend',
      params: { trendStrength: 60, trendExhaustion: 50, trendDirection: 'BEAR', volumeDivergencePts: vol0 },
      expected: 'WeakDowntrend',
    },
    {
      desc: 'BEAR TS 50-79, EX≥70, vol=20 → Accumulation',
      params: { trendStrength: 55, trendExhaustion: 80, trendDirection: 'BEAR', volumeDivergencePts: vol20 },
      expected: 'Accumulation',
    },
    {
      desc: 'BEAR TS 50-79, EX≥70, vol=0 → WeakDowntrend',
      params: { trendStrength: 55, trendExhaustion: 80, trendDirection: 'BEAR', volumeDivergencePts: vol0 },
      expected: 'WeakDowntrend',
    },
    {
      desc: 'BEAR TS 80+, EX<40 → StrongDowntrend',
      params: { trendStrength: 82, trendExhaustion: 15, trendDirection: 'BEAR', volumeDivergencePts: vol0 },
      expected: 'StrongDowntrend',
    },
    {
      desc: 'BEAR TS 80+, EX 40-69 → WeakDowntrend',
      params: { trendStrength: 85, trendExhaustion: 55, trendDirection: 'BEAR', volumeDivergencePts: vol0 },
      expected: 'WeakDowntrend',
    },
    {
      desc: 'BEAR TS 80+, EX≥70 → Accumulation',
      params: { trendStrength: 90, trendExhaustion: 75, trendDirection: 'BEAR', volumeDivergencePts: vol0 },
      expected: 'Accumulation',
    },
    // Spec cases A–H
    {
      desc: 'Case A: TS=85,EX=20,BULL,0 → StrongUptrend',
      params: { trendStrength: 85, trendExhaustion: 20, trendDirection: 'BULL', volumeDivergencePts: vol0 },
      expected: 'StrongUptrend',
    },
    {
      desc: 'Case B: TS=88,EX=82,BULL,20 → Distribution',
      params: { trendStrength: 88, trendExhaustion: 82, trendDirection: 'BULL', volumeDivergencePts: vol20 },
      expected: 'Distribution',
    },
    {
      desc: 'Case E: TS=82,EX=15,BEAR,0 → StrongDowntrend',
      params: { trendStrength: 82, trendExhaustion: 15, trendDirection: 'BEAR', volumeDivergencePts: vol0 },
      expected: 'StrongDowntrend',
    },
    {
      desc: 'Case F: TS=55,EX=80,BEAR,20 → Accumulation',
      params: { trendStrength: 55, trendExhaustion: 80, trendDirection: 'BEAR', volumeDivergencePts: vol20 },
      expected: 'Accumulation',
    },
    {
      desc: "Case F': TS=55,EX=80,BEAR,0 → WeakDowntrend",
      params: { trendStrength: 55, trendExhaustion: 80, trendDirection: 'BEAR', volumeDivergencePts: vol0 },
      expected: 'WeakDowntrend',
    },
    {
      desc: 'Case G: TS=15,EX=50,BULL,0 → Transition',
      params: { trendStrength: 15, trendExhaustion: 50, trendDirection: 'BULL', volumeDivergencePts: vol0 },
      expected: 'Transition',
    },
    {
      desc: 'Case H: TS=40,NEUTRAL → Transition',
      params: { trendStrength: 40, trendExhaustion: 30, trendDirection: 'NEUTRAL', volumeDivergencePts: vol0 },
      expected: 'Transition',
    },
    {
      desc: 'BULL TS=80 EX=39 boundary → StrongUptrend',
      params: { trendStrength: 80, trendExhaustion: 39, trendDirection: 'BULL', volumeDivergencePts: vol0 },
      expected: 'StrongUptrend',
    },
  ];

  it.each(matrix)('$desc', ({ params, expected }) => {
    expect(calculateMarketState(params)).toBe(expected);
  });

  it('matrix has 27 rows', () => {
    expect(matrix.length).toBe(27);
  });
});
