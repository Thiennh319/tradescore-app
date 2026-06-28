import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeAdvancedDerivativesScore,
  configureDerivativesApi,
  fetchAndScoreAdvancedDerivatives,
  mockAdvancedDerivativesData,
  mockLiquidationHeatmap,
  resetDerivativesConfigForTests,
  scoreL11LiquidationRisk,
  scoreL12FundingBonus,
} from './derivativesDataService';

describe('derivativesDataService L11', () => {
  it('SHORT + cụm thanh lý 1.5–2% phía trên > $1M → -1.5', () => {
    const heatmap = mockLiquidationHeatmap('BNBUSDT', 600, 'stop_hunt_above');
    const { score, warning } = scoreL11LiquidationRisk('SHORT', 600, heatmap);
    expect(score).toBe(-1.5);
    expect(warning).toContain('Stop-hunt');
  });

  it('SHORT + không có tường nặng phía trên → +1.0', () => {
    const heatmap = mockLiquidationHeatmap('BNBUSDT', 600, 'safe');
    const { score } = scoreL11LiquidationRisk('SHORT', 600, heatmap);
    expect(score).toBe(1);
  });
});

describe('derivativesDataService L12', () => {
  it('L12: funding > 0.01% + SHORT → +1.0', () => {
    expect(scoreL12FundingBonus('SHORT', 0.012)).toBe(1);
    expect(scoreL12FundingBonus('LONG', 0.012)).toBe(0);
  });
});

describe('computeAdvancedDerivativesScore', () => {
  it('tổng hợp L11+L12+L13 cho SHORT thuận', () => {
    const heatmap = mockLiquidationHeatmap('NEARUSDT', 5, 'safe');
    const advanced = mockAdvancedDerivativesData('NEARUSDT', 'short_friendly');
    const result = computeAdvancedDerivativesScore('SHORT', 5, heatmap, advanced);
    expect(result.liquidationRiskScore).toBe(1);
    expect(result.fundingRateBonus).toBe(1);
    expect(result.whaleDeltaScore).toBe(0.5);
    expect(result.totalAdvancedScore).toBe(2.5);
    expect(result.groupBlock).toBeNull();
    expect(result.isFallback).toBe(false);
  });

  it('fallback → toàn bộ 0 khi không có dữ liệu', () => {
    const result = computeAdvancedDerivativesScore('SOLUSDT', 150, null, null);
    expect(result.totalAdvancedScore).toBe(0);
    expect(result.isFallback).toBe(true);
  });

  it('RANGING market → whaleDeltaScore 0, L11/L12 unchanged', () => {
    const heatmap = mockLiquidationHeatmap('NEARUSDT', 5, 'safe');
    const advanced = mockAdvancedDerivativesData('NEARUSDT', 'short_friendly');
    const result = computeAdvancedDerivativesScore('SHORT', 5, heatmap, advanced, 'RANGING');
    expect(result.liquidationRiskScore).toBe(1);
    expect(result.fundingRateBonus).toBe(1);
    expect(result.whaleDeltaScore).toBe(0);
    expect(result.totalAdvancedScore).toBe(2);
    expect(result.groupBlock).toBeNull();
  });
});

describe('fetchAndScoreAdvancedDerivatives', () => {
  afterEach(() => {
    resetDerivativesConfigForTests();
    vi.unstubAllGlobals();
  });

  it('dùng mock khi không có API key — không crash', async () => {
    configureDerivativesApi({ apiKey: '', useMockWhenNoKey: true });
    const result = await fetchAndScoreAdvancedDerivatives('BNBUSDT', 600, 'SHORT');
    expect(result.isFallback).toBe(false);
    expect(Number.isFinite(result.totalAdvancedScore)).toBe(true);
  });

  it('API fail → fallback 0', async () => {
    configureDerivativesApi({
      apiKey: 'test-key',
      useMockWhenNoKey: false,
      provider: 'coinglass',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('rate limit'))),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await fetchAndScoreAdvancedDerivatives('NEARUSDT', 5, 'LONG');
    expect(result.totalAdvancedScore).toBe(0);
    expect(result.isFallback).toBe(true);
    warnSpy.mockRestore();
  });
});
