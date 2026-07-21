/**
 * TASK 16.0 — AI Export Framework (Phase 1). Architecture: FROZEN.
 *
 * Input contracts for the AI Export layer. Every field is optional:
 * the caller feeds frozen engine snapshots in, the framework copies
 * values verbatim into Markdown. Missing data renders as UNAVAILABLE —
 * the framework never invents values and never touches the engines.
 */

export type AiExportScalar = string | number | boolean | null | undefined;

/** Metadata Contract — rendered at the top of every exported file. */
export interface AiExportMetadata {
  version?: AiExportScalar;
  exportVersion?: AiExportScalar;
  tradeId?: AiExportScalar;
  generatedAt?: AiExportScalar;
  engineVersion?: AiExportScalar;
  analyticsVersion?: AiExportScalar;
  ruleVersion?: AiExportScalar;
  entryVersion?: AiExportScalar;
  positionAdviserVersion?: AiExportScalar;
  coin?: AiExportScalar;
  side?: AiExportScalar;
}

export interface AiExportRuleItem {
  id?: AiExportScalar;
  title?: AiExportScalar;
  layer?: AiExportScalar;
  mandatory?: boolean | null;
  status?: AiExportScalar;
  score?: AiExportScalar;
  maxScore?: AiExportScalar;
  reason?: AiExportScalar;
  recommendation?: AiExportScalar;
}

export interface RuleBookExportInput {
  rules?: readonly AiExportRuleItem[] | null;
  totalRules?: AiExportScalar;
  passedRules?: AiExportScalar;
  failedRules?: AiExportScalar;
  warningRules?: AiExportScalar;
}

export interface AiExportLayerScore {
  name?: AiExportScalar;
  score?: AiExportScalar;
  maxScore?: AiExportScalar;
  reason?: AiExportScalar;
}

export interface ScoreEngineExportInput {
  layers?: readonly AiExportLayerScore[] | null;
  groupScores?: Readonly<Record<string, AiExportScalar>> | null;
  totalScore?: AiExportScalar;
  maxScore?: AiExportScalar;
  grade?: AiExportScalar;
  decision?: AiExportScalar;
}

export interface AiExportEntryCheck {
  name?: AiExportScalar;
  status?: AiExportScalar;
  detail?: AiExportScalar;
}

export interface EntryQualityExportInput {
  checks?: readonly AiExportEntryCheck[] | null;
  entryScore?: AiExportScalar;
  entryDecision?: AiExportScalar;
  reason?: AiExportScalar;
}

export interface AiExportAdviserAction {
  priority?: AiExportScalar;
  action?: AiExportScalar;
  reason?: AiExportScalar;
}

export interface PositionAdviserExportInput {
  positionState?: AiExportScalar;
  advice?: AiExportScalar;
  riskLevel?: AiExportScalar;
  actions?: readonly AiExportAdviserAction[] | null;
}

export interface TradePlanExportInput {
  entryPrice?: AiExportScalar;
  stopLoss?: AiExportScalar;
  takeProfits?: readonly AiExportScalar[] | null;
  riskReward?: AiExportScalar;
  positionSize?: AiExportScalar;
  invalidation?: AiExportScalar;
  planNotes?: readonly AiExportScalar[] | null;
}

/** Raw indicator values grouped by category (values copied verbatim). */
export interface MarketSnapshotExportInput {
  symbol?: AiExportScalar;
  timeframe?: AiExportScalar;
  categories?: Readonly<
    Record<string, Readonly<Record<string, AiExportScalar>> | null | undefined>
  > | null;
}

export interface AiExportDecisionStep {
  step?: AiExportScalar;
  result?: AiExportScalar;
  detail?: AiExportScalar;
}

export interface SignalDecisionExportInput {
  decision?: AiExportScalar;
  direction?: AiExportScalar;
  confidence?: AiExportScalar;
  hardBlocked?: boolean | null;
  blockedReasons?: readonly AiExportScalar[] | null;
  flow?: readonly AiExportDecisionStep[] | null;
}

export interface AiExportMetric {
  label?: AiExportScalar;
  value?: AiExportScalar;
}

export interface UlAnalyticsExportInput {
  metrics?: readonly AiExportMetric[] | null;
  insights?: readonly AiExportScalar[] | null;
}

export interface AiExportJournalEntry {
  tradeId?: AiExportScalar;
  coin?: AiExportScalar;
  side?: AiExportScalar;
  result?: AiExportScalar;
  pnl?: AiExportScalar;
  note?: AiExportScalar;
}

export interface JournalExportInput {
  entries?: readonly AiExportJournalEntry[] | null;
}

export interface SummaryExportInput {
  overallDecision?: AiExportScalar;
  keyFindings?: readonly AiExportScalar[] | null;
  openQuestions?: readonly AiExportScalar[] | null;
}

/** Full frozen input for one AI Export run. */
export interface AiExportInput {
  metadata?: AiExportMetadata | null;
  ruleBook?: RuleBookExportInput | null;
  scoreEngine?: ScoreEngineExportInput | null;
  entryQuality?: EntryQualityExportInput | null;
  positionAdviser?: PositionAdviserExportInput | null;
  tradePlan?: TradePlanExportInput | null;
  marketSnapshot?: MarketSnapshotExportInput | null;
  signalDecision?: SignalDecisionExportInput | null;
  ulAnalytics?: UlAnalyticsExportInput | null;
  journal?: JournalExportInput | null;
  summary?: SummaryExportInput | null;
}

/** Body of one domain document — lines for each standard section. */
export interface AiDocumentBody {
  input: readonly string[];
  analysis: readonly string[];
  decision: readonly string[];
  output: readonly string[];
  checklist: readonly string[];
  warnings: readonly string[];
  notes: readonly string[];
}

/** One generated Markdown file. The framework never writes to disk. */
export interface AiExportFile {
  fileName: string;
  markdown: string;
}

export interface AiExportResult {
  version: 1;
  files: readonly AiExportFile[];
}
