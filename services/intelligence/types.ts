/**
 * Phase 14 — Trading Intelligence types.
 * Data source: AiTradeJournalEntry (TI View) only.
 * Rule #51: AI Read / Analyze / Suggest — không trade.
 */

export const RULE_51_AI_SUGGEST_ONLY = 51 as const;
export const RULE_57_JOURNAL_INTEL_READ_ONLY = 57 as const;
export const RULE_58_REPLAY_TIMELINE_ONLY = 58 as const;
export const RULE_59_AI_SUMMARY_HAS_EVIDENCE = 59 as const;
export const RULE_60_OUTCOME_REPRODUCIBLE = 60 as const;
export const RULE_61_JOURNAL_IS_CANONICAL = 61 as const;
/** Every Intelligence Section Has Source */
export const RULE_62_SECTION_HAS_SOURCE = 62 as const;
/** Replay Version metadata */
export const RULE_63_REPLAY_VERSION = 63 as const;
/** AI Summary Version metadata */
export const RULE_64_SUMMARY_VERSION = 64 as const;
/** Intelligence Cache keyed by projectionVersion */
export const RULE_65_INTELLIGENCE_CACHE = 65 as const;

export type IntelligenceAdviserStep = {
  sequence: number;
  advisorActionCode: string;
  advisorReasonCode: string;
  /** UI-friendly action label */
  actionLabel: string;
  atMs: number | null;
};

export type IntelligenceTimelineEvent = {
  sequence: number;
  kind: string;
  label: string;
  atMs: number | null;
};

export type IntelligenceSectionId =
  | 'tradeSummary'
  | 'decisionSnapshot'
  | 'marketSnapshot'
  | 'advisorTimeline'
  | 'eventTimeline'
  | 'replay'
  | 'outcome'
  | 'rootCause'
  | 'evidence'
  | 'aiSummary';

/** Rule #62 — section → human-readable TI View source */
export type IntelligenceSectionSource = {
  section: IntelligenceSectionId;
  source: string;
};

export type JournalTradeSummary = {
  coin: string;
  strategy: string | null;
  direction: string;
  pnlUsdt: number | null;
  rr: number | null;
  holdingTimeMinutes: number | null;
  status: string;
};

export type JournalDecisionSnapshot = {
  decision: string;
  confidence: number | null;
  trigger: string | null;
  checklist: { label: string; passed: boolean }[];
  entryReason: string | null;
};

export type JournalMarketSnapshotView = {
  trend: string;
  funding: number;
  whale: number;
  btcContext: number;
  volatility: number;
  marketStructure: string;
  liquidity: string;
  session: string;
};

export type RootCauseCategory =
  | 'Entry'
  | 'Management'
  | 'Exit'
  | 'Market'
  | 'System';

export type JournalRootCauseResult = {
  category: RootCauseCategory;
  primary: string;
  detail: string;
};

export type JournalOutcomeAnalysisResult = {
  success: boolean | null;
  failure: boolean | null;
  pnlUsdt: number | null;
  rr: number | null;
  executionQuality: number;
  riskQuality: number;
  disciplineScore: number;
  advisorAccuracy: number | null;
  summary: string;
};

export type JournalEvidenceItem = {
  id: string;
  claim: string;
  sourceField: string;
  value: string;
  relatedTradeIds: string[];
  /** Rule #62 section provenance */
  sectionSource?: string;
};

export type JournalAiSummaryResult = {
  text: string;
  evidenceIds: string[];
  /** Rule #64 — metadata only; does not regenerate narrative */
  summaryVersion: number;
  /** Tags AI may read — never created by AI (append-only derived list) */
  tagsRead: readonly string[];
};

export type JournalReplayState = {
  tradeId: string;
  index: number;
  playing: boolean;
  events: IntelligenceTimelineEvent[];
  current: IntelligenceTimelineEvent | null;
  /** Rule #63 */
  replayVersion: number;
};

export type JournalEntryIntelligence = {
  tradeId: string;
  triggerCode: string | null;
  decisionCode: string | null;
  strategyVersion: string | null;
  confidence: number | null;
  featureSetVersion: string | null;
  engineVersion: string | null;
  /** Cache key / projector lineage (from tags or derived) */
  projectionVersion: string | null;
  isProjected: boolean;
  tradeSummary: JournalTradeSummary;
  decisionSnapshot: JournalDecisionSnapshot;
  marketSnapshot: JournalMarketSnapshotView;
  adviserTimeline: IntelligenceAdviserStep[];
  eventTimeline: IntelligenceTimelineEvent[];
  confidenceSnapshot: { confidence: number | null; score: number | null };
  triggerSnapshot: { triggerCode: string | null; openReason: string | null };
  checklistSnapshot: { label: string; passed: boolean }[];
  outcome: JournalOutcomeAnalysisResult;
  rootCause: JournalRootCauseResult;
  evidence: JournalEvidenceItem[];
  aiSummary: JournalAiSummaryResult;
  /** Rule #62 */
  sectionSources: IntelligenceSectionSource[];
  /** Search-ready trade tags (derived; append-only view — never written to Journal) */
  tradeTags: string[];
  /** @deprecated use aiSummary.text */
  outcomeAnalysis: string;
  replayReady: boolean;
  /** Rule #63 */
  replayVersion: number;
  /** Rule #64 */
  summaryVersion: number;
};

export type WinrateBucketRow = {
  key: string;
  trades: number;
  wins: number;
  winRate: number | null;
};

export type StatisticsIntelligence = {
  byCoin: WinrateBucketRow[];
  byStrategy: WinrateBucketRow[];
  byTrigger: WinrateBucketRow[];
  byConfidence: WinrateBucketRow[];
  byFunding: WinrateBucketRow[];
  byWhale: WinrateBucketRow[];
  holdingTimeAvgMinutes: number | null;
  averageRr: number | null;
  expectancyUsdt: number | null;
  maxDrawdownUsdt: number | null;
  profitFactor: number | null;
  sessionStats: WinrateBucketRow[];
  distribution: { wins: number; losses: number; breakevens: number; cancelled: number };
  sampleSize: number;
};

export type PerformanceVersionRow = {
  version: string;
  trades: number;
  winRate: number | null;
  avgPnlUsdt: number | null;
};

export type PerformanceIntelligence = {
  byVersion: PerformanceVersionRow[];
  byCoin: WinrateBucketRow[];
  byTrigger: WinrateBucketRow[];
  byTrend: WinrateBucketRow[];
  byVolatilityProxy: WinrateBucketRow[];
  byFunding: WinrateBucketRow[];
  byWhale: WinrateBucketRow[];
  byAdvisor: WinrateBucketRow[];
  aiRecommendations: string[];
};

export type DashboardIntelligence = {
  systemHealth: 'OK' | 'DEGRADED' | 'UNKNOWN';
  desktopSync: string;
  queueDepth: number | null;
  ackPending: number | null;
  projector: string;
  eventStore: string;
  journalHealth: string;
  projectionVersion: string | null;
  pendingEvents: number;
  replayReadyCount: number;
  aiInsight: string;
};

export type DashboardHealthInput = {
  syncStatus?: string;
  queueDepth?: number;
  ackPending?: number;
  projectorStatus?: string;
  eventStoreStatus?: string;
};
