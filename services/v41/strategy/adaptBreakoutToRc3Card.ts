/**
 * Map BreakoutTradeLevels → V41Rc3SignalCardModel (cùng contract RC3 với đường TR).
 * Pure adapter — chưa wire vào buildRc3ViewModelFromRow.
 *
 * Mapping notes:
 * - decision / levels: từ side + entry/sl/tp1 khi có setup Confirm B.
 * - triggerType: 'Breakout Confirmed' (không dùng 'Fake Breakout').
 * - checklist: 4 mục breakout (consolidation / breakout / retest / momentum) —
 *   bắt buộc trên card; khi có levels coi như cả 4 đã pass (detector đã lọc).
 * - confidence (card): null — không bịa điểm 0–100 kiểu Decision engine TR.
 * - gate.confidenceTr: null; confidenceMet = true khi ACTIVE (Confirm B thay gate TR).
 */

import type { BreakoutTradeLevels } from '../breakoutDetector';
import type { SignalRowV41 } from '../scanV41';
import {
  symbolDisplayName,
  type V41ChecklistItem,
  type V41DecisionUi,
  type V41Rc3SignalCardModel,
  type V41TradeLevelsUi,
  type V41TrGateSummaryUi,
} from '../rc3/rc3ViewModelTypes';

/** Breakout checklist — song song cấu trúc 4-item TR nhưng semantics khác. */
export const BREAKOUT_CHECKLIST_IDS = [
  'consolidation',
  'breakout',
  'retest',
  'momentum',
] as const;

const BREAKOUT_CHECKLIST_LABELS: Record<(typeof BREAKOUT_CHECKLIST_IDS)[number], string> = {
  consolidation: 'Consolidation',
  breakout: 'Breakout',
  retest: 'Retest Confirm',
  momentum: 'Momentum Aligned',
};

/** Gate UI: đủ 4 bước Confirm B pipeline (không dùng ngưỡng confidence TR). */
export const BREAKOUT_GATE_SIGNALS_REQUIRED = 4;
export const BREAKOUT_GATE_CONFIDENCE_MIN = 0;

function buildBreakoutChecklist(allPassed: boolean): V41ChecklistItem[] {
  return BREAKOUT_CHECKLIST_IDS.map((id) => ({
    id,
    label: BREAKOUT_CHECKLIST_LABELS[id],
    passed: allPassed,
  }));
}

function buildBreakoutGate(allPassed: boolean): V41TrGateSummaryUi {
  const signalsPassed = allPassed ? BREAKOUT_GATE_SIGNALS_REQUIRED : 0;
  const signalsMet = signalsPassed >= BREAKOUT_GATE_SIGNALS_REQUIRED;
  /** Confirm B setup thay cho confidenceTr — không bịa số 0–100. */
  const confidenceMet = allPassed;
  return {
    signalsPassed,
    signalsRequired: BREAKOUT_GATE_SIGNALS_REQUIRED,
    signalsTotal: BREAKOUT_CHECKLIST_IDS.length,
    confidenceTr: null,
    confidenceMin: BREAKOUT_GATE_CONFIDENCE_MIN,
    signalsMet,
    confidenceMet,
    activeEligible: signalsMet && confidenceMet,
  };
}

function levelsFromBreakout(levels: BreakoutTradeLevels): V41TradeLevelsUi {
  // tp2/tp3 bắt buộc trên V41TradeLevelsUi — chưa có rule riêng → mirror tp1 (không bịa R ladder).
  return {
    entry: levels.entry,
    stop: levels.sl,
    tp1: levels.tp1,
    tp2: levels.tp1,
    tp3: levels.tp1,
    rr: levels.tp1RR,
  };
}

function decisionFromLevels(levels: BreakoutTradeLevels | null): V41DecisionUi {
  if (levels == null) return 'WATCH';
  return levels.side === 'LONG' ? 'LONG' : 'SHORT';
}

/**
 * Adapt breakout setup (hoặc null = chưa có Confirm B active) → RC3 card.
 * row.error → IGNORE (cùng tinh thần empty/error card TR).
 */
export function adaptBreakoutToRc3Card(
  breakoutLevels: BreakoutTradeLevels | null,
  row: SignalRowV41,
): V41Rc3SignalCardModel {
  const symbol = row.symbol;
  const displayName = symbolDisplayName(symbol);
  const fetchedAt = row.fetchedAt ?? null;

  if (row.error) {
    return {
      symbol,
      displayName,
      triggerType: null,
      confidence: null,
      gate: buildBreakoutGate(false),
      checklist: buildBreakoutChecklist(false),
      levels: null,
      decision: 'IGNORE',
      fetchedAt,
    };
  }

  const active = breakoutLevels != null;
  const checklist = buildBreakoutChecklist(active);
  const gate = buildBreakoutGate(active);

  return {
    symbol,
    displayName,
    triggerType: active ? 'Breakout Confirmed' : null,
    /**
     * Không map tp1RR → confidence: RR là kích thước mục tiêu, không phải xác suất.
     * null = chưa có confidence engine riêng cho breakout (khác Decision engine TR).
     */
    confidence: null,
    gate,
    checklist,
    levels: active && breakoutLevels != null ? levelsFromBreakout(breakoutLevels) : null,
    decision: decisionFromLevels(breakoutLevels),
    fetchedAt,
  };
}
