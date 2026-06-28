/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TradePlanV3View } from './TradePlanV3View';
import { mockTradePlanV3 } from '../services/tradePlanTestFixtures';

const noop = () => {};

function renderPlan(
  finalDecision: NonNullable<Parameters<typeof TradePlanV3View>[0]['finalDecision']>,
  planOverrides: Parameters<typeof mockTradePlanV3>[0] = {},
  hardBlockReasons: string[] = [],
) {
  const plan = mockTradePlanV3(planOverrides);
  return render(
    <TradePlanV3View
      plan={plan}
      finalDecision={finalDecision}
      hardBlockReasons={hardBlockReasons}
      embedded
      onConfirmEntry={noop}
      onPlacePending={noop}
    />,
  );
}

describe('TradePlanV3View FOMO guard DOM', () => {
  it('finalDecision=KHONG_VAO → ẩn TP1 và expected-value, hiện block-reason', () => {
    const { container } = renderPlan('KHONG_VAO', {
      blockReasons: ['R:R 1.85:1 < tối thiểu 2:1 — không vào'],
    });

    expect(container.querySelector('[data-testid="TP1"]')).toBeNull();
    expect(container.querySelector('[data-testid="expected-value"]')).toBeNull();
    expect(container.querySelector('[data-testid="win-probability"]')).toBeNull();
    expect(container.querySelector('[data-testid="rr-score"]')).toBeNull();
    expect(container.querySelector('[data-testid="take-profit-section"]')).toBeNull();

    const blockReason = container.querySelector('[data-testid="block-reason"]');
    expect(blockReason).not.toBeNull();
    expect(blockReason?.textContent).toContain('R:R 1.85:1');
    expect(container.querySelector('[data-testid="rr-entry-wait"]')).not.toBeNull();
  });

  it('finalDecision=HARD_BLOCK → ẩn TP1/EV tương tự KHONG_VAO', () => {
    const { container } = renderPlan('HARD_BLOCK', {}, ['BTC -2.5% — chặn Long']);

    expect(container.querySelector('[data-testid="TP1"]')).toBeNull();
    expect(container.querySelector('[data-testid="expected-value"]')).toBeNull();
    const blockReason = container.querySelector('[data-testid="block-reason"]');
    expect(blockReason).not.toBeNull();
    expect(blockReason?.textContent).toContain('HARD BLOCK');
    expect(blockReason?.textContent).toContain('BTC -2.5%');
  });

  it('finalDecision=CHO_THEM → banner vàng + TP1 hiển thị', () => {
    const { container } = renderPlan('CHO_THEM');

    expect(container.querySelector('[data-testid="wait-banner"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="TP1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="expected-value"]')).not.toBeNull();
  });

  it('finalDecision=VAO_TU_TIN → TP1 hiển thị, không banner vàng', () => {
    const { container } = renderPlan('VAO_TU_TIN');

    expect(container.querySelector('[data-testid="TP1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="wait-banner"]')).toBeNull();
    expect(container.querySelector('[data-testid="block-reason"]')).toBeNull();
    expect(container.querySelector('[data-testid="expected-value"]')).not.toBeNull();
  });

  it('TP1 prob thấp + filter tắt → hiển thị (tham khảo)', () => {
    const { container } = renderPlan('VAO_TU_TIN', {
      tp1: {
        price: 2.28,
        rrRatio: 2,
        type: 'RR_BASED',
        sizeToClose: 0.5,
        expectedPnlUSDT: 2,
        reasoning: 'test',
        probability: 0.43,
      },
      tradePlanValid: true,
      tp1LowProbabilityWarning: null,
    });
    const prob = container.querySelector('[data-testid="TP1-prob"]');
    expect(prob?.textContent).toBe('Xác suất: 43% (tham khảo)');
  });

  it('entryBufferPct → hiển thị nhãn buffer S/R', () => {
    const { container } = renderPlan('VAO_TU_TIN', {
      entryBufferPct: 0.42,
      entryBufferSource: 'ATR_BASED',
      entryBufferUsed: 0.00882,
    });
    const label = container.querySelector('[data-testid="entry-buffer-label"]');
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe('Buffer: 0.42% (ATR-based)');
  });

  it('squeezeWarning != null → banner đỏ phía trên plan', () => {
    const plan = mockTradePlanV3({});
    const warning = 'Squeeze EXTREME cùng hướng LONG — cân nhắc giảm size';
    const { container } = render(
      <TradePlanV3View
        plan={plan}
        finalDecision="VAO_TU_TIN"
        squeezeWarning={warning}
        embedded
        onConfirmEntry={noop}
        onPlacePending={noop}
      />,
    );
    const banner = container.querySelector('[data-testid="squeeze-warning-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain(warning);
    const waitBanner = container.querySelector('[data-testid="wait-banner"]');
    expect(waitBanner).toBeNull();
  });
});
