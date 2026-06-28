import { describe, expect, it } from 'vitest';
import {
  applyRecoveringCvdLocalPenalty,
  classifyCvdState,
  CVD_RECOVERING_SCORE_PENALTY,
  CVD_RECOVERING_SOFT_WARNING,
  evaluateLongCvdHardBlock,
} from './indicators';
import { scoreL5aV4 } from './scorerV4';

const CvdState = {
  STRONG_BEARISH: 0,
  BEARISH: 1,
  RECOVERING: 2,
  NEUTRAL: 3,
  BULLISH: 4,
  STRONG_BULLISH: 5,
} as const;

function cvdPointsWithMomentum(
  currentCvd: number,
  cvdMomentum24h: number,
  barCount = 25,
) {
  const startCvd = currentCvd - cvdMomentum24h;
  return Array.from({ length: barCount }, (_, i) => ({
    timestamp: i * 3_600_000,
    cvd: startCvd + ((currentCvd - startCvd) * i) / (barCount - 1),
    price: 100 - i * 0.1,
  }));
}

describe('CVDX', () => {
  describe('CASE A — deep negative, deteriorating, price below EMA20', () => {
    const currentCvd = -25_000_000;
    const cvdMomentum24h = -5_000_000;
    const currentPrice = 95;
    const ema20 = 100;

    it('classifies STRONG_BEARISH', () => {
      expect(classifyCvdState(currentCvd, cvdMomentum24h)).toBe(CvdState.STRONG_BEARISH);
    });

    it('returns HARD BLOCK message', () => {
      expect(
        evaluateLongCvdHardBlock({
          currentCvd,
          cvdMomentum24h,
          currentPrice,
          ema20,
        }),
      ).toBe('CVD deeply negative and still deteriorating.');
    });

    it('scoreL5aV4 LONG hard blocks via L5a', () => {
      const points = cvdPointsWithMomentum(currentCvd, cvdMomentum24h);
      const { hardBlock, warning } = scoreL5aV4('LONG', points, {
        currentPrice,
        ema20,
      });
      expect(hardBlock).toBe('CVD deeply negative and still deteriorating.');
      expect(warning).toBeNull();
    });
  });

  describe('CASE B — deep negative, recovering momentum +6M', () => {
    const currentCvd = -25_000_000;
    const cvdMomentum24h = 6_000_000;

    it('classifies RECOVERING', () => {
      expect(classifyCvdState(currentCvd, cvdMomentum24h)).toBe(CvdState.RECOVERING);
    });

    it('no hard block', () => {
      expect(
        evaluateLongCvdHardBlock({
          currentCvd,
          cvdMomentum24h,
          currentPrice: 95,
          ema20: 100,
        }),
      ).toBeNull();
    });

    it('applies -1.0 score penalty and soft warning', () => {
      const baseScore = 2;
      const adjusted = applyRecoveringCvdLocalPenalty(
        baseScore,
        currentCvd,
        cvdMomentum24h,
      );
      expect(CVD_RECOVERING_SCORE_PENALTY).toBe(1);
      expect(adjusted.score).toBe(baseScore - CVD_RECOVERING_SCORE_PENALTY);
      expect(adjusted.warning).toBe(CVD_RECOVERING_SOFT_WARNING);
    });

    it('scoreL5aV4 LONG: no hard block, recovering warning, L5a penalty', () => {
      const points = cvdPointsWithMomentum(currentCvd, cvdMomentum24h);
      const { hardBlock, warning, layerResult } = scoreL5aV4('LONG', points, {
        currentPrice: 95,
        ema20: 100,
      });
      expect(hardBlock).toBeNull();
      expect(warning).toBe(CVD_RECOVERING_SOFT_WARNING);
      expect(layerResult.score).toBe(0);
      expect(layerResult.reason).toContain(CVD_RECOVERING_SOFT_WARNING);
    });
  });

  describe('CASE C — mildly negative -5M (existing behavior unchanged)', () => {
    const currentCvd = -5_000_000;
    const cvdMomentum24h = 0;

    it('classifies NEUTRAL (not deep negative)', () => {
      expect(classifyCvdState(currentCvd, cvdMomentum24h)).toBe(CvdState.NEUTRAL);
    });

    it('no hard block (legacy -2M rule removed)', () => {
      expect(
        evaluateLongCvdHardBlock({
          currentCvd,
          cvdMomentum24h,
          currentPrice: 95,
          ema20: 100,
        }),
      ).toBeNull();
    });

    it('no recovering penalty', () => {
      const adjusted = applyRecoveringCvdLocalPenalty(1, currentCvd, cvdMomentum24h);
      expect(adjusted.score).toBe(1);
      expect(adjusted.warning).toBeNull();
    });

    it('scoreL5aV4 LONG: no hard block, no recovering warning', () => {
      const points = [{ timestamp: 1, price: 95, cvd: currentCvd }];
      const { hardBlock, warning, layerResult } = scoreL5aV4('LONG', points, {
        currentPrice: 95,
        ema20: 100,
      });
      expect(hardBlock).toBeNull();
      expect(warning).toBeNull();
      expect(layerResult.score).toBe(0);
      expect(layerResult.reason).toContain('CVD âm sâu');
    });
  });
});
