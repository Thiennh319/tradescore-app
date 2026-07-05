import type { ADXAnalysis } from './indicators';

export type ADXGateDirection = 'LONG' | 'SHORT';

export type ADXGateSeverity = 'BLOCK' | 'WARNING' | 'BONUS' | 'OK';

export interface ADXGateResult {
  allowed: boolean;
  block: boolean;
  regime: string;
  tpMultiplier: number;
  slMultiplier: number;
  message: string;
  severity: ADXGateSeverity;
}

const FALLBACK_OK: ADXGateResult = {
  allowed: true,
  block: false,
  regime: '',
  tpMultiplier: 1.0,
  slMultiplier: 1.0,
  message: '',
  severity: 'OK',
};

/**
 * Cổng lọc ADX độc lập — không thuộc scorer 10 lớp.
 * `direction` giữ cho caller tương lai; logic hiện tại không phân biệt Long/Short.
 */
export function evaluateADXGate(
  adxData: ADXAnalysis | undefined,
  direction: ADXGateDirection,
): ADXGateResult {
  void direction;

  if (adxData == null) {
    return { ...FALLBACK_OK };
  }

  if (adxData.bothChoppy) {
    return {
      allowed: false,
      block: true,
      regime: adxData.regime,
      tpMultiplier: 1.0,
      slMultiplier: 1.0,
      message: '⛔ Thị trường CHOPPY cả 1H+4H — chờ xu hướng rõ',
      severity: 'BLOCK',
    };
  }

  const oneChoppy = adxData.isChoppy1H !== adxData.isChoppy4H;
  if (oneChoppy) {
    return {
      allowed: true,
      block: false,
      regime: adxData.regime,
      tpMultiplier: 0.9,
      slMultiplier: 1.1,
      message: '⚠️ Xu hướng yếu — thu hẹp kỳ vọng',
      severity: 'WARNING',
    };
  }

  if (adxData.regime === 'RANGING') {
    return {
      allowed: true,
      block: false,
      regime: adxData.regime,
      tpMultiplier: 0.85,
      slMultiplier: 1.1,
      message: '⚠️ Thị trường RANGING — TP thu hẹp',
      severity: 'WARNING',
    };
  }

  if (adxData.regime === 'TRENDING' && adxData.regimeStrength === 'STRONG') {
    return {
      allowed: true,
      block: false,
      regime: adxData.regime,
      tpMultiplier: 1.2,
      slMultiplier: 0.9,
      message: '✅ Xu hướng mạnh — mở rộng TP',
      severity: 'BONUS',
    };
  }

  if (adxData.regime === 'TRENDING') {
    return {
      allowed: true,
      block: false,
      regime: adxData.regime,
      tpMultiplier: 1.0,
      slMultiplier: 1.0,
      message: '✅ Xu hướng hình thành',
      severity: 'OK',
    };
  }

  return {
    allowed: true,
    block: false,
    regime: adxData.regime,
    tpMultiplier: 1.0,
    slMultiplier: 1.0,
    message: '',
    severity: 'OK',
  };
}
