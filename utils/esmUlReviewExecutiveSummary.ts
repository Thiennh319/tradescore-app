/**
 * UL Review Executive Summary — presentation-only (V2).
 *
 * **Purpose:** Translate existing UL Review decision + scan context into trader-facing copy.
 * **Must NOT:** Evaluate rules, score, call pipeline, or change store/journal.
 *
 * @module utils/esmUlReviewExecutiveSummary
 */

import type { LayerResult } from '../constants/scoring';
import type { TradeDirection } from '../constants/scoring';
import type { ProductionEsmBridgeSnapshot } from '../services/productionEsmBridge/productionEsmBridgeTypes';
import type { ProductionEsmScanContext } from '../services/productionEsmBridge/signalRowScanContext';
import { StateMachineEntryState } from '../services/entryStateManager';
import type {
  EsmUlReviewExplanationPanel,
  EsmUlReviewRejectedAction,
} from './esmUlReviewExplanation';

export type UlReviewExecutiveDecisionKind =
  | 'STRONG_HOLD'
  | 'HOLD'
  | 'PARTIAL_TP'
  | 'REDUCE'
  | 'EXIT'
  | 'WAIT';

export type UlReviewRiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface EsmUlReviewExecutiveSummary {
  readonly decisionKind: UlReviewExecutiveDecisionKind;
  readonly decisionBadge: string;
  readonly decisionTitle: string;
  readonly confidence: number | null;
  readonly riskLevel: UlReviewRiskLevel;
  readonly whyReasons: readonly string[];
  readonly watchOut: readonly string[];
  readonly nextAction: string;
  readonly advancedDiagnostics: readonly string[];
}

const MAX_WHY = 5;
const MAX_WATCH = 3;

const LAYER_NAME_PATTERN =
  /l5a|cvd|l5b|volume|oi|ema|slope|rsi|macd|funding|whale|btc|bollinger|%b|bandwidth|trend|momentum|divergence|session|psychology|ls\s*ratio/i;

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function capitalizeSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function ensurePeriod(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function isTechnicalIdLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^l\d+[ab]?\b/i.test(trimmed)) return true;
  if (/^(entry status|winrate)\b/i.test(trimmed)) return false;
  if (LAYER_NAME_PATTERN.test(trimmed) && trimmed.includes(':')) return true;
  if (/passed \(\d/i.test(trimmed)) return true;
  return /^[A-Z]\d+[a-z]?\s/i.test(trimmed);
}

