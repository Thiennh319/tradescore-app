import {
  FinalEntryStatus,
  type ScoringDecisionInput,
} from '../types/scoring';
import type { AppTradeSymbol, TradeDecisionLabel, TradePlanV3 } from '../constants/scoring';
import type { SqueezeRiskResult } from '../types/squeezeRisk';
import { formatUsdPrice } from '../utils/formatPrice';

const SCORE_BLOCKED_DECISIONS: ReadonlySet<TradeDecisionLabel> = new Set([
  'KHONG_VAO',
  'CHO_THEM',
  'CHO_TAI_CHAM',
]);

export function calculateFinalEntryStatus(
  scoringDecision: ScoringDecisionInput,
  tradePlanValid: boolean,
  hardBlock: boolean,
  groupBlock: boolean,
): FinalEntryStatus {
  if (hardBlock) return FinalEntryStatus.HARD_BLOCKED;
  if (groupBlock) return FinalEntryStatus.GROUP_BLOCKED;
  if (SCORE_BLOCKED_DECISIONS.has(scoringDecision)) {
    return FinalEntryStatus.SCORE_BLOCKED;
  }
  if (!tradePlanValid) return FinalEntryStatus.WAIT_ENTRY;
  return FinalEntryStatus.ENTRY_VALID;
}

export const FINAL_ENTRY_BORDER_COLORS: Record<FinalEntryStatus, string> = {
  [FinalEntryStatus.ENTRY_VALID]: '#10B981',
  [FinalEntryStatus.WAIT_ENTRY]: '#F97316',
  [FinalEntryStatus.SCORE_BLOCKED]: '#6B7280',
  [FinalEntryStatus.GROUP_BLOCKED]: '#FCA5A5',
  [FinalEntryStatus.HARD_BLOCKED]: '#EF4444',
};

/** Viền ENTRY_VALID theo mức quyết định scoring. */
export const ENTRY_VALID_DECISION_BORDER: Partial<Record<TradeDecisionLabel, string>> = {
  SETUP_NGON: '#F59E0B',
  VAO_TU_TIN: '#10B981',
  CO_THE_VAO: '#6EE7B7',
};

export interface FinalEntryDisplay {
  label: string;
  subtitle: string | null;
  borderColor: string;
  pulse: boolean;
}

export interface FinalEntryDisplayInput {
  status: FinalEntryStatus;
  scoringDecision: TradeDecisionLabel;
  score?: number | null;
  maxScore?: number;
  plan?: TradePlanV3 | null;
  symbol?: string;
  hardBlockReasons?: string[];
  groupBlockReasons?: string[];
}

