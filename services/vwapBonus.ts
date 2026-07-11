import type { VWAPResult } from './vwapService';

export interface VWAPBonusResult {
  bonusRaw: number;
  reason: string;
  applied: boolean;
}

const L5_RAW_MAX = 2;
const BONUS_AMOUNT = 0.5;

export function calculateVWAPBonus(
  vwapData: VWAPResult | undefined,
  direction: 'LONG' | 'SHORT',
  currentL5Raw: number,
  cvdValue?: number,
): VWAPBonusResult {
  const noBonus = (reason: string): VWAPBonusResult => ({
    bonusRaw: 0,
    reason,
    applied: false,
  });

  if (vwapData == null) {
    return noBonus('Không có dữ liệu VWAP');
  }

  if (!vwapData.isNearVwap) {
    return noBonus('Giá chưa gần VWAP');
  }

  if (cvdValue === undefined) {
    return noBonus('Không có dữ liệu CVD');
  }

  if (direction === 'LONG' && cvdValue <= 0) {
    return noBonus('LONG: CVD không dương — không bonus');
  }

  if (direction === 'SHORT' && cvdValue >= 0) {
    return noBonus('SHORT: CVD không âm — không bonus');
  }

  if (direction === 'LONG' && vwapData.zone === 'BELOW_BAND2') {
    return noBonus('LONG: giá dưới band2 — không bonus');
  }

  if (direction === 'SHORT' && vwapData.zone === 'ABOVE_BAND2') {
    return noBonus('SHORT: giá trên band2 — không bonus');
  }

  const cappedL5 = Math.min(L5_RAW_MAX, Math.max(0, currentL5Raw));
  const headroom = L5_RAW_MAX - cappedL5;
  if (headroom <= 0) {
    return noBonus('L5 đã đạt max raw');
  }

  const bonusRaw = Math.min(BONUS_AMOUNT, headroom);
  return {
    bonusRaw,
    reason: `VWAP gần giá — bonus L5 +${bonusRaw}`,
    applied: bonusRaw > 0,
  };
}