function translateLayerToWhy(layer: LayerResult, direction: TradeDirection): string | null {
  if (!layer.passed) return null;
  const name = layer.name;
  const reason = layer.reason?.trim() ?? '';
  const lowerName = name.toLowerCase();
  const lowerReason = reason.toLowerCase();

  if (/cvd|l5a/i.test(lowerName)) {
    if (/bear|sell|short|giảm|bán/i.test(lowerReason) || direction === 'SHORT') {
      return 'Áp lực bán vẫn đang chiếm ưu thế';
    }
    return 'Áp lực mua vẫn đang chiếm ưu thế';
  }

  if (/volume|l5b|oi/i.test(lowerName)) {
    if (/weak|thấp|fade|giảm/i.test(lowerReason)) {
      return 'Volume đang mỏng dần — cần theo dõi follow-through';
    }
    return 'Volume và OI vẫn ủng hộ setup hiện tại';
  }

  if (/ema|slope|trend|giá/i.test(lowerName)) {
    if (/bear|short|giảm/i.test(lowerReason) || direction === 'SHORT') {
      return 'Cấu trúc xu hướng giảm vẫn còn được duy trì';
    }
    if (/bull|long|tăng/i.test(lowerReason) || direction === 'LONG') {
      return 'Trend vẫn lành mạnh và phù hợp với lệnh';
    }
    return 'Cấu trúc giá vẫn ủng hộ vị thế';
  }

  if (/rsi/i.test(lowerName)) {
    if (/overbought|quá mua/i.test(lowerReason)) {
      return 'Momentum đang kéo giãn — khả năng tăng có thể bị giới hạn';
    }
    if (/oversold|quá bán/i.test(lowerReason)) {
      return 'Nhịp điều chỉnh có thể sắp cạn kiệt';
    }
    return 'Động lượng vẫn đang ủng hộ xu hướng hiện tại';
  }

  if (/macd|histogram/i.test(lowerName)) {
    if (/bear|giảm|negative/i.test(lowerReason)) {
      return 'Momentum MACD nghiêng về phe Short';
    }
    if (/bull|tăng|positive/i.test(lowerReason)) {
      return 'Momentum MACD nghiêng về phe Long';
    }
    return 'MACD histogram ủng hộ bias hiện tại';
  }

  if (/funding/i.test(lowerName)) {
    if (/negative|short squeeze|âm/i.test(lowerReason)) {
      return 'Funding ủng hộ Long — Short có rủi ro squeeze';
    }
    if (/positive|dương|crowded long/i.test(lowerReason)) {
      return 'Funding cao — Long đang bị crowded';
    }
    return 'Điều kiện Funding chấp nhận được cho lệnh này';
  }

  if (/whale|wall|l\/s|ls ratio/i.test(lowerName)) {
    if (/ask|resistance|bán|distribution/i.test(lowerReason)) {
      return 'Tường bán lớn hạn chế khả năng tăng ngắn hạn';
    }
    if (/bid|support|mua|accumulation/i.test(lowerReason)) {
      return 'Whale tích lũy ủng hộ lệnh này';
    }
    return 'Dòng tiền tổ chức không chống lại vị thế';
  }

  if (/btc|bitcoin/i.test(lowerName)) {
    if (/against|ngược|weak/i.test(lowerReason)) {
      return 'Momentum BTC chưa xác nhận nhịp alt';
    }
    return 'Momentum BTC phù hợp với setup này';
  }

  if (/bollinger|%b|bandwidth/i.test(lowerName)) {
    if (/squeeze|co hẹp/i.test(lowerReason)) {
      return 'Biến động đang co hẹp — rủi ro breakout phía trước';
    }
    if (/upper|resistance|đỉnh/i.test(lowerReason)) {
      return 'Giá đang chạm band trên — kháng cự gần';
    }
    if (/lower|support|đáy/i.test(lowerReason)) {
      return 'Giá giữ trên band dưới — hỗ trợ còn vững';
    }
    return 'Cấu trúc Bollinger vẫn ổn định';
  }

  if (reason && !isTechnicalIdLine(`${name}: ${reason}`)) {
    return capitalizeSentence(reason);
  }

  if (layer.score > 0) {
    return `${name} xác nhận bias hiện tại`;
  }

  return null;
}

function translateLayerToWatch(layer: LayerResult): string | null {
  if (layer.passed && !layer.isMandatoryViolation) return null;
  const name = layer.name;
  const reason = layer.reason?.trim() ?? '';
  const lowerName = name.toLowerCase();
  const lowerReason = reason.toLowerCase();

  if (/bollinger|upper|resistance|đỉnh|%b/i.test(`${lowerName} ${lowerReason}`)) {
    return 'Đang tiến gần kháng cự — siết rủi ro nếu momentum suy yếu';
  }
  if (/rsi|macd|momentum|histogram/i.test(`${lowerName} ${lowerReason}`)) {
    if (/weak|giảm|fade|divergence/i.test(lowerReason)) {
      return 'Momentum đang suy yếu — theo dõi tín hiệu đảo chiều';
    }
  }
  if (/cvd|volume|l5/i.test(`${lowerName} ${lowerReason}`)) {
    if (/weak|giảm|fade|divergence/i.test(lowerReason)) {
      return 'Order flow đang quay ngược vị thế';
    }
  }
  if (/funding|squeeze|volatility|atr/i.test(`${lowerName} ${lowerReason}`)) {
    return 'Biến động cao dự kiến — điều chỉnh size phù hợp';
  }
  if (/whale|wall|distribution/i.test(`${lowerName} ${lowerReason}`)) {
    return 'Whale có thể đang phân phối trên đà tăng';
  }
  if (layer.isMandatoryViolation) {
    return reason
      ? capitalizeSentence(reason)
      : `${name} không đạt điều kiện bắt buộc`;
  }
  if (reason) {
    return capitalizeSentence(reason);
  }
  return `${name} chưa xác nhận lệnh`;
}

