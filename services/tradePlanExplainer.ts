import type { LayerResult, TradeDirection, TradePlanV3 } from '../constants/scoring';
import { TRADE_PLAN_V3_CONFIG } from '../constants/scoring';
import type { SignalRow } from './signalBoardScan';
import { getVWAPEntrySignal } from './vwapService';

export type BlockSeverity = 'HIGH' | 'LOW';

export interface ExplainedBlock {
  text: string;
  severity: BlockSeverity;
}

export interface ExplainBlocksResult {
  blocks: ExplainedBlock[];
  suggestions: string[];
}

type TpLevelNum = 1 | 2 | 3;

function formatSwingPrice(price: number): string {
  if (!Number.isFinite(price)) return '—';
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

function formatRr(rr: number): string {
  if (!Number.isFinite(rr) || rr <= 0) return '—×';
  return `${rr.toFixed(1)}×`;
}

function resolveTradePlan(row: SignalRow, direction: TradeDirection): TradePlanV3 | null {
  const v4 = row.tradePlansByScorer?.v4;
  if (v4?.direction === direction) return v4;
  const v3 = row.tradePlansByScorer?.v3;
  if (v3?.direction === direction) return v3;
  if (row.tradePlanV3?.direction === direction) return row.tradePlanV3;
  return null;
}

function layersForDirection(row: SignalRow, direction: TradeDirection): LayerResult[] {
  if (row.v4) {
    if (direction === 'LONG') {
      return row.v4.longLayers ?? (row.direction === 'LONG' ? row.v4.layers : row.layers);
    }
    return row.v4.shortLayers ?? (row.direction === 'SHORT' ? row.v4.layers : row.layers);
  }
  if (row.direction === direction) return row.layers;
  return [];
}

function hardBlocksForDirection(row: SignalRow, direction: TradeDirection): string[] {
  if (row.v4) {
    const side =
      direction === 'LONG'
        ? (row.v4.longHardBlocks ?? [])
        : (row.v4.shortHardBlocks ?? []);
    if (side.length > 0) return side;
    if (row.direction === direction) return row.mandatoryViolations;
    return [];
  }
  if (row.direction === direction) return row.mandatoryViolations;
  return [];
}

function groupBlocksForDirection(row: SignalRow, direction: TradeDirection): string[] {
  if (row.v4) {
    const side =
      direction === 'LONG'
        ? (row.v4.longGroupBlocks ?? [])
        : (row.v4.shortGroupBlocks ?? []);
    if (side.length > 0) return side;
    if (row.direction === direction) return row.v4.groupBlocks ?? [];
    return [];
  }
  return [];
}

function directionScore(row: SignalRow, direction: TradeDirection): number {
  return direction === 'LONG' ? row.longScore : row.shortScore;
}

function layer9Score(layers: LayerResult[]): number | null {
  const l9 = layers.find((l) => l.layer === 9);
  return l9 != null ? l9.score : null;
}

function resolveVwapQuality(
  row: SignalRow,
  direction: TradeDirection,
): 'IDEAL' | 'GOOD' | null {
  const quality =
    row.vwapData != null
      ? getVWAPEntrySignal(row.vwapData, direction).quality
      : row.vwapSignal != null && row.direction === direction
        ? row.vwapSignal.quality
        : null;
  if (quality === 'IDEAL' || quality === 'GOOD') return quality;
  return null;
}

/** Giải thích logic entry — VWAP ưu tiên, fallback 11 lớp. */
export function explainEntry(row: SignalRow, direction: TradeDirection): string {
  const quality = resolveVwapQuality(row, direction);
  if (quality === 'IDEAL') {
    return 'Tại VWAP ± 0.5% — vùng giá công bằng, entry tối ưu';
  }
  if (quality === 'GOOD') {
    return 'Pullback về VWAP — chờ giá chạm vùng VWAP';
  }
  return 'Entry theo tín hiệu tổng hợp 11 lớp';
}

/** Giải thích stop loss — structure swing 4H hoặc ATR fallback. */
export function explainSL(row: SignalRow, direction: TradeDirection): string {
  const structure = row.structureSL;
  const plan = resolveTradePlan(row, direction);
  const bufferPct = structure?.bufferPct ?? 0.3;

  if (structure?.slSource === 'STRUCTURE') {
    const swing = formatSwingPrice(structure.swingPrice);
    if (direction === 'LONG') {
      return `Dưới swing low 4H tại ${swing} + ${bufferPct}%`;
    }
    return `Trên swing high 4H tại ${swing} + ${bufferPct}%`;
  }

  const atrMult =
    plan?.stopLoss?.targetAtrMultiplier ??
    TRADE_PLAN_V3_CONFIG.ATR_SL_MULTIPLIER.CO_THE_VAO;
  return `ATR × ${atrMult} — không có swing hợp lệ`;
}

/** Giải thích take profit — regime ADX hoặc phân bổ TP1/2/3. */
export function explainTP(
  row: SignalRow,
  tpNum: TpLevelNum,
  direction: TradeDirection,
): string {
  const plan = resolveTradePlan(row, direction);
  const tp =
    tpNum === 1 ? plan?.tp1 : tpNum === 2 ? plan?.tp2 : plan?.tp3;
  const rrLabel = formatRr(tp?.rrRatio ?? plan?.primaryRR ?? 0);

  const adx = row.adxData;
  const gate = row.adxGate;
  if (adx?.regime === 'TRENDING' && adx.regimeStrength === 'STRONG') {
    const mult = gate?.tpMultiplier ?? 1.2;
    return `R:R ${rrLabel} — trending mạnh, ×${mult}`;
  }

  if (adx?.regime === 'RANGING' || plan?.marketMode === 'RANGING') {
    const mult = gate?.tpMultiplier ?? 0.85;
    return `R:R ${rrLabel} — ranging, ×${mult}`;
  }

  const alloc = tpNum === 1 ? '50%' : tpNum === 2 ? '30%' : '20%';
  return `R:R ${rrLabel} — chốt ${alloc}`;
}

const BLOCK_COPY: Record<
  string,
  { text: string; severity: BlockSeverity; suggestion: string }
> = {
  ADX_CHOPPY: {
    text: 'ADX CHOPPY — thị trường không có xu hướng rõ',
    severity: 'HIGH',
    suggestion: 'Chờ ADX > 15 trên 1H và 4H trước khi vào lệnh',
  },
  BTC_HARD_BLOCK: {
    text: 'BTC hard block — rủi ro hệ thống cao',
    severity: 'HIGH',
    suggestion: 'Theo dõi BTC 24h; tránh Long khi BTC giảm mạnh và ngược lại',
  },
  FUNDING: {
    text: 'Funding squeeze — chi phí giữ lệnh bất lợi',
    severity: 'HIGH',
    suggestion: 'Chờ funding rate về vùng trung tính',
  },
  CVD: {
    text: 'CVD vi phạm — dòng tiền ngược hướng lệnh',
    severity: 'HIGH',
    suggestion: 'Chờ CVD cùng chiều với hướng dự định',
  },
  GROUP_A: {
    text: 'Nhóm A yếu — xu hướng chưa đủ mạnh',
    severity: 'HIGH',
    suggestion: 'Chờ nhóm A (xu hướng) đạt ngưỡng tối thiểu',
  },
  GROUP_B: {
    text: 'Nhóm B yếu — dòng tiền chưa xác nhận',
    severity: 'HIGH',
    suggestion: 'Chờ nhóm B (dòng tiền) cải thiện',
  },
  GROUP_C: {
    text: 'Nhóm C yếu — bối cảnh thị trường chưa thuận',
    severity: 'LOW',
    suggestion: 'Cân nhắc giảm size hoặc chờ bối cảnh tốt hơn',
  },
  SESSION: {
    text: 'Phiên giao dịch xấu (02:00–08:00 VN)',
    severity: 'LOW',
    suggestion: 'Ưu tiên chờ phiên London mở (sau 08:00 VN)',
  },
  SCORE_LOW: {
    text: 'Điểm tổng chưa đủ — dưới ngưỡng vào lệnh',
    severity: 'LOW',
    suggestion: 'Theo dõi thêm đến khi score hướng này ≥ 9.0',
  },
};

function pushBlock(
  out: ExplainBlocksResult,
  key: keyof typeof BLOCK_COPY,
  seen: Set<string>,
): void {
  if (seen.has(key)) return;
  seen.add(key);
  const copy = BLOCK_COPY[key];
  out.blocks.push({ text: copy.text, severity: copy.severity });
  out.suggestions.push(copy.suggestion);
}

function matchesAny(reason: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(reason));
}

