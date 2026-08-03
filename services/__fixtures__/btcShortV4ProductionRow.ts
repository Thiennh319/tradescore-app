/**
 * Shared production row for QA / UI export tests.
 * Copied from Downloads/01_RULEBOOK (1).md @ 2026-07-20T06:54:48.415Z.
 */
import { LAYER_L5B_ID } from '../../constants/scoring';
import type { SignalRow } from '../signalBoardScan';
import { FinalEntryStatus } from '../../types/scoring';

const GROUP_BLOCK = 'Nhóm A (Xu hướng) 2.4/5đ < 2.5đ';
const SCORE_BLOCK = 'L5a CVD chưa đủ 1đ — CVD -4K — chưa đủ tín hiệu Short';

function layer(
  id: number,
  name: string,
  score: number,
  reason: string,
  opts?: { passed?: boolean; mandatory?: boolean; violation?: boolean },
): SignalRow['layers'][number] {
  return {
    layer: id as SignalRow['layers'][number]['layer'],
    name,
    score,
    maxScore: 1.5,
    passed: opts?.passed ?? score > 0,
    isMandatory: opts?.mandatory ?? id === 5,
    isMandatoryViolation: opts?.violation ?? (id === 5 && score === 0),
    reason,
  };
}

export function btcShortV4ProductionRow(): SignalRow {
  const layers = [
    layer(1, 'Giá & EMA (Slope)', 1, 'Mâu thuẫn 1H vs 4H', { passed: true, mandatory: false }),
    layer(2, 'RSI 14 + Divergence', 0.75, 'RSI gần vùng Short (1H: 37.3, 4H: 59.3)', {
      passed: true,
      mandatory: false,
    }),
    layer(3, 'MACD + Histogram Momentum', 1.13, 'MACD vừa cắt xuống 0 — tín hiệu mạnh', {
      passed: true,
      mandatory: false,
    }),
    layer(4, 'Bollinger %B + Bandwidth', 0, '%B=0 Giá đáy dải — không Short Ranging', {
      passed: false,
      mandatory: false,
    }),
    layer(5, 'L5a — CVD Strength', 0, 'CVD -4K — chưa đủ tín hiệu Short', {
      passed: false,
      mandatory: true,
      violation: true,
    }),
    layer(
      LAYER_L5B_ID as SignalRow['layers'][number]['layer'],
      'L5b — Volume / OI',
      0.98,
      'Vol 2.7×, Long covering',
      { passed: true, mandatory: false },
    ),
    layer(6, 'Funding Rate + Trend', 0.75, 'Funding 0.0049% · ➡️ Thị trường cân bằng', {
      passed: true,
      mandatory: false,
    }),
    layer(7, 'L/S Ratio + Whale Wall', 1.13, 'Đám đông tăng Long — contrarian thuận Short', {
      passed: true,
      mandatory: false,
    }),
    layer(8, 'BTC 24h + 1H Momentum', 1.5, 'BTC 24h -1.26%, 1h -0.63% — cùng chiều giảm', {
      passed: true,
      mandatory: false,
    }),
    layer(
      9,
      'Phiên giao dịch',
      0.75,
      'London Lunch: 12-15h VN: London nghỉ trưa, thanh khoản giảm',
      { passed: true, mandatory: false },
    ),
    layer(10, 'Tâm lý & Kỷ luật', 1.13, '4/5 mục — đạt', { passed: true, mandatory: false }),
  ];
  const shortGroupScores = { A: 2.4, B: 2.38, C: 3.75 };
  const v4 = {
    score: 8.52,
    longScore: 5.83,
    shortScore: 8.52,
    direction: 'SHORT' as const,
    decisionLabel: 'KHONG_VAO' as const,
    decisionDisplay: 'KHÔNG VÀO',
    winrate: '~50%',
    canEnter: false,
    layers,
    mandatoryViolations: [GROUP_BLOCK, SCORE_BLOCK],
    hardBlocked: true,
    groupBlocks: [GROUP_BLOCK],
    shortHardBlocks: [],
    longHardBlocks: [],
    shortBlockReasons: [SCORE_BLOCK],
    longBlockReasons: [],
    groupScores: shortGroupScores,
    shortGroupScores,
    longGroupScores: { A: 1.5, B: 2.0, C: 2.33 },
    shortGroupBlocks: [GROUP_BLOCK],
    longGroupBlocks: [],
  };
  return {
    symbol: 'BTCUSDT',
    price: 63873.5,
    change24h: -1.257,
    trend: 'BEARISH',
    regimeConfidence: 0.65,
    score: 8.52,
    longScore: 5.83,
    shortScore: 8.52,
    direction: 'SHORT',
    decisionLabel: 'KHONG_VAO',
    decisionDisplay: 'KHÔNG VÀO',
    winrate: '~50%',
    canEnter: false,
    tradePlan: null,
    layers,
    mandatoryViolations: [GROUP_BLOCK, SCORE_BLOCK],
    hardBlocked: true,
    fromCache: false,
    finalEntryStatus: FinalEntryStatus.GROUP_BLOCKED,
    fundingRate: 0.00489,
    cvdValue: -3959.499755859375,
    cvdTrend: 'UP',
    topLSRatio: 1.576,
    atr1h: 297.89910888671875,
    adxData: {
      adx1H: 23.27311134338379,
      adx4H: 23.565845489501953,
    },
    adxGate: {
      allowed: true,
      regime: 'RANGING',
    },
    groupScores: shortGroupScores,
    v4,
  };
}