function translateWarningLine(line: string): string | null {
  const lower = line.toLowerCase();
  if (/hard block|chặn/i.test(lower)) {
    return 'Hard block đang bật — không nên tăng rủi ro mới';
  }
  if (/adx|choppy|sideways/i.test(lower)) {
    return 'Thị trường sideway — trend khó follow-through';
  }
  if (/squeeze|l11/i.test(lower)) {
    return 'Rủi ro squeeze cao — cần dự phòng biến động mạnh';
  }
  if (/reversal|đảo/i.test(lower)) {
    return 'Tín hiệu đảo chiều đang hình thành — cần cảnh giác';
  }
  if (/resistance|kháng cự/i.test(lower)) {
    return 'Đang tiến gần kháng cự';
  }
  if (/support|hỗ trợ/i.test(lower)) {
    return 'Vùng hỗ trợ đang được test';
  }
  if (/volatility|biến động/i.test(lower)) {
    return 'Biến động cao dự kiến';
  }
  if (/momentum|động lượng/i.test(lower)) {
    return 'Momentum đang suy yếu';
  }
  if (isTechnicalIdLine(line)) {
    return capitalizeSentence(line.replace(/^[^:]+:\s*/, ''));
  }
  return capitalizeSentence(line);
}

function translateDecisionDisplay(display: string, direction: TradeDirection): string | null {
  const lower = display.toLowerCase();
  if (/vào tự tin|setup ngon|confident/i.test(lower)) {
    return direction === 'SHORT'
      ? 'Chất lượng setup Short vẫn tốt trên scan mới nhất'
      : 'Chất lượng setup Long vẫn tốt trên scan mới nhất';
  }
  if (/chờ|wait|watch/i.test(lower)) {
    return 'Điều kiện chưa được xác nhận đầy đủ';
  }
  if (/không vào|no entry/i.test(lower)) {
    return 'Hiện tại chưa phải thời điểm phù hợp để mở vị thế mới';
  }
  if (display.trim()) {
    return capitalizeSentence(display);
  }
  return null;
}

function resolveDirectionalScore(scan: ProductionEsmScanContext | undefined): number | null {
  if (!scan) return null;
  const score =
    scan.direction === 'SHORT'
      ? scan.shortScore
      : scan.direction === 'LONG'
        ? scan.longScore
        : scan.score;
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  return score;
}

function isOpenActivePosition(snapshot: ProductionEsmBridgeSnapshot | undefined): boolean {
  return snapshot?.mappedCurrentState === StateMachineEntryState.ACTIVE;
}

/**
 * ESM scaffold emits PREPARE_EXIT for ACTIVE open positions ("Exit signal").
 * Presentation layer keeps HOLD when the latest scan still supports the trade.
 */
function shouldPresentActiveCloseAsHold(
  panel: EsmUlReviewExplanationPanel,
  scan: ProductionEsmScanContext | undefined,
  snapshot: ProductionEsmBridgeSnapshot | undefined,
): boolean {
  if (panel.recommendation !== 'Close Position' && panel.finalAction !== 'CLOSE') {
    return false;
  }
  if (!isOpenActivePosition(snapshot)) return false;
  if (!scan || scan.hardBlocked) return false;

  const mandatoryFailures =
    scan.mandatoryViolations.length +
    scan.layers.filter((layer) => layer.isMandatoryViolation).length;
  if (mandatoryFailures > 0) return false;

  const failedLayers = scan.layers.filter(
    (layer) => !layer.passed && !layer.isMandatoryViolation,
  );
  if (scan.layers.length > 0 && failedLayers.length >= Math.ceil(scan.layers.length / 2)) {
    return false;
  }

  const lowerDisplay = scan.decisionDisplay.toLowerCase();
  if (/không vào|no entry|blocked|chặn|emergency/i.test(lowerDisplay)) return false;

  const score = resolveDirectionalScore(scan);
  if (score != null && score < 6.5) return false;

  if (panel.warningFactors.length >= 4) return false;

  return true;
}