/** Liệt kê block + gợi ý theo hướng lệnh. */
export function explainBlocks(
  row: SignalRow,
  direction: TradeDirection,
): ExplainBlocksResult {
  const result: ExplainBlocksResult = { blocks: [], suggestions: [] };
  const seen = new Set<string>();

  if (row.adxGate?.block === true || row.adxData?.bothChoppy === true) {
    pushBlock(result, 'ADX_CHOPPY', seen);
  }

  const hardBlocks = hardBlocksForDirection(row, direction);
  for (const reason of hardBlocks) {
    if (matchesAny(reason, [/BTC/i])) {
      pushBlock(result, 'BTC_HARD_BLOCK', seen);
    }
    if (matchesAny(reason, [/Funding|funding|L6/i])) {
      pushBlock(result, 'FUNDING', seen);
    }
    if (matchesAny(reason, [/CVD/i])) {
      pushBlock(result, 'CVD', seen);
    }
  }

  const groupBlocks = groupBlocksForDirection(row, direction);
  for (const reason of groupBlocks) {
    if (matchesAny(reason, [/Nhóm A|GROUP_A/i])) {
      pushBlock(result, 'GROUP_A', seen);
    }
    if (matchesAny(reason, [/Nhóm B|GROUP_B/i])) {
      pushBlock(result, 'GROUP_B', seen);
    }
    if (matchesAny(reason, [/Nhóm C|GROUP_C/i])) {
      pushBlock(result, 'GROUP_C', seen);
    }
  }

  const l9 = layer9Score(layersForDirection(row, direction));
  if (l9 === 0 || row.v4?.awaitingRescore === true) {
    pushBlock(result, 'SESSION', seen);
  }

  if (directionScore(row, direction) < 8) {
    pushBlock(result, 'SCORE_LOW', seen);
  }

  const severityRank: Record<BlockSeverity, number> = { HIGH: 0, LOW: 1 };
  const indexed = result.blocks.map((block, i) => ({ block, i }));
  indexed.sort(
    (a, b) =>
      severityRank[a.block.severity] - severityRank[b.block.severity] ||
      a.i - b.i,
  );
  const order = indexed.map((x) => x.i);
  result.blocks = order.map((i) => result.blocks[i]);
  result.suggestions = order.map((i) => result.suggestions[i]);

  return result;
}
