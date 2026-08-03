/**
 * Task 14.3 — Performance Intelligence types.
 * Rules #80–#87 · Read Only · Ranking / Compare / Recommend only.
 */

export const RULE_80_NO_METRIC_DEFINITION = 80 as const;
export const RULE_81_RANKING_ONLY = 81 as const;
export const RULE_82_RECOMMENDATION_HAS_EVIDENCE = 82 as const;
export const RULE_83_VIEWMODEL_IMMUTABLE = 83 as const;
export const RULE_84_RANKING_DETERMINISTIC = 84 as const;
export const RULE_85_RECOMMENDATION_VERSION = 85 as const;
export const RULE_86_PERFORMANCE_SNAPSHOT = 86 as const;
export const RULE_87_PERFORMANCE_CACHE = 87 as const;

export const PERFORMANCE_VERSION = 1 as const;
export const RECOMMENDATION_VERSION = 1 as const;
export const STATISTICS_CONSUMER_VERSION = 1 as const;

export type PerformanceGrade = 'A' | 'B' | 'C' | 'D' | 'F' | 'NA';

export type RankedRow = {
  rank: number;
  key: string;
  score: number;
  /** Copied from Statistics — never recomputed */
  winRate: number | null;
  profitFactor: number | null;
  expectancyUsdt: number | null;
  averageRr: number | null;
  pnlUsdt: number | null;
  trades: number;
  avgHoldingMinutes: number | null;
  /** Optional fields from Statistics group */
  successRate?: number | null;
  averageProfitUsdt?: number | null;
  occurrences?: number;
};

export type PerformanceOverall = {
  overallScore: number | null;
  overallRank: string;
  overallGrade: PerformanceGrade;
  systemStability: number | null;
  consistency: number | null;
  growthTrend: 'UP' | 'FLAT' | 'DOWN' | 'NA';
};

export type ConfidenceAnalysis = {
  key: string;
  trades: number;
  winRate: number | null;
  averageRr: number | null;
  pnlUsdt: number | null;
  /** Gap vs sample expectancy direction — interpretation only */
  calibrationNote: string;
};

export type TagIntelligence = {
  topWinningTags: RankedRow[];
  topLosingTags: RankedRow[];
  bestTagCombination: RankedRow | null;
  worstTagCombination: RankedRow | null;
};

export type TrendSnapshot = {
  window: '7d' | '30d' | '90d';
  winrateTrend: 'UP' | 'FLAT' | 'DOWN' | 'NA';
  profitTrend: 'UP' | 'FLAT' | 'DOWN' | 'NA';
  drawdownTrend: 'UP' | 'FLAT' | 'DOWN' | 'NA';
  recoveryTrend: 'UP' | 'FLAT' | 'DOWN' | 'NA';
  evidence: string;
};

export type PerformanceRecommendation = {
  id: string;
  action: 'PRIORITIZE' | 'REDUCE' | 'MONITOR';
  target: string;
  reason: string;
  evidenceIds: string[];
  evidence: string[];
};

export type ComparisonAxis = {
  axis: string;
  rows: RankedRow[];
};

export type PerformanceSnapshotMeta = {
  performanceVersion: typeof PERFORMANCE_VERSION;
  statisticsVersion: typeof STATISTICS_CONSUMER_VERSION;
  recommendationVersion: typeof RECOMMENDATION_VERSION;
  projectionFingerprint: string;
  statisticsFingerprint: string;
  generatedAt: string;
};

export type PerformanceViewModel = {
  overall: PerformanceOverall;
  strategyRanking: RankedRow[];
  coinRanking: RankedRow[];
  triggerRanking: RankedRow[];
  confidenceAnalysis: ConfidenceAnalysis[];
  advisorRanking: RankedRow[];
  tagIntelligence: TagIntelligence;
  trends: TrendSnapshot[];
  recommendations: PerformanceRecommendation[];
  comparisons: ComparisonAxis[];
  snapshot: PerformanceSnapshotMeta;
};