function resolveDecisionKind(
  panel: EsmUlReviewExplanationPanel,
  scan: ProductionEsmScanContext | undefined,
  riskLevel: UlReviewRiskLevel,
  snapshot?: ProductionEsmBridgeSnapshot,
): UlReviewExecutiveDecisionKind {
  const label = panel.recommendation;
  const action = panel.finalAction ?? '';
  const confidence = panel.confidence ?? 0;
  const warningCount = panel.warningFactors.length;

  if (label === 'Emergency Exit' || (action === 'CLOSE' && riskLevel === 'CRITICAL')) {
    return 'EXIT';
  }

  if (shouldPresentActiveCloseAsHold(panel, scan, snapshot)) {
    if (
      riskLevel === 'HIGH' ||
      (riskLevel === 'MODERATE' && warningCount >= 2 && confidence < 75)
    ) {
      return 'REDUCE';
    }
    if (confidence >= 82 && warningCount === 0) {
      return 'STRONG_HOLD';
    }
    return 'HOLD';
  }

  if (label === 'Close Position' || action === 'CLOSE') {
    const combined = panel.warningFactors.join(' ').toLowerCase();
    if (/tp|take profit|chốt|partial|50%|target/i.test(combined)) {
      return 'PARTIAL_TP';
    }
    return 'EXIT';
  }

  if (label === 'Wait Confirmation' || label === 'No Action' || action === 'WAIT') {
    return 'WAIT';
  }

  if (label === 'Hold Position' || action === 'HOLD') {
    if (
      riskLevel === 'HIGH' ||
      (riskLevel === 'MODERATE' && warningCount >= 2 && confidence < 75)
    ) {
      return 'REDUCE';
    }
    if (confidence >= 82 && warningCount === 0) {
      return 'STRONG_HOLD';
    }
    const display = scan?.decisionDisplay?.toLowerCase() ?? '';
    if (/tp|chốt|partial|target reached/i.test(display)) {
      return 'PARTIAL_TP';
    }
    return 'HOLD';
  }

  return 'HOLD';
}

const DECISION_PRESENTATION: Record<
  UlReviewExecutiveDecisionKind,
  { badge: string; title: string }
> = {
  STRONG_HOLD: { badge: '🟢 Giữ mạnh', title: 'GIỮ LỆNH' },
  HOLD: { badge: '🟢 Giữ lệnh', title: 'GIỮ LỆNH' },
  PARTIAL_TP: { badge: '🟡 Take Profit một phần', title: 'TAKE PROFIT 50%' },
  REDUCE: { badge: '🟠 Giảm exposure', title: 'GIẢM VỊ THẾ' },
  EXIT: { badge: '🔴 Thoát lệnh', title: 'ĐÓNG LỆNH' },
  WAIT: { badge: '🔵 Chờ xác nhận', title: 'CHỜ' },
};

function resolveRiskLevel(
  panel: EsmUlReviewExplanationPanel,
  scan: ProductionEsmScanContext | undefined,
  snapshot?: ProductionEsmBridgeSnapshot,
): UlReviewRiskLevel {
  if (panel.recommendation === 'Emergency Exit') return 'CRITICAL';
  if (scan?.hardBlocked) return 'CRITICAL';
  if (
    panel.recommendation === 'Close Position' &&
    !shouldPresentActiveCloseAsHold(panel, scan, snapshot)
  ) {
    return 'HIGH';
  }

  const warnings = panel.warningFactors.length;
  const confidence = panel.confidence ?? 50;

  if (warnings >= 4 || confidence < 45) return 'HIGH';
  if (warnings >= 2 || confidence < 60) return 'MODERATE';
  if (warnings === 1) return 'MODERATE';
  return 'LOW';
}