export function resolveFinalEntryDisplay(input: FinalEntryDisplayInput): FinalEntryDisplay {
  const {
    status,
    scoringDecision,
    score,
    maxScore = 15,
    plan,
    symbol,
    hardBlockReasons = [],
    groupBlockReasons = [],
  } = input;

  switch (status) {
    case FinalEntryStatus.HARD_BLOCKED:
      return {
        label: 'HARD BLOCK 🚫',
        subtitle: hardBlockReasons[0] ?? 'Hard block đang active',
        borderColor: FINAL_ENTRY_BORDER_COLORS[FinalEntryStatus.HARD_BLOCKED],
        pulse: true,
      };
    case FinalEntryStatus.GROUP_BLOCKED:
      return {
        label: 'CHẶN NHÓM ⛔',
        subtitle: formatGroupBlockSubtitle(groupBlockReasons),
        borderColor: FINAL_ENTRY_BORDER_COLORS[FinalEntryStatus.GROUP_BLOCKED],
        pulse: false,
      };
    case FinalEntryStatus.SCORE_BLOCKED:
      return {
        label: 'KHÔNG VÀO',
        subtitle: null,
        borderColor: FINAL_ENTRY_BORDER_COLORS[FinalEntryStatus.SCORE_BLOCKED],
        pulse: false,
      };
    case FinalEntryStatus.WAIT_ENTRY: {
      const entryStr =
        plan && symbol
          ? formatUsdPrice(symbol as AppTradeSymbol, plan.entryZone.optimal)
          : plan
            ? plan.entryZone.optimal.toFixed(4)
            : '—';
      const scoreStr = score != null ? `${score.toFixed(1)}/${maxScore}` : `—/${maxScore}`;
      const rrStr = plan != null ? plan.primaryRR.toFixed(2) : '—';
      return {
        label: 'SETUP TỐT — CHỜ ENTRY 🎯',
        subtitle: `Điểm ${scoreStr} — R:R chưa đủ 2:1 (${rrStr}:1)\nChờ giá về ${entryStr} USDT`,
        borderColor: FINAL_ENTRY_BORDER_COLORS[FinalEntryStatus.WAIT_ENTRY],
        pulse: false,
      };
    }
    case FinalEntryStatus.ENTRY_VALID:
    default: {
      const decisionLabels: Record<string, string> = {
        SETUP_NGON: 'SETUP NGON 🔥',
        VAO_TU_TIN: 'VÀO TỰ TIN ✅',
        CO_THE_VAO: 'CÓ THỂ VÀO',
      };
      return {
        label: decisionLabels[scoringDecision] ?? scoringDecision,
        subtitle: null,
        borderColor:
          ENTRY_VALID_DECISION_BORDER[scoringDecision] ??
          FINAL_ENTRY_BORDER_COLORS[FinalEntryStatus.ENTRY_VALID],
        pulse: false,
      };
    }
  }
}

function formatGroupBlockSubtitle(groupBlockReasons: string[]): string {
  if (groupBlockReasons.length === 0) return 'Nhóm điểm dưới ngưỡng tối thiểu';
  const raw = groupBlockReasons[0];
  const match = raw.match(/Nhóm\s+([ABC])/i);
  if (match) {
    return `Group ${match[1]}: ${raw.replace(/^Nhóm\s+[ABC]\s*\([^)]+\)\s*/i, '')}`;
  }
  return raw;
}

export interface SideBlockInput {
  hardBlocks: string[];
  groupBlocks: string[];
}

export interface FinalEntrySideResult {
  finalEntryStatus: FinalEntryStatus;
  squeezeWarning: string | null;
}

export function resolveSqueezeWarning(
  finalStatus: FinalEntryStatus,
  tradeSide: 'LONG' | 'SHORT',
  squeezeRisk?: SqueezeRiskResult | null,
): string | null {
  if (finalStatus !== FinalEntryStatus.ENTRY_VALID || !squeezeRisk) return null;

  if (
    tradeSide === 'LONG' &&
    squeezeRisk.direction === 'LONG_SQUEEZE' &&
    squeezeRisk.level === 'EXTREME'
  ) {
    return '⚠️ Cảnh báo: thị trường có dấu hiệu ép Long mạnh';
  }

  if (
    tradeSide === 'SHORT' &&
    squeezeRisk.direction === 'SHORT_SQUEEZE' &&
    squeezeRisk.level === 'EXTREME'
  ) {
    return '⚠️ Cảnh báo: thị trường có dấu hiệu ép Short mạnh';
  }

  return null;
}

export function computeFinalEntryStatusForSide(
  decisionLabel: TradeDecisionLabel,
  tradePlan: TradePlanV3 | null | undefined,
  side: SideBlockInput,
  options?: {
    tradeSide?: 'LONG' | 'SHORT';
    squeezeRisk?: SqueezeRiskResult | null;
  },
): FinalEntrySideResult {
  const finalEntryStatus = calculateFinalEntryStatus(
    decisionLabel,
    tradePlan?.tradePlanValid ?? false,
    side.hardBlocks.length > 0,
    side.groupBlocks.length > 0,
  );

  return {
    finalEntryStatus,
    squeezeWarning: resolveSqueezeWarning(
      finalEntryStatus,
      options?.tradeSide ?? 'LONG',
      options?.squeezeRisk,
    ),
  };
}
