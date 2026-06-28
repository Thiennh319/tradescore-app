/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { L11SqueezeExpandV4 } from './L11SqueezeExpandV4';
import { SQUEEZE_LEVEL_COLORS } from '../services/squeezeRiskUi';
import type { SqueezeRiskResult } from '../types/squeezeRisk';

const highSqueeze: SqueezeRiskResult = {
  score: 7,
  level: 'HIGH',
  direction: 'LONG_SQUEEZE',
  components: {
    fundingCrowding: 1.5,
    oiExpansion: 2.0,
    lsCrowding: 1.5,
    priceOiDivergence: 1.0,
    whaleWallConfirmation: 2.0,
  },
  reasons: ['Funding dương cao và tăng nhanh', 'OI tăng mạnh cả 1H và 4H'],
  timestamp: Date.now(),
};

describe('L11SqueezeExpandV4', () => {
  it('level HIGH → màu cam (#F97316)', () => {
    const { container } = render(<L11SqueezeExpandV4 squeezeRisk={highSqueeze} />);
    const levelLabel = container.querySelector('[data-testid="l11-level-label"]');
    expect(levelLabel).not.toBeNull();
    expect(SQUEEZE_LEVEL_COLORS.HIGH).toBe('#F97316');
    const style = (levelLabel as HTMLElement).style;
    expect(style.color).toMatch(/249,\s*115,\s*22|#F97316/i);
  });

  it('5 progress bar render đúng giá trị component', () => {
    const { container } = render(<L11SqueezeExpandV4 squeezeRisk={highSqueeze} />);
    const fundingBar = container.querySelector('[data-testid="l11-bar-funding-crowding"]');
    const oiBar = container.querySelector('[data-testid="l11-bar-oi-expansion"]');
    const lsBar = container.querySelector('[data-testid="l11-bar-l/s-crowding"]');
    const divBar = container.querySelector('[data-testid="l11-bar-price/oi-divergence"]');
    const whaleBar = container.querySelector('[data-testid="l11-bar-whale-wall"]');

    expect(fundingBar?.textContent).toContain('1.5');
    expect(oiBar?.textContent).toContain('2.0');
    expect(lsBar?.textContent).toContain('1.5');
    expect(divBar?.textContent).toContain('1.0');
    expect(whaleBar?.textContent).toContain('2.0');
    expect(fundingBar?.textContent).toMatch(/█+/);
  });
});