function resolveNextAction(kind: UlReviewExecutiveDecisionKind): string {
  switch (kind) {
    case 'STRONG_HOLD':
      return 'Tiếp tục giữ lệnh — cấu trúc và dòng tiền vẫn thuận lợi.';
    case 'HOLD':
      return 'Tiếp tục giữ lệnh. Xem lại sau scan tiếp theo.';
    case 'PARTIAL_TP':
      return 'Take Profit một phần và bảo vệ phần còn lại.';
    case 'REDUCE':
      return 'Giảm exposure hoặc siết Stop Loss đến khi rủi ro cải thiện.';
    case 'EXIT':
      return 'Khuyến nghị đóng lệnh vì mức rủi ro hiện đã lớn hơn lợi nhuận kỳ vọng.';
    case 'WAIT':
      return 'Chờ xác nhận trước khi tăng thêm rủi ro.';
    default:
      return 'Xem lại sau scan tiếp theo.';
  }
}

function collectWhyReasons(
  panel: EsmUlReviewExplanationPanel,
  scan: ProductionEsmScanContext | undefined,
  direction: TradeDirection,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (line: string | null | undefined) => {
    if (!line) return;
    const normalized = normalizeKey(line);
    if (!normalized || seen.has(normalized)) return;
    if (isTechnicalIdLine(line)) return;
    seen.add(normalized);
    out.push(ensurePeriod(capitalizeSentence(line)));
  };

  if (scan) {
    push(translateDecisionDisplay(scan.decisionDisplay, direction));
    for (const layer of scan.layers) {
      if (out.length >= MAX_WHY) break;
      push(translateLayerToWhy(layer, direction));
    }
  }

  for (const line of panel.supportingReasons) {
    if (out.length >= MAX_WHY) break;
    if (isTechnicalIdLine(line)) {
      const afterColon = line.includes(':') ? line.split(':').slice(1).join(':').trim() : line;
      push(translateWarningLine(afterColon));
    } else {
      push(line);
    }
  }

  if (out.length === 0 && panel.finalAction === 'HOLD') {
    push('Chưa phát hiện tín hiệu thoát trên scan mới nhất');
  }
  if (out.length === 0 && panel.finalAction === 'CLOSE') {
    push('Đã đủ điều kiện thoát trên scan mới nhất');
  }
  if (out.length === 0 && panel.finalAction === 'WAIT') {
    push('Setup cần thêm xác nhận trước khi hành động');
  }

  return out.slice(0, MAX_WHY);
}

function collectWatchOut(
  panel: EsmUlReviewExplanationPanel,
  scan: ProductionEsmScanContext | undefined,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (line: string | null | undefined) => {
    if (!line) return;
    const normalized = normalizeKey(line);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(ensurePeriod(capitalizeSentence(line)));
  };

  if (scan) {
    for (const layer of scan.layers) {
      if (out.length >= MAX_WATCH) break;
      push(translateLayerToWatch(layer));
    }
    for (const block of [...scan.hardBlocks, ...scan.groupBlocks, ...scan.blockReasons]) {
      if (out.length >= MAX_WATCH) break;
      push(translateWarningLine(block));
    }
    push(scan.squeezeWarning ? translateWarningLine(scan.squeezeWarning) : null);
    push(scan.adxBlockReason ? translateWarningLine(scan.adxBlockReason) : null);
    push(scan.ambiguousMessage ? translateWarningLine(scan.ambiguousMessage) : null);
  }

  for (const line of panel.warningFactors) {
    if (out.length >= MAX_WATCH) break;
    push(translateWarningLine(line));
  }

  if (out.length === 0 && panel.finalAction === 'HOLD') {
    push('Không có cảnh báo lớn trên scan mới nhất');
  }

  return out.slice(0, MAX_WATCH);
}

function formatLayerDiagnostic(layer: LayerResult): string {
  const status = layer.passed ? '✔' : layer.isMandatoryViolation ? '✖' : '○';
  const score =
    layer.maxScore > 0 ? ` (${layer.score}/${layer.maxScore})` : '';
  const reason = layer.reason ? ` — ${layer.reason}` : '';
  return `${status} ${layer.layer} ${layer.name}${score}${reason}`;
}

function collectAdvancedDiagnostics(
  panel: EsmUlReviewExplanationPanel,
  snapshot: ProductionEsmBridgeSnapshot | undefined,
  scan: ProductionEsmScanContext | undefined,
): string[] {
  const lines: string[] = [];

  lines.push(`Recommendation: ${panel.recommendation}`);
  if (panel.finalAction) lines.push(`Final action: ${panel.finalAction}`);
  if (panel.confidence != null) lines.push(`Confidence: ${panel.confidence}%`);
  if (panel.decisionScore) lines.push(`Decision score: ${panel.decisionScore}`);
  if (panel.updatedAt) lines.push(`Updated: ${panel.updatedAt}`);

  if (scan) {
    lines.push(`Decision display: ${scan.decisionDisplay}`);
    lines.push(`Direction: ${scan.direction}`);
    lines.push(`Can enter: ${scan.canEnter ? 'yes' : 'no'}`);
    if (scan.winrate) lines.push(`Winrate: ${scan.winrate}`);
    if (scan.finalEntryStatus) lines.push(`Entry status: ${scan.finalEntryStatus}`);
    if (scan.hardBlocked) lines.push('Hard blocked: yes');

    if (scan.layers.length > 0) {
      lines.push('— Layer diagnostics —');
      for (const layer of scan.layers) {
        lines.push(formatLayerDiagnostic(layer));
      }
    }

    for (const v of scan.mandatoryViolations) {
      lines.push(`✖ Mandatory: ${v}`);
    }
    for (const b of scan.hardBlocks) lines.push(`✖ Hard block: ${b}`);
    for (const b of scan.groupBlocks) lines.push(`○ Group block: ${b}`);
    for (const r of scan.blockReasons) lines.push(`○ Block reason: ${r}`);
    for (const w of scan.warnings) lines.push(`⚠ Warning: ${w}`);
    for (const w of scan.scoringWarnings) lines.push(`⚠ Scoring warning: ${w}`);
    if (scan.squeezeWarning) lines.push(`⚠ Squeeze: ${scan.squeezeWarning}`);
    if (scan.adxBlockReason) lines.push(`⚠ ADX: ${scan.adxBlockReason}`);
    if (scan.ambiguousMessage) lines.push(`⚠ Ambiguous: ${scan.ambiguousMessage}`);
  }

  if (panel.supportingReasons.length > 0) {
    lines.push('— Supporting factors (raw) —');
    for (const line of panel.supportingReasons) {
      lines.push(`✔ ${line}`);
    }
  }

  if (panel.warningFactors.length > 0) {
    lines.push('— Warning factors (raw) —');
    for (const line of panel.warningFactors) {
      lines.push(`⚠ ${line}`);
    }
  }

  if (panel.rejectedActions.length > 0) {
    lines.push('— Rejected alternatives —');
    for (const alt of panel.rejectedActions) {
      lines.push(formatRejectedAction(alt));
    }
  }

  const message = snapshot?.message?.trim();
  if (message) lines.push(`Bridge: ${message}`);

  return lines;
}

function formatRejectedAction(action: EsmUlReviewRejectedAction): string {
  return `○ ${action.label} — ${action.reason}`;
}

/**
 * Build executive summary for UL Review popup — presentation only.
 */
export function resolveEsmUlReviewExecutiveSummary(
  panel: EsmUlReviewExplanationPanel,
  snapshot?: ProductionEsmBridgeSnapshot | null,
  tradeDirection?: TradeDirection,
): EsmUlReviewExecutiveSummary | null {
  if (!panel.hasContent) return null;

  const scan = snapshot?.scanContext;
  const direction = tradeDirection ?? scan?.direction ?? 'LONG';
  const riskLevel = resolveRiskLevel(panel, scan, snapshot ?? undefined);
  const decisionKind = resolveDecisionKind(panel, scan, riskLevel, snapshot ?? undefined);
  const presentation = DECISION_PRESENTATION[decisionKind];

  return {
    decisionKind,
    decisionBadge: presentation.badge,
    decisionTitle: presentation.title,
    confidence: panel.confidence,
    riskLevel,
    whyReasons: collectWhyReasons(panel, scan, direction),
    watchOut: collectWatchOut(panel, scan),
    nextAction: resolveNextAction(decisionKind),
    advancedDiagnostics: collectAdvancedDiagnostics(panel, snapshot ?? undefined, scan),
  };
}
